# Google Cloud setup for Drive sync

About 10 minutes. Do this once the hosted URL exists (for GitHub Pages: `https://lpratt78.github.io`).

1. **Create a project.** Go to console.cloud.google.com → project picker → New project → name it `Movie & Show Tracker` → Create, then select it.
2. **Turn on the Drive API.** APIs & Services → Library → search "Google Drive API" → Enable.
3. **Set up the consent screen** (Google Auth Platform / OAuth consent screen).
   - App name `Movie & Show Tracker`, your Gmail as support and developer contact.
   - Audience: **External**.
   - Data access / Scopes: add `https://www.googleapis.com/auth/drive.appdata` (shown as "See, create, and delete its own configuration data in your Google Drive").
4. **Keep it in Testing mode and add yourself.** Audience → Publishing status **Testing** → Test users → Add users → your Google account. Only listed test users can sign in.
5. **Create the OAuth client ID.** Clients (or Credentials → Create credentials → OAuth client ID) → Application type **Web application**.
   - Authorized JavaScript origins: `https://lpratt78.github.io` (origin only, no path, no trailing slash). Add `http://localhost:8080` too if you want to test locally.
   - Redirect URIs: leave empty (the app uses the popup token flow).
   - Create, then copy the **Client ID** (ends in `.apps.googleusercontent.com`). No client secret is needed.
6. **Paste it in the app.** Settings → Google Drive sync → OAuth client ID → Save → Sign in with Google. You'll see a "Google hasn't verified this app" screen; choose Continue, since it's your own app.

## Things to know

- In Testing mode Google sign-ins expire after about 7 days, and access tokens after 1 hour. When that happens the app keeps working offline and shows "Sync paused"; tap Sync now in Settings to sign in again. Your lists are never lost because the device copy is the primary one.
- The app can only see its own file in a hidden Drive folder. It cannot read your other Drive files.
- On iPhone, sign in from the installed home-screen app, since it keeps separate storage from Safari.
