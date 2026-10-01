# RAWS Tools Tracker

A web app for tracking shop tools — check out, check in, report missing/damaged, and manage tool locations with QR codes. Built for the USAF RAWS Tools Program but designed to be deployed by any shop or unit.

**Version 2.0** is distributed as a **single self-contained HTML file** — React, Firebase, and QR-code generation are all bundled inside. No build step, no Node, no programming knowledge required. Just download one file and configure it in your browser.

---

## For Shops: Deploying Your Instance (about 10 minutes)

Each shop runs its own isolated instance with its own database.

### Step 1 — Download the file

Go to the [Releases page](https://github.com/OpticFallz/RAWS-Tool-Tracker/releases) and download the latest `raws-tools-tracker-vX.Y.Z.html` file. That's the entire app — one file.

### Step 2 — Create a Firebase project (free)

Firebase provides the database and user authentication. The free Spark plan is more than enough for any shop.

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g., `14mxs-tools-tracker`) → continue
3. **Realtime Database** — left sidebar → Build → Realtime Database → Create database → start in **test mode** (you'll lock it down in Step 4)
4. **Authentication** — Build → Authentication → Get started → Sign-in method → enable **Email/Password**
5. **Get your config** — Project Settings (gear icon) → "Your apps" → click the `</>` web icon → register the app → copy the `firebaseConfig` object

### Step 3 — Configure the app in your browser

Open the downloaded HTML file in your browser. The built-in setup wizard will walk you through everything:

1. **Easy Setup: Paste & Download** — enter your shop name, one or more admin email addresses, and paste your complete `firebaseConfig` block from Step 2
2. The wizard validates everything and generates a **configured copy** of the app, downloaded as `raws-tools-tracker-configured.html`
3. **Rename it to `index.html`** — this is the file you host
4. Continue through the wizard's remaining steps: database rules, creating users, and hosting

You never have to edit the file by hand. If you ever need to change the shop name or admins later, just re-run the wizard from the configured file.

### Step 4 — Lock down the Firebase database rules

By default Firebase allows anyone to read/write. Replace the rules with these to require login:

1. In Firebase console → Realtime Database → Rules tab
2. Replace the rules with:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

3. Click **Publish**

### Step 5 — Create user accounts

Users log in with email/password accounts you create in Firebase.

1. Firebase console → Authentication → Users tab → **Add user**
2. Enter the user's `.mil` email and a temporary password
3. Share the credentials with the user (they can't self-register by design)

To make a user an admin, add their email to the `adminEmails` list during setup (or edit it later via the wizard).

### Step 6 — Host the file

**Option A: GitHub Pages (free, recommended)**

1. Create a repo (or fork this one) and upload your configured `index.html`
2. Settings → Pages → Source: Deploy from branch → `main` → folder `/` (root)
3. Your app will be live at `https://yourusername.github.io/repo-name/`
4. Share that URL with your shop

**Option B: Any static host**

The file has zero server requirements. Drop `index.html` on any web server or SharePoint page that allows HTML embeds.

---

## Using the App

### Location QR codes

1. **Admin → Locations** — create a named location (e.g., "Drawer A1", "Cabinet 3")
2. Click the QR code button → download and print/laminate it → attach to the physical drawer/cabinet
3. Anyone scans the QR → logs in → sees all tools at that location
4. Tap tools to select them → **Check Out** or **Return** in one tap

### Roles

- **Admins** — manage tools, users, locations, and settings; mark tools missing/damaged; edit logs
- **All authenticated users** — check tools out and return them

---

## Updating to a New Version

1. Download the new release file
2. Run the setup wizard's paste-and-download step again with your existing config values (keep a copy of your `firebaseConfig` and admin list handy)
3. Replace the old `index.html` with the newly configured file

No data migration needed — your tools and history live in your Firebase project, not in the HTML file.

---

## Notes for IT / Security

- All data is stored in your own Firebase project — no data is shared between shops
- Firebase Authentication handles credentials; the app never stores passwords
- The app is a static file with no server-side code
- QR codes are generated entirely in the browser — no external services involved
- The only network requests the app makes are to your Firebase project and Google's authentication endpoints
- Firebase free tier (Spark plan) limits: 1 GB storage, 10 GB/month transfer, 100 simultaneous connections — well within any shop's needs
- If your installation requires a `.mil`-only hosting environment, the HTML file can be served from any approved internal web server with no modifications

---

## For Developers: Building from Source

Shops never need this. This is only for working on the app itself.

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/OpticFallz/RAWS-Tool-Tracker.git
cd RAWS-Tool-Tracker
npm ci          # install exact dependencies
npm run build   # build both artifacts
```

This produces two files:

| File | Config | Purpose |
|------|--------|---------|
| `index.html` | Your live `src/config.live.js` | Local testing against the real Firebase project |
| `dist/raws-tools-tracker-v2.0.0.html` | `src/config.template.js` (placeholder values) | The distributable release file |

**Source layout:**

- `src/app.jsx` — the entire app (React 18)
- `src/shell.html` — HTML shell the build injects the bundle into
- `src/design-system.css` — all styling (no CSS frameworks)
- `src/config.live.js` / `src/config.template.js` — shop configuration
- `build.mjs` — esbuild-based build script

Dependencies are bundled into the HTML at build time (React, ReactDOM, Firebase compat SDKs, `qrcode-generator`). The output file makes no CDN requests.

**Workflow:** develop on a feature branch, build, verify in the browser, and open a pull request against `main` — changes merge only after review.
