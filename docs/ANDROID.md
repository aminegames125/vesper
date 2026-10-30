# Android and Android TV

Vesper uses [Tauri 2 mobile](https://tauri.app/distribute/), so the same React UI and the same Rust recorder run on phones, tablets and TVs. One APK serves all of them: it has both a normal launcher entry and a leanback (TV) launcher entry.

## Install

Download `Vesper-…-android.apk` from the release.

- **Phone or tablet:** open the file and allow installing from that source.
- **Android TV, Google TV, Fire TV:** sideload it. Easiest is the *Downloader* app (enter the release URL), or from a computer:

  ```bash
  adb connect <tv-ip>:5555
  adb install Vesper-…-android.apk
  ```

Releases built without a signing key are **debug-signed**. They install fine but cannot update over a differently signed build. Maintainers can add the secrets listed below to publish release-signed APKs.

## On a TV

TV mode switches on by itself for TV devices (or in Settings → Appearance → TV mode). Arrow keys move focus between controls, Enter selects, and the player uses up and down to change channel. Recording on a TV saves into the app's own `Vesper` folder; for long-term storage prefer **cloud recording**, which keeps files on your server and lets every device watch them.

## Build it yourself

Requirements: Android SDK and NDK 27, JDK 17, Rust with the Android targets, Node 22 and pnpm.

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
pnpm install
pnpm --filter @vesper/app android:init      # generates the Android project and enables Android TV
pnpm --filter @vesper/app android:dev       # run on a connected device or emulator
pnpm --filter @vesper/app android:build     # APK
```

`android:init` runs `tauri android init` and then [`scripts/android-tv.mjs`](../scripts/android-tv.mjs), which:

- adds the `LEANBACK_LAUNCHER` category so the app shows on the TV home screen,
- marks touchscreen and leanback as optional features,
- allows plain `http` so servers on your home network work.

The generated project (`apps/app/src-tauri/gen`) is not committed; CI regenerates it.

## Signing in CI

Add these repository secrets to publish release-signed APKs:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | your `.jks` file, base64 encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the store and key password |
| `ANDROID_KEY_ALIAS` | the key alias |
