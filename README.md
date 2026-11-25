# Card-Game · Guildfall

Developing a card game combining Splendor with Dominion. Guildfall is a browser-based deck-building game with permanent assets, rival attacks, solo CPU opponents, and local pass-and-play.

[Hosted Guildfall table](https://guildfall-table.beyond-norma-4691.chatgpt.site/) · [GitHub repository](https://github.com/TallData/Card-Game)

## Run locally

No dependencies or build step are required. From the repository root:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. Serve the files over HTTP because the application uses JavaScript modules.

## Code map

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Game table structure, marketplace, hand, assets, and dialogs. |
| `dist/table.css` | Visual styling and responsive layouts. |
| `dist/table.js` | Rendering, user interactions, game setup, browser saves, and CPU scheduling. |
| `dist/engine.js` | Card definitions, game state, play/buy/build rules, attacks, turns, scoring, and CPU decisions. |
| `.openai/hosting.json` | Existing ChatGPT Sites project identity and static deployment directory. |

The files in `dist/` are the maintained source, not generated build artifacts. Game progress and expansion access are stored in the current browser's local storage; they are not shared between devices or origins. Pass-and-play uses one browser.

## Source and hosting

This repository imports the existing Guildfall Sites source from commit `14e69f09285f6ff89e2af49e5149f4f6b50dd181`. The four application files and hosting manifest were copied without modification. The repository's existing history and Apache 2.0 license are retained.

GitHub is the development repository. The hosted Site retains its own source repository and access settings. Pushing to GitHub does **not** automatically deploy to ChatGPT Sites, and edits made through Sites do **not** automatically appear here.

Future Codex work follows [AGENTS.md](AGENTS.md). The [sync guide](docs/site-sync.md) documents the full workflow and recovery steps.

The helper previews or applies source changes in either direction, detects conflicting edits, and records the GitHub/Sites commit pair after a verified deployment:

```sh
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout status
python3 scripts/sync_site.py --site-checkout /absolute/path/to/site-checkout stage --direction to-site
```

Staging is a preview unless `--apply` is supplied. Refresh both repositories first. The helper does not deploy or handle credentials; Codex completes publication through the Sites plugin. Repository tooling and documentation changes do not require a Site deployment.

Do not commit Sites credentials, local environment files, or browser save data.

## License

See [LICENSE](LICENSE) for the repository's Apache License 2.0.
