# Platform capabilities and product contract

## Android
The app attempts to instantiate Android's legacy `Equalizer` effect on output-mix audio session 0. Android marks global output-mix effects as deprecated and device implementations vary. The app must gracefully handle:
- effect unavailable or constructor failure;
- another app/system service owns effect control;
- no global output-mix support;
- unsupported band count or frequency range;
- effect disabled or released by the system.

The UI must distinguish `Available and controlled`, `Unavailable on this device`, and `Control owned elsewhere`. A successful object construction alone is not proof that every app is routed through it.

## iOS
On iOS 27, the Media Device framework adds a supported route for a third-party app to present a virtual audio output. When the user selects that output in Control Center, the system can route real-time audio samples to a `MediaDeviceExtension` conforming to `RealtimeSampleHandling`. Apple requires an Audio Server Plug-In to receive the mixed samples. NEXUS can process those samples and render them to the prior physical output.

This is distinct from AUv3, which processes audio inside compatible host apps. The Media Device route requires iOS 27, a Media Device Extension, the required entitlement, and an Audio Server Plug-In. It must be tested on physical devices; some source apps or media states may reject or interrupt the route. See `../ios/IOS27-SYSTEM-AUDIO-ROUTING.md`.

Supported paths:
1. iOS 27 system-audio routing when NEXUS is selected as the output and the source app/system permits it.
2. AUv3 plugin inside compatible hosts.
3. Audio processing inside NEXUS itself.

## Acceptance tests
- Android: test Spotify, YouTube, browser playback, local media, wired headphones, Bluetooth, speaker, background playback, process restart, and at least two OEM families. Record exact model/OS and whether the sound changes.
- iOS: verify extension appears in AUv3-capable hosts, process mono/stereo audio, test sample-offset immediate parameter events and sample-by-sample ramps for EQ bands/output gain, verify bypass remains immediate, preserve presets, and measure latency. Separately verify NEXUS standalone processing.
- All platforms: bypass is bit-transparent within practical DSP tolerances; no clipping at supported settings; settings persist; UI never claims unsupported routing.
