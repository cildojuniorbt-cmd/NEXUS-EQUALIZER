# NEXUS AUv3 extension target

## Source now included

- `NexusEqualizerAudioUnit.swift`: initial `AUAudioUnit` stereo effect implementation with an input bus, output bus, parameter tree, bypass, master output gain, and ten band-gain parameters.
- `../NexusEqualizerCore`: portable DSP and the bounded single-producer/single-consumer realtime engine. The AU render block uses planar Float32 buffers and does not use the lock-based portable convenience processor.

## Xcode target setup

1. On macOS, create an **Audio Unit Extension** target in the NEXUS iOS Xcode project and select the **Effect** type.
2. Add `NexusEqualizerAudioUnit.swift` to the extension target.
3. Add the local Swift package at `../NexusEqualizerCore` to the extension target and link the `NexusEqualizerCore` product.
4. Set the extension's principal class to `NexusEqualizerAudioUnit` in its AudioComponents extension metadata. Use a unique Audio Unit component type/subtype/manufacturer tuple and a stable bundle identifier.
5. Embed and sign the extension in the containing NEXUS iOS app using the same Apple development team.
6. Build on macOS with Xcode, install on a physical iPhone/iPad, and verify extension discovery and audio in at least two compatible AUv3 host apps.

## Realtime contract and remaining validation

The C engine uses a bounded SPSC command queue. All parameter writes must be serialized on one control producer; the AU render callback is the single consumer. Queue-full writes return false and must be handled by the host/UI layer. Create and destroy the engine only outside the render callback.

The AU implementation is an initial integration, not a release-certified plug-in. Validate the exact Audio Unit metadata, host lifecycle, mono/stereo and sample-rate negotiation, parameter automation, preset/state restoration, maximum render sizes, channel layouts, interruption/reinitialization, and long-duration glitch behavior on Apple hardware. The current target has not been compiled by Xcode in this environment.

AUv3 works only inside compatible host apps. It does not process arbitrary Spotify, YouTube, or system audio. iOS does not provide a public API for universal third-party system-output equalization.

A signed iOS app/extension, provisioning, device QA, and App Store submission still require macOS/Xcode and an Apple developer account.
