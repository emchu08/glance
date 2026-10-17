#!/usr/bin/env bash
# Builds the Glance iOS companion for the Simulator in a temporary copy so a developer's signing
# choices are untouched, then launches it and checks that the app process starts.
#   scripts/ios-startup-test.sh [SIMULATOR_UDID]
set -euo pipefail
UDID="${1:-$(xcrun simctl list devices booted -j | python3 -c 'import sys,json; d=json.load(sys.stdin)["devices"]; print(next((x["udid"] for v in d.values() for x in v if x["state"]=="Booted"), ""))')}"
if [ -z "$UDID" ]; then echo "No booted simulator. Boot one or pass a UDID."; exit 2; fi
if ! command -v xcodegen >/dev/null; then echo "xcodegen not found (brew install xcodegen). Open ios/Glance.xcodeproj if present instead."; fi
TMP="$(mktemp -d)"; cp -R ios "$TMP/ios"; cd "$TMP/ios"
if [ ! -d Glance.xcodeproj ]; then xcodegen generate; fi
xcodebuild -project Glance.xcodeproj -scheme Glance -destination "id=$UDID" -derivedDataPath build CODE_SIGNING_ALLOWED=NO build | tail -5
APP="$(find build -name 'Glance.app' -path '*iphonesimulator*' | head -1)"
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" com.glance.companion
sleep 3
xcrun simctl spawn "$UDID" launchctl list | grep -q glance && echo "Glance companion launched on $UDID" || { echo "Launch not detected"; exit 1; }
