#!/usr/bin/env python3
"""Compare/stage committed Guildfall source. Never authenticates or deploys."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

PROJECT = "appgprj_6b05326f47dc81919eadcf6e730ffd66"
SITE_URL = "https://guildfall-table.beyond-norma-4691.chatgpt.site"
STATE = ".openai/sync-state.json"


def git(root, *args):
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True)
    if result.returncode:
        raise ValueError(f"Git operation failed: {' '.join(args)}")
    return result.stdout


def repository(path):
    root = Path(path).resolve()
    if Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() != root:
        raise ValueError("Pass the repository root, not a subdirectory.")
    return root


def commit(root, ref):
    return git(root, "rev-parse", "--verify", f"{ref}^{{commit}}").decode().strip()


def snapshot(root, ref="HEAD"):
    sha = commit(root, ref)
    files = {}
    for entry in git(root, "ls-tree", "-rz", sha).split(b"\0"):
        if not entry:
            continue
        meta, raw_path = entry.split(b"\t", 1)
        path = raw_path.decode("utf-8")
        if path != ".openai/hosting.json" and not path.startswith("dist/"):
            continue
        mode, kind, oid = meta.split()
        if mode not in (b"100644", b"100755") or kind != b"blob":
            raise ValueError(f"Only regular source files are supported: {path}")
        files[path] = git(root, "cat-file", "blob", oid.decode())
    manifest = json.loads(files.get(".openai/hosting.json", b"{}"))
    if manifest.get("project_id") != PROJECT or manifest.get("static", {}).get("directory") != "dist":
        raise ValueError("Unexpected Site identity or static directory; reconcile manually.")
    if "dist/index.html" not in files:
        raise ValueError("Source must include dist/index.html.")
    return sha, files


def hashes(files):
    return {path: hashlib.sha256(data).hexdigest() for path, data in sorted(files.items())}


def load_state(root):
    state = json.loads((root / STATE).read_text())
    if state.get("schema") != 1 or state.get("project_id") != PROJECT:
        raise ValueError("Invalid synchronization baseline.")
    for path, digest in state["files"].items():
        if (path != ".openai/hosting.json" and not path.startswith("dist/")) or ".." in Path(path).parts:
            raise ValueError("Invalid baseline path.")
        if not isinstance(digest, str) or len(digest) != 64:
            raise ValueError("Invalid baseline hash.")
    return state


def clean(root):
    if git(root, "status", "--porcelain", "--untracked-files=all"):
        raise ValueError(f"Commit or preserve pending changes before staging: {root}")


def safe_target(root, path):
    target = root / path
    for part in [target, *target.parents]:
        if part == root:
            break
        if part.is_symlink():
            raise ValueError(f"Refusing symlink destination: {path}")
    if target.exists() and not target.is_file():
        raise ValueError(f"Destination is not a regular file: {path}")
    for part in target.parents:
        if part == root:
            break
        if part.exists() and not part.is_dir():
            raise ValueError(f"Destination parent is not a directory: {path}")
    return target


def plan(base, source, dest):
    wanted, current = hashes(source), hashes(dest)
    changes, conflicts = [], []
    for path in sorted(set(base) | set(wanted) | set(current)):
        if wanted.get(path) == current.get(path):
            continue
        if current.get(path) != base.get(path):
            conflicts.append(path)
        changes.append({"path": path, "action": "delete" if path not in source else "write"})
    return changes, conflicts


def stage(args, github, site, state):
    clean(github)
    clean(site)
    gh_sha, gh_files = snapshot(github)
    site_sha, site_files = snapshot(site)
    if args.direction == "to-site":
        # Caller must fetch origin immediately before this check (see AGENTS.md).
        if gh_sha != commit(github, "origin/main"):
            raise ValueError("Push HEAD to origin/main and fetch before staging to Sites.")
        source, dest, target = gh_files, site_files, site
    else:
        source, dest, target = site_files, gh_files, github
    changes, conflicts = plan(state["files"], source, dest)
    result = {"github_commit": gh_sha, "site_commit": site_sha,
              "direction": args.direction, "changes": changes, "conflicts": conflicts,
              "applied": False}
    if conflicts:
        print(json.dumps(result, indent=2))
        raise ValueError("Destination has independent changes. Merge them manually; no files copied.")
    if args.apply:
        # Validate every destination before writing any files. Ignored files count too.
        targets = {item["path"]: safe_target(target, item["path"]) for item in changes}
        for path, file in targets.items():
            if path not in dest and file.exists():
                raise ValueError(f"Untracked/ignored destination would be overwritten: {path}")
        for item in changes:
            path = item["path"]
            file = targets[path]
            if item["action"] == "delete":
                file.unlink()
            else:
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(source[path])
        result["applied"] = True
    print(json.dumps(result, indent=2))


def record(args, github, site, state):
    gh_sha, gh_files = snapshot(github, args.github_commit)
    site_sha, site_files = snapshot(site, args.site_commit)
    if gh_sha != commit(github, "HEAD") or site_sha != commit(site, "HEAD"):
        raise ValueError("Record against the current checked-out commits only.")
    clean(github)
    clean(site)
    if gh_sha != commit(github, "origin/main"):
        raise ValueError("The GitHub release commit must match refreshed origin/main.")
    if hashes(gh_files) != hashes(site_files):
        raise ValueError("GitHub and deployed Site source differ; cannot record a match.")
    if args.url.rstrip("/") != SITE_URL:
        raise ValueError("Unexpected deployment URL; review the Site identity.")
    # Native Sites tools establish success. This helper validates the source mapping.
    state.update(github_commit=gh_sha, site_commit=site_sha, files=hashes(gh_files),
                 last_deployment={"version_id": args.version_id,
                                  "deployment_id": args.deployment_id,
                                  "url": args.url, "status": "succeeded"})
    path = github / STATE
    safe_target(github, STATE)
    path.write_text(json.dumps(state, indent=2) + "\n")
    print("Recorded matching source commits. Commit and push .openai/sync-state.json.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--site-checkout", required=True, help="Freshly opened Sites source repository root")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="Compare committed source against the last common baseline")
    staging = commands.add_parser("stage", help="Preview source changes; --apply writes them")
    staging.add_argument("--direction", choices=["to-site", "from-site"], required=True)
    staging.add_argument("--apply", action="store_true")
    recording = commands.add_parser("record", help="Record a deployment already verified by native Sites tools")
    for name in ["github-commit", "site-commit", "version-id", "deployment-id", "url"]:
        recording.add_argument(f"--{name}", required=True)
    recording.add_argument("--confirmed-success", action="store_true", required=True,
                           help="Only after the native deployment result reports success")
    args = parser.parse_args()
    github, site = repository(args.repo), repository(args.site_checkout)
    if github == site or github in site.parents or site in github.parents:
        raise ValueError("Use separate, non-nested GitHub and Sites checkouts.")
    state = load_state(github)
    if args.command == "stage":
        stage(args, github, site, state)
    elif args.command == "record":
        record(args, github, site, state)
    else:
        gh_sha, gh_files = snapshot(github)
        site_sha, site_files = snapshot(site)
        gh, remote, base = hashes(gh_files), hashes(site_files), state["files"]
        rows = []
        for path in sorted(set(base) | set(gh) | set(remote)):
            status = "equal" if gh.get(path) == remote.get(path) else (
                "site-only" if gh.get(path) == base.get(path) else
                "github-only" if remote.get(path) == base.get(path) else "conflict")
            rows.append({"path": path, "status": status})
        print(json.dumps({"github_commit": gh_sha, "site_commit": site_sha,
                          "committed_source_only": True, "files": rows}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        print(f"Sync stopped: {error}", file=sys.stderr)
        sys.exit(1)
