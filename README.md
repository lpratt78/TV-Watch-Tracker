# Watch Tracker

A personal movie and TV tracker that installs as an app on iPhone, Android, and Windows (PWA).

- **Discover**: trending, popular, coming soon, and a row for each streaming service you pick.
- **Search and Details**: cast, seasons, next episode, and where to watch.
- **My Lists**: Watchlist, Watching, Watched, with 1 to 5 star ratings.
- **Updates**: when the app opens it checks the titles you follow for new seasons, premiere dates, new episodes, and movie releases, then shows them with a badge and countdowns. Alerts are in-app only.
- **Sync**: lists are saved on the device for offline use and backed up to a hidden app folder in your Google Drive.

Data comes from [TMDB](https://www.themoviedb.org). Streaming availability is JustWatch data delivered through TMDB. Both are credited in the app's About screen.

## No build step

Plain HTML, CSS, and JavaScript modules. Any static host works. To run locally:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Keys (never committed)

| Key | Where to get it | Where it goes |
| --- | --- | --- |
| TMDB API key | themoviedb.org → Settings → API | App → Settings → TMDB |
| Google OAuth client ID | Google Cloud console (see [GOOGLE-SETUP.md](GOOGLE-SETUP.md)) | App → Settings → Google Drive sync |

Both are stored in the browser's local storage on each device. Optionally, copy `config.example.js` to `config.js` to preset them; `config.js` is git-ignored.

## Hosting on GitHub Pages

1. Repo → Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
2. The site appears at `https://<user>.github.io/watch-tracker/`.
3. Add `https://<user>.github.io` as an authorized JavaScript origin on the Google OAuth client.

## Installing

- **iPhone**: open the site in Safari → Share → Add to Home Screen.
- **Android**: open in Chrome → menu → Install app.
- **Windows**: open in Edge or Chrome → install icon in the address bar.

## Files

```
index.html            app shell
css/app.css           styles
js/app.js             router and screens
js/tmdb.js            TMDB client
js/store.js           local storage, merge logic, settings
js/updates.js         Updates feed builder
js/sync.js            Google Drive appDataFolder sync
sw.js                 service worker (offline shell, image and API cache)
manifest.webmanifest  install metadata
```

When you change any app file, bump `VERSION` in `sw.js` so installed copies pick up the update.
