# Waveplayer

Play a demo track or open your own audio in the browser. Use the waveform to find a passage and jump straight to it.

[Open Waveplayer](https://bluehexagons.github.io/waveplayer/)

## Play and explore

1. Choose a demo track from the playlist, or select **Open audio** to pick a file. You can also
   drop a file beside that button. Local tracks open paused and stay in the playlist for the
   current page session. Waveplayer never uploads them.
2. Click, tap, or drag on the waveform to seek. The outer shape shows sample peaks, the filled
   center shows energy, the orange ticks mark sudden changes, and the purple line shows how
   quickly the signal changes.
3. Use the transport controls to jump 10 seconds in either direction, switch tracks, adjust the
   volume, or cycle through the five playback speeds.

Use **Copy track link** to share a demo track. **Download current track** saves a copy of the
selected audio. If your browser cannot open a local file, try another format such as MP3, WAV,
or OGG.

## Keyboard controls

| Key                                                                         | Action                         |
| --------------------------------------------------------------------------- | ------------------------------ |
| <kbd>Space</kbd> or <kbd>K</kbd>                                            | Play or pause                  |
| <kbd>Enter</kbd> on the waveform                                            | Play or pause                  |
| <kbd>J</kbd> / <kbd>L</kbd>                                                 | Jump back / forward 10 seconds |
| <kbd>M</kbd>                                                                | Mute or unmute                 |
| <kbd>←</kbd> or <kbd>↓</kbd> / <kbd>→</kbd> or <kbd>↑</kbd> on the waveform | Seek back / forward 5 seconds  |
| <kbd>Shift</kbd> + arrow key on the waveform                                | Seek 15 seconds                |
| <kbd>Home</kbd> / <kbd>End</kbd> on the waveform                            | Jump to the start / end        |

## Project documentation

- [Development and deployment](docs/development.md)
- [Player architecture](docs/architecture.md)
- [Apache License 2.0](LICENSE)
