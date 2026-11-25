# Guildfall repository instructions

## Source of truth and scope

- Use `TallData/Card-Game` on GitHub as the development source of truth. The production branch is `main`.
- The maintained application is buildless: `dist/index.html`, `dist/table.css`, `dist/table.js`, and `dist/engine.js`. Track any new application assets under `dist/`.
- `.openai/hosting.json` identifies the existing Guildfall Site. Preserve its project ID, static directory, other configuration, and existing audience. Never create a replacement Site to publish this repository.
- GitHub and Sites have separate histories. Never force-push, replace either history, or use `git push --mirror` to synchronize them.
- Read the installed Sites skill before opening or publishing Site source. Discover the current plugin path; do not hard-code a developer's machine path.

## Every application change

1. Check Git status, fetch `origin`, and reconcile with `origin/main` without discarding pending user work.
2. Read the existing Site and obtain fresh source credentials through native Sites tools. Open its source with the installed Sites workflow helper, using a separate, non-nested checkout. Retain the complete opening result. Do not store credentials in files, Git configuration, command arguments, or logs; pass them through the documented hidden stdin flow. For `work_proxy`, use its returned authentication mode without a token.
3. Run `scripts/sync_site.py --site-checkout <absolute-checkout> status`. It compares committed files only. If Sites contains changes absent from GitHub, preview `stage --direction from-site`, inspect the diff, then apply with `--apply` and commit the import before developing. If both sides changed a file differently, reconcile manually in GitHub and commit it, then copy the reviewed resolution into the Sites checkout and commit it there before rerunning the helper. No override flag exists.
4. Implement and validate the requested change. Run JavaScript syntax checks and relevant behavior checks. Run `python3 -m unittest discover -s tests` when changing the sync helper. Do not install dependencies or build the static app unnecessarily.
5. Commit and push the application release to GitHub `main` using the repository's permitted review flow. Respect branch protections. Fetch `origin` again; `HEAD` must match `origin/main` before staging a release. If a pull request is required and cannot yet be merged, report that state and do not deploy an unmerged release.
6. With both checkouts clean, preview `stage --direction to-site`, review the plan, and repeat with `--apply`. The helper copies only `dist/` and `.openai/hosting.json`; deletions are included. Review the resulting Site diff. It does not commit, push, authenticate, or deploy.
7. Use the installed Sites workflow helper to commit/push and package that exact source, passing the complete opening result, fresh credentials, remaining validation commands, and an absolute archive path. Use the returned **Site commit**, not the GitHub commit, for native save/deploy calls. Select the deployment tool from the Site's current access policy and preserve that audience.
8. Wait for a successful terminal deployment result. Only then run `record` with the actual GitHub commit, Site commit, saved version ID, deployment ID, returned URL, and `--confirmed-success`. The helper verifies matching source bytes; the native tool result is the authority for deployment success. Commit and push the resulting `.openai/sync-state.json` as a separate tracking commit. This tracking-only commit does not require another deployment.
9. Report the GitHub release commit and deployed URL. If publication fails, report that GitHub is ahead of the live Site; do not record success. Resume an existing saved version/deployment when supported rather than duplicating it.

Follow explicit user requests for local-only, no-push, save-only, or no-deploy work. Documentation, instructions, tests, helper changes, and tracking-only changes do not alter the hosted application and do not require redeployment. Do not treat this file as authorization for unrelated changes or publishing.

## Helper contract

Read [docs/site-sync.md](docs/site-sync.md) for commands and recovery. Refresh both remote sources immediately before synchronization; the helper performs no network operations. It uses `.openai/sync-state.json` as the last common content baseline, stops on independent destination edits, requires clean checkouts before copying, and defaults to a preview. Never silently reset its baseline to suppress conflicts.

Keep tokens, environment files, browser saves, archives, and local Sites checkout state out of Git. Synchronization covers application source only, not runtime data, visitor permissions, secrets, or browser local storage.
