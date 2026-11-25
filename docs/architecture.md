# Player architecture

Waveplayer is a static site with no runtime package dependencies. The browser handles playback, decoding, and rendering.

| File                                                          | Responsibility                                                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`src/main.ts`](../src/main.ts)                               | Wires the demo, playlist, local-file picker, and share links to the player                                                          |
| [`src/player/WavePlayer.ts`](../src/player/WavePlayer.ts)     | Manages the playlist and native audio element, exposes playback state and events, and integrates with Media Session where available |
| [`src/player/WaveformView.ts`](../src/player/WaveformView.ts) | Loads and decodes audio, renders the canvas, and handles pointer and keyboard seeking                                               |
| [`src/player/utils.ts`](../src/player/utils.ts)               | Computes waveform features and formats time and filenames                                                                           |
| [`src/player/index.ts`](../src/player/index.ts)               | Exports the player, the waveform view, and their shared types and helpers                                                           |

## Playback and analysis

`WavePlayer` uses the native audio element as the playback clock. `WaveformView` fetches the same source and decodes it with Web Audio. Decoding can resample the source to the analysis context’s sample rate, which is the rate reported next to the waveform.

Analysis groups samples into up to 4,096 bins and tracks signed peaks, RMS energy, onsets, and signal texture. For long recordings, the analyzer samples frames at a stride to bound the work per bin. The decoder still needs the full recording in memory. When drawing at a smaller width, the view combines bins while preserving their extrema. It caches the played and unplayed waveform artwork in separate canvas layers and composites them with the progress and cursor during playback.

## Local files and sharing

The demo validates a local file before adding it to the playlist. It sends an object URL to the player and waveform view, so both can read the file without uploading it. Those URLs are tied to the page and are revoked when it is discarded.

Demo links select a track with the `track` query parameter. The URL fragment remains available for page anchors. Older links that put a demo track ID in the fragment still open the corresponding track.

## Project history

Version 2 rebuilt the original JavaScript experiment as typed modules. It replaced the custom audio clock and XHR loading with native audio playback and `fetch`, and uses pointer events and `ResizeObserver` to keep the waveform interactive and responsive.
