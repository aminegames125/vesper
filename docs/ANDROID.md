# Android and Android TV

The Android app is a **native Kotlin app**, separate from the desktop app. It lives in [`apps/android`](../apps/android) and is built with Jetpack Compose and Material 3. One APK serves phones, tablets and TVs: it has a normal launcher entry and a leanback (TV) entry, and the layout follows the device.

## Install

Download `Vesper-…-android.apk` from the release.

- **Phone or tablet:** open the file and allow installing from that source.
- **Android TV, Google TV, Fire TV:** sideload it. Easiest is the *Downloader* app (enter the release URL), or from a computer:

  ```bash
  adb connect <tv-ip>:5555
  adb install Vesper-…-android.apk
  ```

Releases built without a signing key are **debug-signed**. They install fine but cannot update over a differently signed build. Maintainers can add the secrets listed below to publish release-signed APKs.

## What it does

- Xtream and M3U sources, cached in a local database so the app opens instantly
- Live TV, movies, series with seasons, favourites, search, continue watching
- Playback with Media3 (ExoPlayer), including HLS
- **Recording on the device**: a foreground service that downloads HLS segments into a `.ts` file, no ffmpeg needed
- **Vesper Cloud**: sign in to your server, record and schedule in the cloud, and play cloud recordings from any device
- Dark and light themes using the Vesper palette

## Layout by device

| Device | Navigation |
| --- | --- |
| Phone | bottom bar, a Library tab for favourites, recordings, sources and settings |
| Tablet (600 dp and wider) | navigation rail |
| Android TV | a top row of tabs like the streaming apps, a large billboard on Home, focus rings and enlarged tiles for the remote |

The app detects a television by itself (`UiModeManager` and the leanback feature). Launcher banners for the TV home screen are in `app/src/main/res/drawable-*/vesper_banner.png`; the source script is [`brand/tv/generate.py`](../brand/tv/generate.py).

## Architecture

Composable → ViewModel → Repository, with `StateFlow` and sealed `UiState`. Hilt provides dependencies, Room stores sources, library, favourites, history and recordings, and Retrofit with kotlinx.serialization talks to providers and to Vesper Cloud.

```
ui/        screens, ViewModels, theme, shared components
data/      db (Room), remote (Retrofit), parser (M3U, Xtream), repo (repositories)
recording/ HLS playlist parser, recorder, foreground service
player/    PlayerSession and the Media3 player screen
```

## Build it yourself

Requirements: Android SDK 35 and JDK 17 or newer.

```bash
cd apps/android
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
```

## Signing in CI

Add these repository secrets to publish release-signed APKs:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | your `.jks` file, base64 encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the store and key password |
| `ANDROID_KEY_ALIAS` | the key alias |
