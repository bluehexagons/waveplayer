# Development and deployment

## Run locally

Use Node.js 24.22.3 or later in the 24.x line, or 26.13.1 or later in the 26.x line. CI uses the version pinned in [`.nvmrc`](../.nvmrc). If you use nvm, select it with `nvm use`.

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Vite. The project uses TypeScript 7 and Vite 8. Production builds use relative asset paths so they can be served from a subdirectory.

## Run checks

| Command            | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `npm run check`    | Run Biome and TypeScript checks                     |
| `npm test`         | Run the Vitest unit tests                           |
| `npm run test:e2e` | Build and test the production site with Playwright  |
| `npm run build`    | Type-check and write the production site to `dist/` |

The browser suite serves the built site at `http://127.0.0.1:4173/waveplayer/` to exercise the same subdirectory layout as GitHub Pages. Local runs use installed Google Chrome. CI installs Playwright’s matching Chromium. The suite covers waveform decoding, playlist and transport controls, local-file handling, narrow layouts, accessibility, and failed asset requests.

## Test on another device

With Basaltwater on Debian, you can run the same checks with `basaltw node exec -- npm run check`. For trusted HTTPS device testing, use the managed web gateway.

```sh
basaltwater-web preview start waveplayer --project .
```

The gateway keeps the development server bound to loopback. For a local production preview, run `npm run build` and then `npm run preview`. Arrange HTTPS separately if your test device needs a secure connection and you are using a different environment.

## Publish to GitHub Pages

The [GitHub Actions workflow](../.github/workflows/deploy.yml) runs the checks and uploads the same build exercised by the browser suite. Pull requests run validation. Pushes to `main` and manual workflow runs targeting `main` publish the production artifact to [GitHub Pages](https://bluehexagons.github.io/waveplayer/).
