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
```

## Snapshot (2026-11-12)

- Local repo `C:\Users\Matthew\iv-signal`, branch `main`, no remote, nothing committed yet (all files staged). Version
  0.1.0.
- Installer built: `dist\IV-Signal-Setup-0.1.0.exe`, 115 MB, SHA-256 `6763b5f8…58654e0b41`, **not code-signed**
  (Windows SmartScreen will warn). Per-user, lets the person choose the folder. **Installed on Matt's PC** 2026-11-12
  (his "Install it"): silent `/S /currentuser` through Explorer, exit 0, `%LOCALAPPDATA%\Programs\IV Signal`, version
  0.1.0.0, Desktop and Start menu shortcuts; installed app.asar matches the build; opened from the Desktop shortcut
  (parent explorer.exe), data in the real `%APPDATA%\IV Signal`. Not released.
- Verified: 6/6 tests; build; ui-check with no page errors and no overflow on any page at 1440 and 1100; one real
  Claude Code chat turn drafted a LinkedIn post from the Brand Brain in 23 s (created_by `chat:claude`, left as a draft);
  packaged-check: the packaged MCP lists 32 tools and drafts a post, and the packaged window (version 0.1.0) opens all
  8 pages with no page errors and shows that post. The bundle holds the MCP SDK's full dependency tree.
- Not verified: running the installer itself, Codex and Hermes chat turns, Mac and Linux, dragging files from Explorer
  into the Library, the Allow card in the window (tested at the MCP layer).

## Next

Matt's review of 0.1.0 (install with his OK). Then the connection to the PostingPilot backend for publishing once the
network reviews pass (see the build plan's Phase 0 to 2). Code signing and a self-updater (IV Studio's pattern) before
anyone else gets it.
