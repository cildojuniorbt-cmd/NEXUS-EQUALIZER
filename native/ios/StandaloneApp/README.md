# iOS standalone container

This is the initial SwiftUI container screen source. Add it to an iOS App target in Xcode, set the bundle identifier and signing team, then embed the AUv3 extension target described in ../AudioUnitExtension.

This screen deliberately communicates the iOS system-audio limitation rather than showing a fake global on/off switch. It is not yet a complete App Store project: Xcode project settings, extension embedding, signing, icons, localization, and device QA remain release tasks.
