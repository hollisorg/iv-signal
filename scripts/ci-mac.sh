#!/usr/bin/env bash
# The macOS checks GitHub runs after building IV Signal (.github/workflows/mac.yml), on Apple Silicon and Intel. Each
# check's output goes to ci-out/<name>.log; a summary prints at the end and the script fails if any check failed.
# (From IV Studio's scripts/ci-mac.sh.)
set -u
OUT="$PWD/ci-out"
mkdir -p "$OUT"
APP="$(ls -d dist/mac*/IV\ Signal.app | head -n 1)"
BIN="$APP/Contents/MacOS/IV Signal"
results=()
run() {
  local name="$1"; shift
  echo "::group::$name"
  if "$@" >"$OUT/$name.log" 2>&1; then results+=("ok   $name"); else results+=("FAIL $name"); fi
  tail -n 25 "$OUT/$name.log"
  echo "::endgroup::"
}

# the app bundle: the right architecture and a valid (ad-hoc) signature
run app-arch bash -c "file '$BIN' | grep -q '$(uname -m)'"
run app-signature codesign --verify --deep --strict "$APP"

# the unit tests (core, MCP with Allow cards, the Mac updater's parts)
run unit-tests npm test

# the packaged app on a throwaway data folder: its MCP server through the app's own binary in Node mode (lists the
# tools and drafts a post), then the window opens every page with no page errors and shows that post
# (the real screen a few seconds in, for the traffic lights and the title bar as macOS draws them)
(sleep 12; screencapture -x "$OUT/screen.png" 2>/dev/null) &
run packaged-check node scripts/packaged-check.mjs "$BIN" "$OUT/packaged"

# the Mac updater (src/main/macupdater.js), end to end: a copy of the app in a temporary folder finds a 9.9.9 on a local
# feed (this build with its version changed, signed again ad hoc), downloads and checks it, swaps itself and opens
# again. The 9.9.9 copy that opens is stopped afterwards.
mac_update_selftest() {
  local U="$OUT/update" W="${TMPDIR:-/tmp}/iv-signal-update" ARCH ZIP PORT=8766 SHA SIZE HTTP i v ok=1
  rm -rf "$U" "$W"; mkdir -p "$U/apps" "$U/feed" "$U/new" "$U/data"
  ARCH=$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo x64 )
  ditto "$APP" "$U/apps/IV Signal.app"
  ditto "$APP" "$U/new/IV Signal.app"
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 9.9.9" -c "Set :CFBundleVersion 9.9.9" "$U/new/IV Signal.app/Contents/Info.plist"
  codesign --force --deep -s - "$U/new/IV Signal.app"
  ZIP="IV-Signal-mac-$ARCH.zip"
  (cd "$U/new" && ditto -c -k --keepParent "IV Signal.app" "$U/feed/$ZIP")
  SHA=$(openssl dgst -sha512 -binary "$U/feed/$ZIP" | base64 | tr -d '\n')
  SIZE=$(stat -f%z "$U/feed/$ZIP")
  printf 'version: 9.9.9\nfiles:\n  - url: %s\n    sha512: %s\n    size: %s\npath: %s\nsha512: %s\nreleaseDate: "2026-01-01T00:00:00.000Z"\n' "$ZIP" "$SHA" "$SIZE" "$ZIP" "$SHA" > "$U/feed/latest-mac.yml"
  cat "$U/feed/latest-mac.yml"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$U/feed" >"$U/http.log" 2>&1 &
  HTTP=$!
  for i in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/latest-mac.yml" >/dev/null && break; sleep 1; done
  IV_SIGNAL_UPDATE_FEED="http://127.0.0.1:$PORT" IV_SIGNAL_UPDATE_SELFTEST=1 IV_SIGNAL_DATA_DIR="$U/data" \
    "$U/apps/IV Signal.app/Contents/MacOS/IV Signal" >"$U/app.log" 2>&1 &
  for i in $(seq 1 120); do
    v=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$U/apps/IV Signal.app/Contents/Info.plist" 2>/dev/null)
    if [ "$v" = 9.9.9 ] && pgrep -f "$U/apps/IV Signal.app/Contents/MacOS/IV Signal" >/dev/null; then ok=0; break; fi
    sleep 2
  done
  echo "after $i checks: version ${v:-none}"
  cat "$W/update.log" 2>/dev/null
  [ -e "$U/apps/IV Signal.app.iv-old" ] && { echo "the old copy was left behind"; ok=1; }
  grep -q 'installed$' "$W/update.log" 2>/dev/null || { echo "no 'installed' in the log"; ok=1; }
  grep -q 'opened$' "$W/update.log" 2>/dev/null || { echo "no 'opened' in the log"; ok=1; }
  codesign --verify --deep --strict "$U/apps/IV Signal.app" || ok=1
  pkill -f "$U/apps/IV Signal.app/Contents/MacOS/IV Signal" 2>/dev/null
  kill "$HTTP" 2>/dev/null
  return $ok
}
run mac-update-selftest mac_update_selftest

echo
printf '%s\n' "${results[@]}" | tee "$OUT/summary.txt"
! grep -q '^FAIL' "$OUT/summary.txt"
