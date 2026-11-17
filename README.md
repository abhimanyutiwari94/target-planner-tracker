<p align="center"><img src="public/icons/icon-512.png" width="140" alt="Target Planner and Tracker logo"></p>

<h1 align="center">Target Planner and Tracker</h1>
<p align="center"><b>Daily targets · progress · manpower · site photos · to-do & reminders</b><br>
Works 100% offline · PDF / Excel / Word reports in your own format · share on WhatsApp</p>

---

## What it does

| | |
|---|---|
| **Daily Progress Report** | Header block, Today's Work in Progress, Tomorrow's Targets, Manpower, Material Received, Material Required, Hindrances, Notes, Site Photographs, Signatures – the same layout as the *Daily Progress & Target Tracker* Excel. |
| **Carry-forward** | Yesterday's "Tomorrow's targets" become today's work items automatically; unfinished items (< 100 %) carry their completion %. |
| **Auto calculations** | Today's Achieved % (colour coded green / yellow / red), total-completion colour scale, manpower totals, group totals. |
| **Site photos** | Camera or gallery, smart compression (sharp photos, ~200–400 KB each), captions, reorder, hide from report. Optional date / time / GPS / project stamp (**off by default**). |
| **Outputs** | PDF, Excel (.xlsx with live formulas, conditional colours and embedded photos) and Word (.docx) – identical format. Share to WhatsApp / email / Drive, save to phone, print. Quick WhatsApp text summary. |
| **Your own format** | Rename the title, subtitle, every section and column heading, hide/reorder sections & columns, add custom columns and header fields, colours, logos (Client, Contractor, PMC…), photos per row, signatures, portrait/landscape. |
| **Insights** | Week / month / year / custom: reports filed, man-days, average & peak manpower, manpower by contractor & category, target success rate, work-wise performance, latest completion %. Excel tracker export (Summary + Target Log + Manpower Log + one sheet per day). |
| **To-Do** | To Do / Doing / Done, priority, due date, **multiple reminders per task**, daily "fill the report" reminder. |
| **Data safety** | Auto-save on every keystroke, nothing is deleted without confirmation, Trash with restore, one-file backup & restore (merge-safe), protected storage. |
| **Access codes** | 30-day coupon codes. When access ends the app becomes **view-only** – old reports, photos, insights, exports and backups stay available; new work is locked until the next code. |

## Install

### Android app (APK) – recommended
1. Open **Releases** on this GitHub page → download `TargetPlannerTracker.apk` on the phone.
2. Open it → allow *Install unknown apps* for your browser/file manager → **Install**.
3. Updates: install the newer APK over the old one – your data stays.

Direct link (after the first build): `https://github.com/<your-user>/<repo>/releases/latest/download/TargetPlannerTracker.apk`

### Web app (any phone, iPhone too)
Open `https://<your-user>.github.io/<repo>/` → Chrome menu ⋮ → **Install app** (iPhone Safari: Share → **Add to Home Screen**). After the first open it works without internet.

> The Android app gives alarm-style reminders that ring even when the app is closed. In the web app, reminders show while the app is open/recent (use "Add to calendar" for guaranteed alarms).

## Publish on GitHub (one time)
1. Create a new repository on github.com (e.g. `target-planner-tracker`) and upload **all files of this folder** (including the hidden `.github` folder).
2. Repository **Settings → Pages → Source: GitHub Actions**.
3. Open the **Actions** tab – the workflow *Build web app & Android APK* runs automatically on every push (or press *Run workflow*). After ~6 minutes:
   - the web app is live on GitHub Pages,
   - the signed APK is attached to a new **Release**.

The build uses Google's Android SDK on GitHub's servers (the setup step accepts the Android SDK licence for that build).

## Coupon / activation codes
```bash
npm install
npm run codes -- --count 12 --days 30 --start 13            # universal codes (once per phone)
npm run codes -- --days 365 --serial 5001 --device ABCDE-FGHJK  # code locked to one customer's phone
```
* Serial numbers must be unique – keep a list of what you issued (serials 1–12 are already issued).
* The customer's **Device ID** is shown in *Settings → Coupon / Access*.
* Codes stack: applying a new code adds its days on top of the remaining days.
* Codes are verified offline. Offline protection stops normal users, not a determined programmer. Before selling, change the secret in `src/license-core.js` (and issue new codes), and consider keeping the repository **private**.

## Selling later – signing key
Every build is signed with the same key (`android/app/tpt-release.keystore`) so updates install over old versions without data loss. Before distributing to customers, create your own private key and add these repository secrets (Settings → Secrets → Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. (Changing the key means phones must uninstall the old app once – make a backup first.)

## Develop
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production web build in dist/
npx cap sync android && cd android && ./gradlew assembleRelease   # local APK (needs Android SDK + JDK 21)
```
Tech: Preact + Vite, IndexedDB, Workbox PWA, Capacitor 8 (Android), jsPDF, ExcelJS, docx, Chart.js. No server, no tracking – all data stays on the phone.

© 2026 – All rights reserved. See [LICENSE](LICENSE).
