# iOS standalone app shell

The SwiftUI app entry point now opens `EqualizerView`, the native equalizer control-surface preview. Add both `StandaloneApp` Swift files to an iOS App target in Xcode and add `NexusEqualizerCore` as a local Swift Package dependency (the package is at `../NexusEqualizerCore` relative to this folder).

The equalizer controls are being connected to the NEXUS DSP used by the iOS 27 system-audio return path. The system route is implemented separately through a Media Device Extension and Audio Server Plug-In. It is not the AUv3 path. Both routes still require build and physical-device validation.

This is not yet a complete App Store project: an Xcode project/targets, AUv3 extension implementation and embedding, signing, icons, localization, and device/host QA remain release tasks. iOS does not provide a public API for universal Spotify, YouTube, or system-audio equalization.
