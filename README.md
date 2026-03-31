# Shop Tools Tracker

A single-file web app for tracking shop tools — check out, check in, report missing/damaged, and manage tool locations with QR codes. Built for the USAF RAWS Tools Program but designed to be deployed by any shop or unit.

---

## Features

- **Tool inventory** — add tools with photos, category, and location
- **Check out / Check in** — with full audit history per tool
- **Location QR codes** — attach a QR code to a drawer or cabinet; scan it to check out or return multiple tools at once
- **Admin controls** — mark tools missing/damaged, edit logs with reason tracking
- **Role-based access** — admins manage tools; all authenticated users can check out/return

---

## Deploying for a New Shop

Each shop runs its own isolated instance with its own database. The whole app is one HTML file. Setup takes about 10 minutes.

### Step 1 — Get the file

**Option A: Fork this repo** (recommended — you get future updates via git pull)
1. Click **Fork** on GitHub
2. Clone your fork locally

**Option B: Download the file**
1. Download `index.html` directly
2. You can host it anywhere — GitHub Pages, a shared drive, a local server

---

### Step 2 — Create a Firebase project (free)

Firebase provides the database and user authentication. The free Spark plan is more than enough for any shop.

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g., `14mxs-tools-tracker`) → continue
3. **Realtime Database** — in the left sidebar, go to Build → Realtime Database → Create database → start in **test mode** (you'll lock it down in Step 4)
4. **Authentication** — go to Build → Authentication → Get started → Sign-in method → Enable **Email/Password**
5. **Get your config** — go to Project Settings (gear icon) → scroll to "Your apps" → click the `</>` web icon → register the app → copy the `firebaseConfig` object

---

### Step 3 — Edit the config block in index.html

Open `index.html` and find the `SHOP_CONFIG` block near the top. **The very first thing to change** is `setupComplete: true` → `setupComplete: false`. This activates the built-in setup wizard, which will walk you through the rest of setup step by step and auto-verify each item.

The full config block looks like this:

```js
const SHOP_CONFIG = {

  setupComplete: false,             // ← set this to false FIRST to activate the wizard

  shopName: 'RAWS Tools Tracker',   // ← change to your shop name

  firebase: {
    apiKey: "...",                   // ← paste your Firebase config here
    authDomain: "...",
    databaseURL: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  },

  adminEmails: [
    'your.email@us.af.mil',         // ← list admin email addresses
    'another.admin@us.af.mil'
  ]

};
```

**That's the only file you need to edit.** Everything else is handled automatically.

---

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

---

### Step 5 — Create user accounts

Users log in with email/password accounts you create in Firebase.

1. Firebase console → Authentication → Users tab → **Add user**
2. Enter the user's `.mil` email and a temporary password
3. Share the credentials with the user (they can't self-register by design)

To make a user an admin, add their email to `adminEmails` in the config block.

---

### Step 6 — Host the file

**Option A: GitHub Pages (free, recommended)**

1. In your forked repo → Settings → Pages
2. Source: Deploy from branch → select `main` → folder `/` (root)
3. Your app will be live at `https://yourusername.github.io/repo-name/`
4. Share that URL with your shop

**Option B: Any static host**

The file has zero build requirements. Drop `index.html` on any web server, SharePoint page that allows HTML embeds, or even open it locally in a browser (though QR code scanning won't work without a public URL).

---

## Using Location QR Codes

1. **Admin → "📍 Locations"** — create a named location (e.g., "Drawer A1", "Cabinet 3")
2. Click **📱 QR Code** → download and print/laminate it → attach to the physical drawer/cabinet
3. Anyone scans the QR → logs in → sees all tools at that location
4. Tap tools to select them → **Check Out** or **Return** in one tap

---

## Keeping Your Deployment Up to Date

If you forked the repo:

```bash
git remote add upstream https://github.com/OpticFallz/RAWS-Tool-Tracker.git
git fetch upstream
git merge upstream/main
```

Your `SHOP_CONFIG` block won't be overwritten as long as you committed your changes before merging.

---

## Notes for IT / Security

- All data is stored in your own Firebase project — no data is shared between shops
- Firebase Authentication handles credentials; the app never stores passwords
- The app is a static file with no server-side code
- Firebase free tier (Spark plan) limits: 1 GB storage, 10 GB/month transfer, 100 simultaneous connections — well within any shop's needs
- If your installation requires a `.mil`-only hosting environment, the HTML file can be served from any approved internal web server with no modifications
