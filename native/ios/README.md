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

The SwiftUI controls now call the NEXUS DSP through the app-side AVAudioEngine return path. The iOS 27 Media Device Extension, Audio Server Plug-In, local PCM bridge, and XcodeGen target have been added. This is an implementation scaffold, not a validated release: Xcode 27 compilation, entitlement provisioning/signing, installation, and physical-iPhone routing tests are still required.

The Media Device route is intended to process eligible audio from other apps when NEXUS is selected in Control Center. AUv3 remains a separate plugin path for compatible hosts. Source-app compatibility and stable playback still require physical-device validation.

## Release checklist

- [ ] XcodeGen project generation succeeds.
- [ ] App and AUv3 extension compile for iOS Simulator.
- [ ] Configure team, bundle identifiers, and signing.
- [ ] Install and launch on a physical iPhone.
- [ ] Confirm the extension is discovered by an AUv3-compatible host.
- [ ] Test presets, bypass, band controls, parameter automation, mono/stereo, and session interruptions.
- [ ] Verify CPU usage, latency, and audio stability during long sessions.
