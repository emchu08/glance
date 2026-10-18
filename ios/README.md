# Glance iPhone companion

The companion uses Meta Wearables DAT **1.0.1** with Meta Ray-Ban Display.
The full-screen white-and-blue phone app shows the **same interactive lens** sent
to the glasses. Tap it to shop on the phone. **Wallet** opens account/card setup
with the same cookies, and returning refreshes the lens wallet without resetting
its cart. **Connect glasses** starts registration, display, controls and camera.

The glasses retain their existing in-app navigation; there is no second toolbar.
The selected action has a white fill and blue inset outline, including on pills.
Grocery clearly shows paused, camera unavailable, capturing, identifying, no item
recognized, and scanning states. Other modes retain their existing progress UI;
the phone also explains the current request (including listing searches/errors).

## Run

1. Pair and update the Display glasses in Meta AI and enable Developer Mode.
2. Open `ios/Glance.xcodeproj`, select **Glance** and your iPhone, and choose your
   Apple development team in **Signing & Capabilities** if not already set.
3. Press **Cmd-R**. Use **Wallet** on the phone to sign in/save a card, and tap
   **Connect glasses**. Approve Meta AI registration/camera prompts and return.
4. Enter Grocery and choose **Start scan**. The status card says what is happening.
   When paused with items in your cart, **More → Start scan** resumes scanning.

Direct glasses controls require **MWDATInputs** enabled in Wearables Developer
Center. Temple swipes move through existing actions; Neural Band directions move
focus; Select activates the displayed action. Navigation can continue during an
image transfer on the same screen; selections/purchases still reject stale
revisions. See [Meta's Inputs guide](https://github.com/facebook/meta-wearables-dat-ios/blob/main/plugins/mwdat-ios/skills/inputs/SKILL.md).

Developer Mode permits empty Meta app ID/client token for registration. Otherwise
configure the developer app ID/token and Apple team in the `MWDAT` configuration.
Server/payment secrets never go in the app.

## Runtime and performance

The runtime is fixed to `https://glance-blue.vercel.app/lens?source=native&companion=3`.
There is no alternate server or legacy app switch. Code caches/service workers
are cleared on launch while wallet cookies remain. The iOS build bundles both
`src/lens/lens.css` and `Glance/Resources/native-lens.js`; these fixes therefore
apply on rebuilding the companion without requiring a production web deployment.
Browser-only pages still require a deployment. Remote app code comes from the
canonical server and is not pinned to a particular commit.

The native integration supplies fresh camera frames directly to the hosted
capture adapter, avoiding its HTTP relay round trip. Camera and display share one
Bluetooth Classic link, so the camera streams at 2 fps (medium resolution):
recognition reads at most one frame every few seconds (Grocery every 3 seconds
with one request in flight), and the rest of the link stays free for display
updates. The relay retains a bounded 1 fps upload for existing phone link
handoffs, independent of rendering/capture.

Display snapshots are 600×600 **pixels**, not 1800×1800 Retina pixels. A 16ms
coalescing window replaces the former 90ms delay. Capturing is independent of
SDK delivery, with at most one send in flight and one newest pending image;
intermediate frames are discarded. Duplicate bridge messages are ignored, and an
image whose pixels match the one already on the glasses is not sent again (its
revision is still recorded for Select). Background Grocery sampling updates the
phone's status line but not the glasses banner, so it costs no display transfers.
The native lens renders without motion, so a snapshot never captures a half-finished
spring.
Xcode logs `[Glance performance]` with capture and SDK send timings. A static
screen is event-driven, not a continuously streaming video. No glasses frame-rate
guarantee can be made from the camera setting or simulator timing alone.

The generated project is included. Regenerating with `ios/project.yml` requires
preserving local signing settings (the shared spec leaves the team blank).
`UILaunchScreen` enables the full iPhone screen; the 600×600 lens is scaled to
phone width without creating a second runtime.

## Verification

Use **Product → Test** for unit/UI tests: safe input, newest-frame delivery under
slow transport, Retina downsampling, canonical URL restrictions, phone interaction
and Wallet access/return. An unsigned device build checks compilation:

```sh
xcodebuild -project ios/Glance.xcodeproj -scheme Glance \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

`scripts/test-native-companion.cjs` uses Playwright and installed Chrome against
the production lens with recognition mocked. It checks native frame delivery,
scan states, focus styling, and Wallet handoff without making real purchases.
Set `NODE_PATH` to an installed Playwright package's parent `node_modules` directory.

Physical glasses checks remain necessary for camera throughput, display send
latency, firmware, and Neural Band behavior. Keep the app in the foreground;
locked-phone and force-quit operation are not supported.
