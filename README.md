# NEXUS EQUALIZER

**Produto pretendido: equalizar o áudio que já está tocando no celular, sem importar músicas e sem exigir um player interno.** Consulte [PRODUCT-REQUIREMENTS.md](PRODUCT-REQUIREMENTS.md) para os requisitos e as limitações reais de cada plataforma.

NEXUS EQUALIZER is being developed as a native audio-equalizer product for Android and iOS. The original Vite/Web Audio app is retained as a browser prototype and DSP/UI reference; it is **not** a system-wide equalizer.

## Native development

See [native/README.md](native/README.md) for the native workspace, architecture, build instructions, and release gates.

- Android: Kotlin app with a best-effort legacy output-mix equalizer controller. Global output routing is device/OEM/OS dependent and must be verified on real hardware.
- iOS: system-audio routing is being developed using the iOS 27 Media Device Extension + Audio Server Plug-In route; AUv3 remains a separate plugin path for compatible hosts. See `native/ios/IOS27-SYSTEM-AUDIO-ROUTING.md`.
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

Native foundations are in place, not a release-ready app yet. Android global audio behavior still requires real-device validation. The iOS 27 Media Device routing scaffold and DSP bridge are now in the project, but Xcode 27 compilation, entitlement provisioning/signing, physical-device routing tests, and source-app compatibility validation remain before release.
