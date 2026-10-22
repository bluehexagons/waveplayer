# Waveplayer

A browser-native waveform audio player and interactive demo, rebuilt with TypeScript 7. It
decodes the actual source audio, draws a responsive high-DPI waveform, and keeps playback on the
device.

[Open the live demo](https://bluehexagons.github.io/waveplayer/)

## Highlights

- Detailed Web Audio analysis with signed peaks, RMS energy, onset cues, and signal texture
- Click, drag, touch, and keyboard seeking
- Playlist controls, ±10 second jumps, volume, mute, and five playback speeds
- Local drag-and-drop uploads using object URLs—files are never sent to a server
- Media Session integration for supported browsers
- Responsive layouts, visible focus states, reduced-motion support, and accessible controls
- No runtime dependencies

The original project was a compact JavaScript experiment. Version 2 replaces its custom audio
clock, prototype classes, XHR loading, and layered canvases with typed modules, native media
playback, `fetch`, pointer events, `ResizeObserver`, and lifecycle-safe animation and loading.
Waveform work is bounded for long recordings, reduced to the rendered width with extrema-preserving
aggregation, and cached in static canvas layers so playback frames only composite the progress state
and cursor.

## Development

Requires Node.js 24.22.1+ within 24.x (LTS) or 26.12.1+ within 26.x (Current).

```bash
npm ci
npm run dev
```

The project uses the stable TypeScript 7 native compiler and Vite 8. Production builds use
relative asset paths, so the generated site can be hosted from a subdirectory such as GitHub
Pages.

Basaltwater on Debian is the reference development environment. Node 24 is pinned
in `.nvmrc` and used by CI; select it with `nvm use`, or run
`basaltw node exec -- npm run check`. Native Node.js commands remain supported
without Basaltwater.

For authorized device testing through trusted HTTPS, follow the shared
`basaltwater-web-gateway` skill and run:

```sh
basaltwater-web preview start waveplayer --project .
```

The gateway keeps the upstream on loopback. Without it, use `npm run dev` or
`npm run preview` and arrange HTTPS separately when needed. Uploaded audio stays
in the browser; preserve source recordings and demo media during cleanup.

## Quality checks

```bash
npm run check      # Biome + TypeScript 7
npm test           # Unit tests
npm run test:e2e   # Chrome interaction and responsive tests
npm run build      # Type-check and production build
```

End-to-end tests cover waveform decoding, track changes, transport controls, local file loading,
narrow mobile layouts, automated accessibility checks, and runtime or asset-loading errors.
Local E2E runs use an installed Google Chrome, including Basaltwater's managed
browser. CI installs Playwright's matching Chromium before running the same suite.
Pull requests run checks, tests, and builds; only main publishes GitHub Pages.

## Keyboard controls

| Key                                              | Action                    |
| ------------------------------------------------ | ------------------------- |
| <kbd>Space</kbd> or <kbd>K</kbd>                 | Play or pause             |
| <kbd>J</kbd> / <kbd>L</kbd>                      | Back / forward 10 seconds |
| <kbd>M</kbd>                                     | Mute or unmute            |
| <kbd>←</kbd> / <kbd>→</kbd> on the waveform      | Seek 5 seconds            |
| <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd>   | Seek 15 seconds           |
| <kbd>Home</kbd> / <kbd>End</kbd> on the waveform | Jump to start / end       |

## Structure

- `src/player/WavePlayer.ts` — typed playlist and playback engine
- `src/player/WaveformView.ts` — decoding, rendering, pointer, and keyboard interaction
- `src/player/utils.ts` — waveform analysis and formatting utilities
- `src/main.ts` — demo composition and local-file workflow

## License

[Apache License 2.0](LICENSE)
