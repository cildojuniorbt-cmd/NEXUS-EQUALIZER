# iOS standalone app shell

The SwiftUI app entry point now opens `EqualizerView`, the native equalizer control-surface preview. Add both `StandaloneApp` Swift files to an iOS App target in Xcode and add `NexusEqualizerCore` as a local Swift Package dependency (the package is at `../NexusEqualizerCore` relative to this folder).

The current controls are presentation state only. They do not yet drive an AVAudioEngine or AUv3 render pipeline, and the screen does not intercept audio from other apps. The supported iOS route for third-party host audio is a real AUv3 Audio Unit Extension hosted by a compatible audio app.

This is not yet a complete App Store project: an Xcode project/targets, AUv3 extension implementation and embedding, signing, icons, localization, and device/host QA remain release tasks. iOS does not provide a public API for universal Spotify, YouTube, or system-audio equalization.
