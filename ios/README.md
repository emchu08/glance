# Glance iPhone companion (ios/)

The companion provides transport between supported Meta glasses and the Glance web lens:
Meta registration (Wearables Device Access Toolkit), camera frames → relay, display mirroring of the
600×600 lens (WKWebView snapshot bridge), temple/D-pad input → lens actions, and handoff links.

## Build

1. `brew install xcodegen` then `cd ios && xcodegen generate` → `Glance.xcodeproj`.
   (Generate once and commit the project if you want to open it without XcodeGen.)
2. Open `Glance.xcodeproj` in Xcode 16+, set your Development Team, and build the `Glance` scheme.
3. Simulator: ad hoc signing is configured for Debug because the DAT SDK needs a keychain entitlement.
4. Set `GLANCE_API_BASE` (Debug defaults to `http://localhost:3100`; Release uses the deployed HTTPS origin),
   `META_APP_ID`, and `META_CLIENT_TOKEN` in `project.yml` or the target's build settings.

## Package resolution (honest status)

- `project.yml` declares the Meta Wearables DAT Swift package. Resolve the current official package URL and a
  verified release from Meta's developer documentation before building; the URL in `project.yml` is a placeholder
  to be confirmed. When the package resolves, `GlassesTransport.swift` compiles the `DATTransport` adapter
  (`#if canImport(MWDATCore)`); its `TODO(DAT)` calls are where the documented registration, camera, display and
  input APIs are wired.
- Without the package, the app builds and runs with `PhoneCameraTransport`: iPhone camera → relay → lens.
  It reports "Meta AI app not installed" rather than pretending a registration happened.

## Transport limits

The WKWebView snapshot path requires the companion in the foreground. Locked-phone or force-quit operation is
not claimed. Snapshots are event-driven and coalesced (~90 ms settle), not a 60 fps loop.

## Tests

`scripts/ios-startup-test.sh [UDID]` builds in a temporary copy and launches on a booted Simulator.
Unit tests live in `Glance/Tests`.
