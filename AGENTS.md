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
node scripts/e2e.mjs <out-dir>                 # click-through on three made-up brands: setup, Brand Brain, Create, Approve, Calendar, Library, Networks, Settings, tour (22 steps)
node scripts/chat-e2e.mjs <out-dir> [claude,codex,hermes]  # real chat turns; the test clicks Allow and Don't allow in the window
node scripts/facebook-check.mjs <out-dir>      # Networks tiles and pop-ups, Facebook connect/schedule/post now/cancel against a stand-in Graph API, tour walks (12 steps)
node scripts/release.mjs --unsigned [--dry]    # tests, build, installer, packaged check, tag, push, private release (signs when the Azure values are set; docs/CODE-SIGNING.md)
```

## Releases and updates

- **Code is private** (github.com/hollisorg/iv-signal). **Releases are public** in the releases-only repo
  github.com/hollisorg/iv-signal-releases (Matt, 2026-11-13: "it should update on its own without a github key"). That repo
  holds only a README and the release files (installer, blockmap, `latest.yml`); never push source there. The installer
  itself is public, and its app.asar is readable like any Electron app.
- The app updates itself with electron-updater's GitHub provider on that public repo (`src/main/updater.js`), no key or
  sign-in: on launch and every six hours it downloads in the background; "Restart to update" (Settings → Updates, or the
  sidebar button) or quitting installs. 0.1.1 to 0.1.7 read the private repo and needed a key; a copy on those versions
  needs one manual install of 0.1.8 or later. **Every release from 0.1.8 on must go to hollisorg/iv-signal-releases** (scripts/release.mjs does it); a release only on the private repo never reaches anyone.
- To release: bump `version` in package.json, write `dist/notes-<version>.md`, commit, then `node scripts/release.mjs --unsigned`
  (tests, build, installer, packaged check, tag and push to the private repo, release on hollisorg/iv-signal-releases).
  To test the update itself: build an older label with
  `npx.cmd electron-builder --win --x64 --dir --publish never -c.extraMetadata.version=0.1.0 -c.directories.output=<dir>`,
  copy `dist/win-unpacked/resources/app-update.yml` into it, and run `scripts/update-check.mjs` (it sets
  `IV_SIGNAL_UPDATE_NO_INSTALL=1`; add `IV_SIGNAL_UPDATE_FEED=http://127.0.0.1:<port>/` with `dist` served locally to test before publishing). Afterwards delete only `%LOCALAPPDATA%\iv-signal-updater\pending`; `installer.exe` there
  belongs to the real install.

## Snapshot (2026-11-13)

- **v0.1.4 is the latest private release** (2026-11-13, unsigned, installer SHA-256 `39fb0998…`, the downloaded release file matches the build). It adds:
  - **Networks:** one tile per network with its logo (Simple Icons, CC0; LinkedIn is a drawn "in" tile because Simple Icons dropped it); Connect/Manage opens a pop-up with the account and how posting works there.
  - **Facebook Page publishing** (`src/service/meta.js`): the person pastes a Page access token made in Graph API Explorer; it's checked (`/me` must be a Page), kept with safeStorage per brand (`settings.meta[brand_id].tokenEnc`, never returned by `appSettings`) and sent only as a Bearer header. Approved Facebook versions are scheduled on Facebook itself (`published=false` + `scheduled_publish_time`, 11 min to 29 days ahead) from the Calendar, or posted now after a confirm; pictures go up through `/photos`, videos stay by hand. `deliveries` (migration 3) records each hand-off; a scheduled version can't be edited, removed or archived until it's cancelled; every 3 minutes the app asks Facebook about due ones and marks them posted with the link. Agents have no publish tool, on purpose. Instagram needs pictures at a public address, so it waits for the server.
  - **Make a picture** with the person's Codex (`src/service/pictures.js`), **From IV Studio** imports (`src/service/ivstudio.js`, through IV Studio's MCP `list_renders`/`list_images` plus its Videos folders), **results** per posted version (`results`, migration 2; MCP `signal_results`, `signal_record_results`), and **approval packs** (`src/service/approvalpack.js`, one self-contained HTML page).
  - Tours for each; MCP now 37 tools.
- The **Infinite Variance** brand is set up in Matt's real IV Signal (2026-11-12, through the installed MCP): profile, Never say list, 11 Brand Brain notes from infinitevariance.ai and the approved slogans, X/Instagram/YouTube/LinkedIn, the "IV Studio and IV Academy push" campaign and 7 library items (1.1 trailer, 1.1.7 demo, 5 README screenshots).
- Verified for 0.1.4: 12/12 unit tests (new `test/features.test.mjs`: results, delivery locks, channel status, approval pack escaping, picture prompt, meta.js against a stand-in Graph API); ui-check clean; `e2e.mjs` 22/22; `facebook-check.mjs` 12/12; packaged check (37 tools, 8 pages, version 0.1.4).
- Not verified: a real Facebook Page (needs Matt's token), a real Codex picture run inside the app, a real IV Studio import into Matt's data from the window, signing, Mac/Linux.
- Matt's PC runs **0.1.2**; it picks up 0.1.4 by itself once Settings → Updates has a key or the GitHub CLI option.

## Next

Matt: choose the update key source (then 0.1.4 installs itself), paste a Facebook Page token on Networks → Facebook to post directly, and set up Azure Artifact Signing (docs/CODE-SIGNING.md). Then the PostingPilot server for Instagram and the other networks once their reviews pass.

## IV Workspace integration (0.1.5, local build)
The IV Workspace top-bar button connects shared business basics and local creative handoffs. Incoming work opens as a native unapproved draft with selected media copied into the library. The shared store is separate; credentials, Never say rules and approvals stay local to Signal. See docs/iv-workspace.md. Tests add native import idempotency and rollback. Publication status is recorded separately; this source note does not establish a released or installed version.
