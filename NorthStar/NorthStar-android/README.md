# North Star Android

First native Android slice for North Star so phone-side location pulses can be answered in true background.

## Included in this slice

- Native Android app scaffold in Kotlin
- Persistent session, handle, display name, desktop name, and device token storage
- Deep-link intake for the existing `https://northstar.youworld.app/pair/...` QR flow
- Native pairing against the current North Star server endpoints
- Foreground background-sync service that:
  - posts desktop heartbeat updates
  - polls pending location pulses
  - captures device location natively
  - uploads the location event
  - completes the pulse automatically
- Boot receiver that restores background sync after reboot if the user enabled it

## Remaining work

- Add an in-app QR scanner instead of relying on Android deep links / external QR opening
- Bring over the broader chat/call experience or embed it once the native location path is solid
- Decide whether to keep the always-on foreground service model or replace it with a more advanced wake-up path later
- Build and sign the APK in an Android toolchain

## Build note

This workspace does not currently have a local Android JDK/SDK/Gradle toolchain available, so I could scaffold the native app but not produce an APK from this machine in this turn.
