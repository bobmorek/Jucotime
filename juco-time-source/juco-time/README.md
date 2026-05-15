# Juco Time

Falmouth tide times and boat launch planner.

## Run it locally

You need [Node.js](https://nodejs.org/) (any version 18 or newer).

```
npm install
npm run dev
```

That opens it at http://localhost:5173. Edit anything in `src/App.jsx` and the page reloads itself.

## Build for the web

```
npm run build
```

Everything you need to host ends up in `dist/`. It's just static files — no server, no database, no API key. You can put the contents of `dist/` on any web host.

## Easiest free hosting

**Netlify (drag-and-drop, no account-linking needed):**

1. Run `npm run build`
2. Go to https://app.netlify.com/drop
3. Drag the `dist/` folder onto the page
4. You get a URL like `https://chipper-tide-1234.netlify.app` instantly. Free forever, no card needed.
5. Free custom domain optional in Netlify settings.

**Vercel (connects to GitHub):**

1. Push this folder to a GitHub repo
2. Go to https://vercel.com, "Add new project", pick the repo
3. Vercel auto-detects Vite. Click Deploy. Done.

**Cloudflare Pages:** same flow as Vercel, slightly faster CDN globally.

**GitHub Pages:** works too but a bit fiddlier. After build, push `dist/` to a `gh-pages` branch.

## Add to your phone

Once it's hosted, open the URL in mobile Safari / Chrome and pick "Add to Home Screen". The `apple-mobile-web-app-*` meta tags in `index.html` make it open fullscreen like a native app.

## Updating tide data

Tide predictions are hard-coded in `src/App.jsx` in the `RAW` object near the top — currently 19 Apr to 30 Jun 2026. To extend:

1. Grab a tide calendar from https://www.tidetime.org/europe/united-kingdom/falmouth-calendar.htm
2. Add new dates to `RAW` in the same `"YYYY-MM-DD": [["H","HH:MM",height_m], ...]` format
3. Times are BST/UTC+1 (Falmouth local). Heights in metres above chart datum.
4. Rebuild and redeploy.

## Disclaimer

Predictions only — not for navigation. Wind, pressure and surge can shift real water levels by 0.3 m or more.
