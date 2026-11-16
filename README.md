# NEXUS EQUALIZER

NEXUS EQUALIZER is being developed as a native audio-equalizer product for Android and iOS. The original Vite/Web Audio app is retained as a browser prototype and DSP/UI reference; it is **not** a system-wide equalizer.

## Native development

See [native/README.md](native/README.md) for the native workspace, architecture, build instructions, and release gates.

- Android: Kotlin app with a best-effort legacy output-mix equalizer controller. Global output routing is device/OEM/OS dependent and must be verified on real hardware.
- iOS: Swift DSP core and standalone app screen foundation, with AUv3 as the supported plugin path for compatible host applications. iOS does not expose a public API for a third-party app to equalize arbitrary audio from other apps.
- Platform contract and QA matrix: [native/docs/PLATFORM-CAPABILITIES.md](native/docs/PLATFORM-CAPABILITIES.md).

## Web prototype

The repository root contains the original Vite + React + Web Audio prototype. It can process audio routed through the page itself, but cannot intercept Spotify, Apple Music, YouTube, games, or other independent apps.

Run locally:

```sh
npm install
npm run dev
```

## Build checks

- Web prototype: `npm run build`
- Android native debug build: see [Android native workflow](.github/workflows/native-android.yml)
- Portable iOS DSP unit tests: see [iOS DSP workflow](.github/workflows/ios-core.yml)

## Product status

Native foundations are in place, not a release-ready app yet. Android global audio behavior still requires real-device validation. The iOS AUv3 extension target, host integration, app project/signing, interface, and device testing remain required before release.
