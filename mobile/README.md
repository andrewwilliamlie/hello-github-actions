# Hausjo Agent — Expo app (Expo Go)

A thin native shell around the HAUSJO web portal: it loads the portal full-screen in a WebView, so
every agent, admin and merchant feature works exactly as on the web. Native extras:

* configurable server address (saved on the device), with a connection check against `/api/health`
* Android back button / iOS swipe-back navigate inside the portal; pull-to-refresh on iOS
* file downloads (CSV statements, exports, documents) are fetched with your session and opened in
  the share sheet (save to Files, send via WhatsApp/email)
* external links (WhatsApp share, maps, phone) open in their own apps
* Hausjo icon and splash; status bar themed navy

Expo SDK 58 · Expo Router · react-native-webview · expo-file-system · expo-sharing.
All modules are included in **Expo Go**, so no custom build is needed to try it.

## Try it with Expo Go

You need: a computer running the HAUSJO web app, and a phone with **Expo Go** (latest version,
SDK 58) on the **same Wi-Fi**.

1. **Start the web app reachable from your phone** (repository root):
   ```bash
   npm run dev:lan
   ```
   It prints the address to use, e.g. `http://192.168.1.20:3000`. (Database + demo data must be set
   up first — see the root README.) Keep `npm run worker` running too if you want background jobs.
2. **Start the Expo app** (in `mobile/`):
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
3. **Open it on the phone**: Android — scan the QR code in Expo Go. iOS — scan with the Camera app.
4. On first launch the app asks for the **server address**: enter the address from step 1 and tap
   *Simpan & hubungkan*. (Optional: put it in `mobile/.env` as `EXPO_PUBLIC_SERVER_URL=…` so it's
   prefilled.)
5. Sign in, e.g. agent `budi@agent.test` / `Hausjo#Demo2026`. Admin accounts need a TOTP code:
   run `npm run demo:totp` in the repository root.

Tap the small ⚙︎ button (bottom-right) to change the server; long-press it to reload the page.

### Troubleshooting
| Problem | Fix |
|---|---|
| "Tidak dapat terhubung" | Phone and computer on the same Wi-Fi? Firewall allowing port 3000? Open the address in the phone's browser to check. Guest/office Wi-Fi often blocks device-to-device traffic. |
| Expo Go can't load the project | Both devices must be on the same network (`npx expo start` uses LAN by default). Networks that block device-to-device traffic need `npx expo start --tunnel`. Update Expo Go to the version for SDK 58. |
| Login works in the phone browser but not the app | Use the exact address printed by `npm run dev:lan` (it sets `APP_URL` to that host). |
| Download says "File too large" | The share bridge caps files at 15 MB; use the web portal on a computer for big exports. |
| "Cetak tidak tersedia" | Printing isn't available inside the app; download/share the statement instead. |

## Develop
```bash
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
npx expo export --platform android --platform ios   # full bundle check
```
Add native libraries with `npx expo install <pkg>`. Anything outside the Expo Go module set needs a
development build (`npx expo run:android|ios` or EAS).

## Beyond Expo Go (store builds)
For a production app point the server address at the deployed **HTTPS** portal (e.g. set
`EXPO_PUBLIC_SERVER_URL` at build time) and build with EAS (`npx eas-cli@latest build`). Release
builds block plain-HTTP traffic by default, which is what you want in production.
