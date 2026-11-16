# NEXUS EQUALIZER

A browser-based personal audio processor for Android and iPhone, built around the Web Audio API.

## First milestone
- Load local audio files and process them in real time.
- 31-band graphic equalizer.
- 10-band parametric equalizer foundation.
- Output gain, bypass, and presets.
- Responsive white + graphite interface.

## Development
```bash
npm install
npm run dev
```

Open the local URL shown by Vite. For microphone/device testing and deployment, use HTTPS. Browser audio processing applies to audio routed through this app; it cannot intercept audio from unrelated apps such as Spotify or YouTube.

## Planned architecture
- React + TypeScript + Vite
- Web Audio API for audio routing and biquad filters
- AudioWorklet for future custom DSP modules
- PWA support after the first audio milestone

## Current status
Foundation stage. The first implementation focuses on local-file playback and real-time EQ.