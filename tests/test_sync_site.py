"""Integration checks for sync safety, using disposable local Git repositories."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/sync_site.py"
PROJECT = "appgprj_6b05326f47dc81919eadcf6e730ffd66"


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.github, self.site = self.root / "github", self.root / "site"
        self.files = {
            ".openai/hosting.json": json.dumps({"project_id": PROJECT, "static": {"directory": "dist"}}),
            "dist/index.html": '<script type="module" src="engine.js"></script>',
            "dist/engine.js": "export const value = 1;\n",
            "dist/old.css": "body { color: black; }\n",
        }
        for repo in [self.github, self.site]:
            repo.mkdir()
            self.git(repo, "init", "-b", "main")
            self.git(repo, "config", "user.name", "Sync test")
            self.git(repo, "config", "user.email", "sync-test@example.invalid")
            self.git(repo, "config", "commit.gpgsign", "false")
            for path, content in self.files.items():
                self.write(repo, path, content)
            self.save(repo)
        self.state = {
            "schema": 1, "project_id": PROJECT,
            "github_commit": self.head(self.github), "site_commit": self.head(self.site),
            "files": {p: hashlib.sha256(c.encode()).hexdigest() for p, c in self.files.items()},
            "last_deployment": None,
        }
        self.write(self.github, ".openai/sync-state.json", json.dumps(self.state))
        self.save(self.github)
        self.pushed()

    def git(self, repo, *args):
        return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.PIPE).decode().strip()

    def write(self, repo, path, content):
        file = repo / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content)

    def save(self, repo):
        self.git(repo, "add", "-A")
        self.git(repo, "commit", "-m", "Fixture update")

    def head(self, repo):
        return self.git(repo, "rev-parse", "HEAD")

    def pushed(self):
        self.git(self.github, "update-ref", "refs/remotes/origin/main", self.head(self.github))

    def run_sync(self, *args, ok=True):
        result = subprocess.run([sys.executable, str(SCRIPT), "--repo", str(self.github),
                                 "--site-checkout", str(self.site), *args], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0 if ok else 1, result.stdout + result.stderr)
        return result

    def test_preview_apply_add_update_delete_and_repeat(self):
        self.write(self.github, "dist/engine.js", "export const value = 2;\n")
        self.write(self.github, "dist/assets/new.txt", "new asset")
        (self.github / "dist/old.css").unlink()
        self.save(self.github)
        self.pushed()
        args = ["stage", "--direction", "to-site"]
        preview = json.loads(self.run_sync(*args).stdout)
        self.assertEqual(len(preview["changes"]), 3)
        self.assertFalse(preview["applied"])
        self.assertTrue((self.site / "dist/old.css").exists())
        self.run_sync(*args, "--apply")
        self.assertFalse((self.site / "dist/old.css").exists())
        self.assertEqual((self.site / "dist/assets/new.txt").read_text(), "new asset")
        self.assertFalse((self.site / ".openai/sync-state.json").exists())
        self.save(self.site)
        self.assertEqual(json.loads(self.run_sync(*args).stdout)["changes"], [])

    def test_site_changes_can_be_imported(self):
        self.write(self.site, "dist/engine.js", "export const value = 3;\n")
        self.save(self.site)
        result = json.loads(self.run_sync("status").stdout)
        self.assertIn({"path": "dist/engine.js", "status": "site-only"}, result["files"])
        self.run_sync("stage", "--direction", "from-site", "--apply")
        self.assertEqual((self.github / "dist/engine.js").read_text(), "export const value = 3;\n")

    def test_conflict_stops_all_writes(self):
        self.write(self.site, "dist/engine.js", "Site change")
        self.save(self.site)
        self.write(self.github, "dist/engine.js", "GitHub change")
        self.write(self.github, "dist/new.txt", "must not be copied")
        self.save(self.github)
        self.pushed()
        result = self.run_sync("stage", "--direction", "to-site", "--apply", ok=False)
        self.assertIn("dist/engine.js", result.stdout)
        self.assertFalse((self.site / "dist/new.txt").exists())
        self.assertEqual((self.site / "dist/engine.js").read_text(), "Site change")

    def test_site_only_edit_is_not_overwritten(self):
        self.write(self.site, "dist/engine.js", "Site change")
        self.save(self.site)
        self.run_sync("stage", "--direction", "to-site", "--apply", ok=False)
        self.assertEqual((self.site / "dist/engine.js").read_text(), "Site change")

    def test_dirty_checkout_is_rejected(self):
        self.write(self.site, "notes.txt", "user work")
        result = self.run_sync("stage", "--direction", "to-site", "--apply", ok=False)
        self.assertIn("pending changes", result.stderr)

    def test_unpushed_release_is_rejected(self):
        self.write(self.github, "dist/engine.js", "not pushed")
        self.save(self.github)
        result = self.run_sync("stage", "--direction", "to-site", ok=False)
        self.assertIn("origin/main", result.stderr)

    def test_ignored_destination_collision_is_preserved(self):
        self.write(self.site, ".gitignore", "dist/new.txt\n")
        self.save(self.site)
        self.write(self.site, "dist/new.txt", "local ignored data")
        self.write(self.github, "dist/new.txt", "new source")
        self.save(self.github)
        self.pushed()
        self.run_sync("stage", "--direction", "to-site", "--apply", ok=False)
        self.assertEqual((self.site / "dist/new.txt").read_text(), "local ignored data")

    def test_symlink_directory_cannot_escape_checkout(self):
        self.write(self.site, ".gitignore", "dist/assets\n")
        self.save(self.site)
        outside = self.root / "outside"
        outside.mkdir()
        (self.site / "dist/assets").symlink_to(outside, target_is_directory=True)
        self.write(self.github, "dist/assets/new.txt", "new source")
        self.save(self.github)
        self.pushed()
        result = self.run_sync("stage", "--direction", "to-site", "--apply", ok=False)
        self.assertIn("symlink", result.stderr)
        self.assertFalse((outside / "new.txt").exists())

    def test_wrong_project_is_rejected(self):
        self.write(self.site, ".openai/hosting.json", json.dumps({"project_id": "wrong", "static": {"directory": "dist"}}))
        self.save(self.site)
        self.run_sync("status", ok=False)

    def record_args(self):
        return ["record", "--github-commit", self.head(self.github), "--site-commit", self.head(self.site),
                "--version-id", "test-version", "--deployment-id", "test-deployment",
                "--url", "https://guildfall-table.beyond-norma-4691.chatgpt.site", "--confirmed-success"]

    def test_record_matching_source(self):
        self.run_sync(*self.record_args())
        state = json.loads((self.github / ".openai/sync-state.json").read_text())
        self.assertEqual(state["last_deployment"]["deployment_id"], "test-deployment")
        self.assertEqual(state["github_commit"], self.head(self.github))

    def test_record_rejects_mismatched_source(self):
        self.write(self.site, "dist/engine.js", "different source")
        self.save(self.site)
        self.run_sync(*self.record_args(), ok=False)
        self.assertEqual(json.loads((self.github / ".openai/sync-state.json").read_text()), self.state)


if __name__ == "__main__":
    unittest.main()
