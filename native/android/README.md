# Android app

Open this directory in Android Studio, or build with Gradle 8.9 and JDK 17:

```sh
gradle assembleDebug
```

The current app attempts to attach Android's legacy Equalizer effect to output session 0. This is best-effort only; Android/OEM routing can deny it, ignore it, or hand control to another effect. The UI reports failure rather than claiming global processing.

Before release, validate on real devices and add a robust device compatibility matrix. Do not treat emulator success as proof of third-party app audio routing.
