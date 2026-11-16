# iOS 27 system-audio equalizer architecture

## Product goal

NEXUS EQUALIZER should process audio already playing in other iPhone apps, without importing tracks or requiring a built-in music player. The user selects **NEXUS EQUALIZER** as the output in the iOS Control Center audio output picker; iOS routes eligible playback through the NEXUS processing path and then to the physical output that was in use.

## Verified platform capability

Apple's iOS 27 Media Device framework supports media-device extensions. An extension can advertise an output device and conform to `RealtimeSampleHandling`. When real-time audio streaming is enabled, the system routes audio samples destined for that selected device through the extension. Apple requires an Audio Server Plug-In to be published during activation; the plug-in receives the mixed output in its I/O callbacks.

Official Apple references:
- Media Device overview: https://developer.apple.com/documentation/MediaDevice
- Creating a Media Device Extension: https://developer.apple.com/documentation/MediaDevice/creating-a-media-device-extension
- `MediaDeviceExtension`: https://developer.apple.com/documentation/mediadevice/mediadeviceextension
- `AudioServerPlugInRegisterMediaDeviceExtension`: https://developer.apple.com/documentation/coreaudio/audioserverpluginregistermediadeviceextension

This is a different architecture from AUv3. AUv3 remains useful for compatible audio hosts, but it is not the mechanism for routing arbitrary app audio. The system-wide route is the iOS 27 Media Device Extension plus Audio Server Plug-In.

## Reference implementation research

The open-source MIT project [EffectDeck](https://github.com/satomasahiro2005/EffectDeck) and its minimal [iOS 27 Media Device passthrough sample](https://github.com/satomasahiro2005/ios27-media-device-passthrough) demonstrate the architecture on physical iOS 27 devices.

The reference flow is:
1. A `MediaDeviceExtension` advertises a virtual output device in the system route picker.
2. The user selects it in Control Center.
3. The extension activates an Audio Server Plug-In.
4. The plug-in receives the system mix as real-time PCM samples.
5. The extension forwards samples to the containing app over a local loopback transport.
6. The app processes the samples with the NEXUS DSP and plays them to the original physical route.

The reference implementation documents important constraints:
- The feature requires iOS 27 and Xcode 27 SDK support.
- The Audio Server Plug-In must expose one output device.
- Its transport type must be `kAudioDeviceTransportTypeRemoteStreaming` or `kAudioDeviceTransportTypeRemoteScreen`.
- The Core Audio device UID must match the `MediaOutputDevice.id`.
- The Audio Server Plug-In must be published promptly during activation.
- The extension sandbox and process split require a carefully designed audio bridge.
- Routing can still be rejected or interrupted by the OS for some source apps or media states. The reference reports limitations with some video playback, including Spotify Canvas and some YouTube states.

## NEXUS implementation plan

### Phase A: project and entitlement structure
- Raise the iOS feature target to iOS 27.
- Add a dedicated Media Device Extension target, separate from the existing AUv3 target.
- Add the `MediaDevice` framework implementation conforming to `MediaDeviceExtension` and `RealtimeSampleHandling`.
- Add the extension point, exported protocol UTI, and matching media-device entitlement.
- Configure app and extension signing identifiers and request the required Apple Developer entitlement/profile support.

### Phase B: system audio capture and transport
- Implement a minimal Audio Server Plug-In for the single virtual output device.
- Receive interleaved Float32 PCM from the system mix callback.
- Forward bounded audio chunks from the extension to the app through a local transport.
- Implement the app-side receiver and output graph, with interruption, route-change, reconnect, and backpressure handling.
- Do not do network/file work, allocations, or blocking locks in the real-time audio callback.

### Phase C: NEXUS DSP integration
- Feed received PCM through the existing real-time C DSP engine.
- Preserve channel layout, sample rate, timestamps, and stable buffering.
- Render to the physical output selected before NEXUS was chosen.
- Connect UI bands, presets, bypass, and output level to the DSP controls.
- Show a truthful state: disconnected, connecting, processing system audio, interrupted, or unsupported source.

### Phase D: physical-device acceptance
Test on a physical iPhone running iOS 27 or later:
- Spotify audio without Canvas and with Canvas.
- YouTube audio and video separately.
- Safari, podcasts, local playback, social apps, and games.
- Speaker, wired headphones, Bluetooth/AirPods, and route changes.
- Lock screen, backgrounding, calls/interruption, app termination and relaunch.
- Confirm a clearly audible EQ change while the source app remains the player.
- Measure latency, CPU, battery, underruns, and output stability.

## Product truth

This architecture can route audio from other apps when the NEXUS virtual output is selected and iOS permits the route. It is not a guarantee that every app and every media mode will remain compatible forever. NEXUS must not claim universal support until a source-app/device test matrix confirms it.

The feature has not yet been implemented in this repository. Existing AUv3 and standalone SwiftUI work must not be presented as system-audio routing.