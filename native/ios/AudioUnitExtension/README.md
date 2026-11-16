# NEXUS AUv3 extension target

## Source included

- `NexusEqualizerAudioUnit.swift`: AUv3 stereo effect with input/output buses, a parameter tree, bypass, master output gain, ten EQ bands, five factory presets, and host-managed user preset support.
- `NexusEqualizerAudioUnitFactory.swift`: principal factory class required to instantiate the AUv3.
- `Info-AUv3-Extension.plist`: starter extension metadata with component type `aufx`, subtype `Nxeq`, and manufacturer `Nexu`.
- `../NexusEqualizerCore`: portable DSP and bounded SPSC realtime engine. The AU render block uses planar Float32 buffers, not the lock-based portable convenience processor.

## Xcode target setup (macOS required)

1. Create an **Audio Unit Extension** target in the NEXUS iOS Xcode project and select the **Effect** type.
2. Add both Swift files in this folder to the extension target.
3. Add the local Swift package at `../NexusEqualizerCore` to the extension target and link the `NexusEqualizerCore` product.
4. Use `Info-AUv3-Extension.plist` as the extension target's Info.plist, or merge its `NSExtension` dictionary into the generated plist. Confirm the principal class resolves to `$(PRODUCT_MODULE_NAME).NexusEqualizerAudioUnitFactory`.
5. Confirm the component tuple is unique for this product: type `aufx`, subtype `Nxeq`, manufacturer `Nexu`. Change it before public release if another component already uses the same tuple.
6. Embed and sign the extension in the containing NEXUS iOS app using the same Apple development team.
7. Build with Xcode, install on a physical iPhone/iPad, and verify extension discovery and audio in at least two compatible AUv3 host apps.

## Realtime and release validation

The C engine uses a bounded SPSC command queue. Parameter writes must be serialized on one control producer; the AU render callback is the single consumer. Queue-full writes return false. The audio render path performs no locks, heap allocations, or system calls. Create and destroy the engine only outside the render callback.

The AU target is an initial implementation, not a release-certified plug-in. Validate the exact Audio Unit metadata, host lifecycle, supported channel layouts, sample-rate negotiation, parameter changes and sample-accurate automation events, factory and user preset restoration, maximum render sizes, interruption/reinitialization, and long-duration glitch behavior on Apple hardware. The current render block applies parameter changes received through the parameter observer; it does not yet consume timestamped events from the host's realtime event list, so sample-accurate automation is not complete. The current target has not been compiled by Xcode in this environment.

AUv3 works only inside compatible host apps. It does not process arbitrary Spotify, YouTube, or system audio. iOS does not provide a public API for universal third-party system-output equalization.

A signed iOS app/extension, provisioning, device QA, and App Store submission still require macOS/Xcode and an Apple developer account.
