# IV Signal: agent context

Read this before working here, and keep it current in the same change when the snapshot, rules or next step change.

## What it is

IV Signal is the Infinite Variance marketing workstation, another product in the IV line with IV Studio's and
IV Outreach's look and way of working. Brief: `Downloads\IV_Signal_Product_Build_and_Brand_Brief.docx`; plan:
`Downloads\Projects & Brands\Infinite Variance\IV Signal\IV Signal build plan.md`. Owner: Matthew Hollis.

- **Brand Brain** per brand: a structured profile (offer, audience, voice, products, visual standards, hashtags, goal,
  website, location) plus a "Never say" list and notes (fact, voice, rule, lesson, reference) with who added them.
- **Create**: one idea, one version per network (Facebook, Instagram, LinkedIn, X, Threads, TikTok, YouTube, Pinterest,
  Google Business Profile), each checked for the network's limit, the media it needs and the Never say list.
- **Approve**: approval is tied to the exact words, media (by SHA-256) and times. Any later edit withdraws it.
- **Calendar**: four weeks by day; **Ready to post**: approved versions due within a day.
- **Library**: pictures and videos copied into the app's own folder by hash.
- **Networks**: where each brand posts. **Publishing is by hand**: Copy & open puts the words on the clipboard and
  opens the network; the person posts and marks it posted with the link. Never call a post scheduled or published until
  it shows "posted".
- **Chat**: the person's own Claude Code, Codex or Hermes (IV Studio's harness, ported through IV Outreach), with IV
  Signal's MCP tools plus web search and page reading. Approving, marking posted, skipping, archiving, removing notes,
  adding files from the PC and changing the Never say list wait for an Allow card.

## Architecture (same as IV Outreach)

- `src/core/`: plain ESM over `node:sqlite`, one file `%APPDATA%\IV Signal\signal.db` (override `IV_SIGNAL_DATA_DIR`),
  WAL, shared by the app and the MCP server. Every change is logged in `events` with its actor: `person`,
  `chat:<engine>` or `agent`.
- `src/mcp/server.js`: stdio MCP server, tools prefixed `signal_` (32). Agents launch it with the app's own Electron
  binary and `ELECTRON_RUN_AS_NODE=1`.
- `src/main`, `src/preload`, `src/renderer`: Electron + electron-vite + React. One allowlisted `ivsignal:call` bridge.
  Library files reach the window through `ivmedia://<sha>.<ext>` (media folder only).
- `src/service/`: harness, agent install and sign-in, chat, Hermes ACP, visual guidance (`ui-guide.js`), the welcome flow.
  Ported from IV Outreach (Matt's own code, which was ported from IV Studio, MIT).
- Art: six Codex illustrations in the IV printmaking style (`docs/art.md`); masters in `C:\Users\Matthew\iv-signal-art`.
  Icon drawn in code: `build/icon.svg` (IV eye plus coral broadcast waves), rendered by `npx electron scripts/render-icon.cjs`.

## Rules

- No social posting automation and no scraping. Publishing will come through official APIs on the PostingPilot developer
  apps (owned by Hollis) once the network reviews pass; until then, by hand.
- No GHL anywhere (Matt, 2026-11-12).
- Never invent facts, testimonials, prices, results or customers in drafts; the chat prompt and MCP instructions say so.
- Keep data on the PC. Don't send brand data anywhere except to the agent the person chose.
- UI changes update `src/renderer/src/guides.js` (the How this works tours and the places the chat can spotlight).

## Validation

```powershell
npm.cmd install
npm.cmd test                                   # core + MCP (incl. Allow cards), no network
npm.cmd run build
node scripts/ui-check.mjs <out-dir>            # built app, fictional brand, every page at 1440 and 1100 wide, no page errors
node scripts/ui-check.mjs <out-dir> --empty    # first run
node scripts/chat-check.mjs claude <out-dir>   # one real chat turn on your own Claude Code (or codex / hermes)
npm.cmd run dist                               # dist\IV-Signal-Setup-<version>.exe (unsigned, per-user NSIS)
node scripts/packaged-check.mjs                # packaged exe: MCP through ELECTRON_RUN_AS_NODE, then the window, on test data
node scripts/update-check.mjs <older exe>      # a never-installing older copy must find, download and verify the latest release
```

## Releases and updates

- Code and releases are **private** (Matt's choice, 2026-11-12): github.com/hollisorg/iv-signal. No public download.
- The app updates itself with electron-updater's private GitHub provider (`src/main/updater.js`): on launch and every six
  hours it downloads in the background; "Restart to update" (Settings → Updates, or the sidebar button) or quitting
  installs. Each PC needs a read key: a fine-grained token with Contents read-only on that repo, pasted in Settings →
  Updates (checked against GitHub, then stored with safeStorage as `updateKeyEnc`), or the GitHub CLI sign-in
  (`updateUseGh`, read with `gh auth token` at each check, never stored).
- To release: bump `version` in package.json, `npm.cmd test`, `npm.cmd run dist`, `node scripts/packaged-check.mjs`, commit,
  tag `v<version>`, push both, then
  `gh release create v<version> dist/IV-Signal-Setup-<version>.exe dist/IV-Signal-Setup-<version>.exe.blockmap dist/latest.yml --repo hollisorg/iv-signal`.
  To test the update itself: build an older label with
  `npx.cmd electron-builder --win --x64 --dir --publish never -c.extraMetadata.version=0.1.0 -c.directories.output=<dir>`,
  copy `dist/win-unpacked/resources/app-update.yml` into it, and run `scripts/update-check.mjs` (it sets
  `IV_SIGNAL_UPDATE_NO_INSTALL=1`). Afterwards delete only `%LOCALAPPDATA%\iv-signal-updater\pending`; `installer.exe` there
  belongs to the real install.

## Snapshot (2026-11-12)

- Repo pushed to private github.com/hollisorg/iv-signal (`main`). Releases: v0.1.1 (the updater) and **v0.1.2
  (latest)**: Settings opens before any brand exists, so a key can be added first. 0.1.2 installer SHA-256
  `b066ce62…0e0018a89b`, unsigned.
- Matt's PC runs **0.1.2** (installed by hand 2026-11-12 on his "Install 0.1.2": 0.1.0 closed normally first, silent per-user install through Explorer, exit 0, version 0.1.2.0, installed app.asar matches the build, `app-update.yml` present, reopened from the Desktop shortcut). Its updates need his key choice in Settings → Updates (a pasted key or the GitHub CLI option); until then it shows "Needs a key".
- Verified: 6/6 tests; build; ui-check (every page at 1440 and 1100, no errors or overflow); a real Claude Code chat turn;
  packaged-check on 0.1.2 (MCP 32 tools, all 8 pages); real updates from the private repo: a never-installing copy
  labelled 0.1.0 found, downloaded and verified 0.1.1 (18 s) and then 0.1.2 (15 s) using the GitHub CLI sign-in; 0.1.2
  itself reports "current".
- Not verified: an installed copy actually installing an update (the test copies are set never to install), a pasted
  fine-grained key (the CLI path was used), Codex and Hermes chat turns, Mac and Linux, file drops from Explorer, the
  Allow card in the window.

## Next

Matt picks his key source in Settings → Updates; the next release is the first real self-update on his PC.
Then the PostingPilot backend for publishing once the network reviews pass (build plan Phases 0 to 2), and code signing.
