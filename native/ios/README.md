# iOS native project

The iOS project is generated from `project.yml` with XcodeGen. The system-audio routing feature requires iOS 27 and Xcode 27 SDK support. See [IOS27-SYSTEM-AUDIO-ROUTING.md](IOS27-SYSTEM-AUDIO-ROUTING.md) for the architecture being implemented. The specification creates:

- `NexusEqualizer`: SwiftUI host application.
- `NexusEqualizerAUv3`: Audio Unit v3 effect extension embedded in the app.
- `NexusEqualizerCore`: shared local Swift Package used by both targets.

## Generate and build on macOS

Requirements: macOS, Xcode with the iOS Simulator SDK, and XcodeGen.

From this directory:

```sh
brew install xcodegen
xcodegen generate --spec project.yml
xcodebuild -project NexusEqualizer.xcodeproj \
  -scheme NexusEqualizer \
  -sdk iphonesimulator \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Open `NexusEqualizer.xcodeproj` in Xcode to select a simulator, configure signing for a physical iPhone, and run the host app. For a device build, set a unique bundle identifier and select a valid Apple development team. The AUv3 extension must remain embedded in the containing app.

## Current functional boundary

The SwiftUI screen is currently a native control-surface preview. Its sliders and presets are presentation state and are not yet connected to an in-app audio graph. The AUv3 source implements the DSP render path, but successful simulator compilation, signing, installation, and validation in a compatible AUv3 host are still required before claiming the extension works end to end.

On iOS, this plugin can process audio routed through compatible AUv3 host apps. It cannot equalize arbitrary audio from Spotify, YouTube, or the whole operating system.

## Release checklist

- [ ] XcodeGen project generation succeeds.
- [ ] App and AUv3 extension compile for iOS Simulator.
- [ ] Configure team, bundle identifiers, and signing.
- [ ] Install and launch on a physical iPhone.
- [ ] Confirm the extension is discovered by an AUv3-compatible host.
- [ ] Test presets, bypass, band controls, parameter automation, mono/stereo, and session interruptions.
- [ ] Verify CPU usage, latency, and audio stability during long sessions.
