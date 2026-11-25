# Synchronizing GitHub and Guildfall Sites

GitHub `main` is the development source. Codex uses the Sites plugin to publish a matching copy to the existing Guildfall URL. This is an agent-assisted workflow, not a GitHub webhook or background service.

The helper needs Python 3 and Git. The app itself has no build dependencies. Run the commands below from the GitHub checkout; replace example paths and IDs with actual values returned by the tools.

## Compare the two copies

Fetch GitHub and use the installed Sites skill's opening workflow to refresh a **separate** Sites source checkout. Then:

```sh
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout status
```

`equal` means both committed copies match, `github-only` or `site-only` identifies the changed side relative to the baseline, and `conflict` means both sides differ. Uncommitted changes are excluded from status; staging refuses dirty checkouts. Changes outside the application and hosting manifest are excluded.

## Bring changes back from Sites

Before starting application work, preserve any independent Site changes:

```sh
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout stage --direction from-site
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout stage --direction from-site --apply
git diff
```

Review and commit the import. If the destination has independent changes, the entire operation stops before copying. There is no force option. Merge conflicts in GitHub manually, commit the reviewed resolution, then apply that resolution to the Sites checkout and commit it there. Rerun comparison; matching files are accepted even when both differ from the baseline. Do not edit the baseline merely to bypass a conflict.

## Prepare a release for Sites

Validate the application, commit the release, push to GitHub `main`, and fetch `origin`. Both checkouts must be clean. The helper requires GitHub `HEAD` to match the fetched `origin/main`.

```sh
node --input-type=module --check < dist/engine.js
node --input-type=module --check < dist/table.js
git diff --check
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout stage --direction to-site
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout stage --direction to-site --apply
```

Only tracked regular files beneath `dist/` and `.openai/hosting.json` are synchronized. Removed files are deleted from the destination if unchanged there since the baseline. Unknown destination changes, symlinks, ignored-file collisions, unexpected project identities, and a missing `dist/index.html` stop the operation. File/directory restructuring may need manual reconciliation. Keep GitHub documentation and helper files out of the Site checkout.

The helper does **not** fetch, commit, push, obtain credentials, package, or deploy. After staging, Codex follows the installed Sites skill to validate, commit/push the Site source, package it, save a version, and deploy. Preserve Site access settings. Source synchronization alone does not change the live website.

## Record a successful deployment

After the native Sites result confirms success, record its exact identifiers:

```sh
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout record \
  --github-commit GITHUB_RELEASE_SHA \
  --site-commit SITES_SOURCE_SHA \
  --version-id SAVED_VERSION_ID \
  --deployment-id DEPLOYMENT_ID \
  --url https://guildfall-table.beyond-norma-4691.chatgpt.site \
  --confirmed-success
git add .openai/sync-state.json
git commit -m "Record Guildfall deployment"
git push origin main
```

The two commits must be the current checkout heads and contain byte-identical application source and hosting configuration. The helper verifies this mapping; it cannot query or independently verify deployment success. `--confirmed-success` is an assertion based on the native result, not an instruction to deploy. Never use it after a pending or failed deployment.

The tracking commit naturally follows the deployed GitHub release commit. This does not mean the app is out of sync: status compares source contents. The initial baseline records the verified source import and has `last_deployment: null`; it does not claim that a new deployment was performed.

If a deployment succeeds but recording fails, retain its returned identifiers, resolve the local mismatch, and record the existing result only if the source still matches. Do not deploy again just to obtain another record. If an apply operation is interrupted, inspect and preserve its partial diff before retrying; do not discard unrelated work.

## Verify the helper

```sh
python3 -m unittest discover -s tests
```

These tests use temporary Git repositories and do not contact GitHub or Sites. No deployment credentials belong in this repository. Runtime data, secrets, permissions, and browser saves are outside the sync scope.
