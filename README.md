# Waveplayer

A browser-native waveform audio player and interactive demo, rebuilt with TypeScript 7. It
decodes the actual source audio, draws a responsive high-DPI waveform, and keeps playback on the
device.

[Open the live demo](https://bluehexagons.github.io/waveplayer/)

## Highlights

- Real waveform analysis with the Web Audio API
- Click, drag, touch, and keyboard seeking
- Playlist controls, ±10 second jumps, volume, mute, and five playback speeds
- Local drag-and-drop uploads using object URLs—files are never sent to a server
- Media Session integration for supported browsers
- Responsive layouts, visible focus states, reduced-motion support, and accessible controls
- No runtime dependencies

The original project was a compact JavaScript experiment. Version 2 replaces its custom audio
clock, prototype classes, XHR loading, and layered canvases with typed modules, native media
playback, `fetch`, pointer events, `ResizeObserver`, and lifecycle-safe animation and loading.

## Development

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

The project uses the stable TypeScript 7 native compiler and Vite 8. Production builds use
relative asset paths, so the generated site can be hosted from a subdirectory such as GitHub
Pages.

## Quality checks

```bash
npm run check      # Biome + TypeScript 7
npm test           # Unit tests
npm run test:e2e   # Chrome interaction and responsive tests
npm run build      # Type-check and production build
```

End-to-end tests cover waveform decoding, track changes, transport controls, local file loading,
narrow mobile layouts, automated accessibility checks, and runtime or asset-loading errors.

## Keyboard controls

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> or <kbd>K</kbd> | Play or pause |
| <kbd>J</kbd> / <kbd>L</kbd> | Back / forward 10 seconds |
| <kbd>M</kbd> | Mute or unmute |
| <kbd>←</kbd> / <kbd>→</kbd> on the waveform | Seek 5 seconds |
| <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> | Seek 15 seconds |
| <kbd>Home</kbd> / <kbd>End</kbd> on the waveform | Jump to start / end |

## Structure

- `src/player/WavePlayer.ts` — typed playlist and playback engine
- `src/player/WaveformView.ts` — decoding, rendering, pointer, and keyboard interaction
- `src/player/utils.ts` — waveform analysis and formatting utilities
- `src/main.ts` — demo composition and local-file workflow

## License

[Apache License 2.0](LICENSE)
