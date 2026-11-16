# NEXUS EQUALIZER Native

Native product workspace for Android and iOS. The existing Vite application remains in the repository root as a web prototype and is not represented as a system-wide equalizer.

## Product truth
- Android: a best-effort system output effect can be attempted through Android's legacy global audio session (session 0). Availability and routing are controlled by Android, the device manufacturer, and OS version. This is not guaranteed to affect every third-party app.
- iOS: there is no public API for a third-party app to insert an EQ into all other apps' audio. The supported native path is an Audio Unit Extension (AUv3) hosted by compatible host apps, plus processing of audio inside NEXUS itself.
- Never display "global active" unless the platform effect has been created, has control, and reports enabled.

## Workspace
- `android/`: Kotlin Android app and best-effort global output effect controller.
- `ios/NexusEqualizerCore/`: portable Swift DSP core and tests.
- `ios/AudioUnitExtension/`: AUv3 extension implementation source to integrate into an Xcode Audio Unit Extension target.
- `docs/PLATFORM-CAPABILITIES.md`: platform behavior and acceptance criteria.

## Build
Android: open `native/android` in Android Studio, or run the Android CI workflow.
iOS DSP core: from `native/ios/NexusEqualizerCore`, run `swift test`. The AUv3 extension must be built and signed on macOS with Xcode and embedded by a host app that supports Audio Units.

## Release gate
Do not call the product ready until device tests prove actual audio changes in independent apps on supported Android models, and AUv3 discovery/processing works in compatible iOS hosts. A normal iPhone app cannot equalize arbitrary Spotify/YouTube/system audio.
