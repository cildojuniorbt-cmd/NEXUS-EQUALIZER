# NEXUS EQUALIZER

A browser-based personal audio processor for Android and iPhone, built around the Web Audio API.

## Current prototype
- Load local audio files (browser-supported audio formats, including M4A where supported by the browser).
- Real-time 31-band graphic equalizer.
- 10-band parametric EQ with independent gain, frequency and Q controls.
- Live FFT spectrum analyzer.
- Dynamics compressor with threshold and ratio controls.
- Always-on peak guard limiter.
- Output gain, EQ bypass, playback timeline and seeking.
- Built-in sound presets.
- Local persistence for EQ and dynamics settings.
- Responsive white + graphite interface.
- PWA manifest and basic app-shell caching.

## Run locally
```bash
npm install
npm run dev
``

Open the local URL shown by Vite. Use HTTPS (or localhost) for browser audio and PWA capabilities.

## Important platform limitation
The Web Audio API processes audio routed through this application. A web page cannot capture and equalize audio playing in unrelated apps such as Spotify, Apple Music, YouTube or games. On iPhone, Safari has additional restrictions on background playback and audio session behavior. This prototype is not a system-wide equalizer.

## Audio graph
Local media element → 31 peaking filters → 10 parametric peaking filters → optional dynamics compressor → FFT analyser → output gain → peak guard → device output.

## Next engineering milestones
1. Verify build and test real playback on iOS Safari and Android Chrome.
2. Add custom preset management and headphone profile library.
3. Add filters (high-pass, low-pass, shelves and notch), stereo tools and loudness controls.
4. Improve offline caching, app icons and install experience.
5. Evaluate AudioWorklet DSP modules for processing that exceeds native Web Audio nodes.

## Status
Early prototype. Controls are functional for audio played inside the app, but device-specific listening tests and browser compatibility checks are still required.