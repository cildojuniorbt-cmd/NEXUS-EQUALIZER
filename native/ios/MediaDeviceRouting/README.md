# iOS 27 Media Device routing foundation

This folder contains the initial system-audio routing implementation for NEXUS EQUALIZER.

## What is here
- `PassthroughExtension.swift`: advertises the NEXUS virtual output using Media Device Extension and receives real-time delivery callbacks.
- `MDPDriver.h/.m`: Audio Server Plug-In driver that receives the system mix.
- `LocalLink.h/.m`: local PCM transport between the extension process and the main app.
- `AudioIO.swift`: app-side receiver and AVAudioEngine return path. It now calls `NexusEqualizerCore.RealtimeStereoEqualizer` rather than the reference low-pass test filter.
- `App-Info.plist`, `Extension-Info.plist`, and entitlement files: target metadata and signing configuration.

## Reference and license
The initial Media Device / Audio Server Plug-In passthrough foundation is adapted from [ios27-media-device-passthrough](https://github.com/satomasahiro2005/ios27-media-device-passthrough), distributed under MIT No Attribution. The license text is retained in `THIRD-PARTY-LICENSE.txt`.

## Current status
- Source foundation and XcodeGen target are present.
- The existing NEXUS DSP is wired into the app-side planar audio callback.
- The complete iOS app and extension targets passed the Xcode 27 device-SDK build in GitHub Actions (run `43888724637`, commit `35c1e2a5bd417aa467a8da336ad7c2ed82210038`).
- Physical-iPhone validation is still pending; a successful compile does not prove that iOS will publish the virtual output or route third-party app audio.
- The extension entitlement requires a matching Apple Developer App ID/profile capability. A repository build alone does not prove signing or App Store approval.
- The user must select NEXUS EQUALIZER in the iOS audio output picker. The system route can vary by source app and media mode.
- Do not claim audio is being processed until the app reports a live bridge and the output is confirmed audibly changed.

## Important safety/quality gates
- Keep the real-time callback allocation-free and nonblocking.
- Preserve the sample rate and channel layout; investigate any 48 kHz mismatch rather than silently playing at the wrong speed/pitch.
- Handle interruptions, route changes, disconnect/reconnect, and buffer underruns.
- Test Spotify audio/Canvas, YouTube audio/video, Safari, social apps, speaker, wired and Bluetooth outputs on a physical iPhone running iOS 27+.