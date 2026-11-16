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
A third-party iOS app cannot globally intercept or process audio rendered by unrelated apps. Supported options:
1. Process audio routed through NEXUS's own AVAudioEngine graph.
2. Ship an AUv3 Audio Unit Extension for compatible host apps (DAWs, audio hosts, etc.).
3. Offer device/headphone profiles and configuration tools, without claiming they alter other apps' output.

## Acceptance tests
- Android: test Spotify, YouTube, browser playback, local media, wired headphones, Bluetooth, speaker, background playback, process restart, and at least two OEM families. Record exact model/OS and whether the sound changes.
- iOS: verify extension appears in AUv3-capable hosts, process mono/stereo audio, test sample-offset immediate parameter events and sample-by-sample ramps for EQ bands/output gain, verify bypass remains immediate, preserve presets, and measure latency. Separately verify NEXUS standalone processing.
- All platforms: bypass is bit-transparent within practical DSP tolerances; no clipping at supported settings; settings persist; UI never claims unsupported routing.
