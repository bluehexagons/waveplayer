import './styles.css';
import {
  type AudioAnalysis,
  filenameToTitle,
  formatTime,
  type PlayerSnapshot,
  type Track,
  WaveformView,
  WavePlayer,
} from './player';

const assetUrl = (path: string): string => new URL(path, document.baseURI).href;

const tracks: Track[] = [
  {
    id: 'scales-in-motion',
    title: 'Scales in Motion',
    artist: 'Loren Crain',
    subtitle: 'Piano study',
    src: assetUrl('audio/scales.ogg'),
    accent: '#d8ff45',
  },
  {
    id: 'creepy-piano-no-2',
    title: 'Creepy Piano No. 2',
    artist: 'Loren Crain',
    subtitle: 'Nocturne sketch',
    src: assetUrl('audio/creepypiano2.ogg'),
    accent: '#ff7356',
  },
  {
    id: 'melodic-study',
    title: 'Melodic Study',
    artist: 'Loren Crain',
    subtitle: 'Melodic experiment',
    src: assetUrl('audio/melodic.ogg'),
    accent: '#8d7bff',
  },
];

function query<ElementType extends Element>(
  selector: string,
  root: ParentNode = document,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

const elements = {
  playerCard: query<HTMLElement>('.player-card'),
  trackArt: query<HTMLElement>('.track-art'),
  trackNumber: query<HTMLElement>('[data-track-number]'),
  trackTitle: query<HTMLElement>('[data-track-title]'),
  trackArtist: query<HTMLElement>('[data-track-artist]'),
  currentTime: query<HTMLTimeElement>('[data-current-time]'),
  duration: query<HTMLTimeElement>('[data-duration]'),
  audioSpec: query<HTMLElement>('[data-audio-spec]'),
  play: query<HTMLButtonElement>('[data-play]'),
  previous: query<HTMLButtonElement>('[data-previous]'),
  next: query<HTMLButtonElement>('[data-next]'),
  back: query<HTMLButtonElement>('[data-back]'),
  forward: query<HTMLButtonElement>('[data-forward]'),
  mute: query<HTMLButtonElement>('[data-mute]'),
  volume: query<HTMLInputElement>('[data-volume]'),
  rate: query<HTMLButtonElement>('[data-rate]'),
  queue: query<HTMLElement>('[data-queue]'),
  trackCount: query<HTMLElement>('[data-track-count]'),
  download: query<HTMLAnchorElement>('[data-download]'),
  copy: query<HTMLButtonElement>('[data-copy]'),
  uploadButton: query<HTMLButtonElement>('[data-upload-button]'),
  fileInput: query<HTMLInputElement>('[data-file-input]'),
  dropZone: query<HTMLElement>('[data-drop-zone]'),
  toast: query<HTMLElement>('[data-toast]'),
};

const initialTrackIndex = Math.max(
  0,
  tracks.findIndex((track) => `#${track.id}` === window.location.hash),
);
const player = new WavePlayer(tracks, initialTrackIndex);
const knownDurations = new Map<string, number>();
const localUrls = new Set<string>();
let toastTimer: number | null = null;

const waveform = new WaveformView({
  canvas: query<HTMLCanvasElement>('[data-waveform]'),
  hoverLabel: query<HTMLOutputElement>('[data-hover-time]'),
  stateElement: query<HTMLElement>('[data-waveform-state]'),
  messageElement: query<HTMLElement>('[data-waveform-message]'),
  onSeek: (time) => player.seek(time),
  onToggle: () => void player.toggle(),
  onAnalysis: (analysis) => updateAudioAnalysis(analysis),
});

function showToast(message: string): void {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('is-visible');
  }, 2_600);
}

function createMiniWave(index: number): HTMLElement {
  const wave = document.createElement('span');
  wave.className = 'mini-wave';
  wave.setAttribute('aria-hidden', 'true');

  for (let bar = 0; bar < 18; bar += 1) {
    const line = document.createElement('i');
    const height = 20 + Math.abs(Math.sin((bar + 1) * (index + 1) * 0.77)) * 75;
    line.style.height = `${Math.round(height)}%`;
    wave.append(line);
  }

  return wave;
}

function renderQueue(): void {
  const fragment = document.createDocumentFragment();
  const snapshot = player.snapshot;

  player.trackList.forEach((track, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-item';
    button.classList.toggle('is-active', index === snapshot.index);
    button.style.setProperty('--track-accent', track.accent);
    button.setAttribute('aria-pressed', String(index === snapshot.index));
    button.setAttribute(
      'aria-label',
      index === snapshot.index ? `Play current track, ${track.title}` : `Play ${track.title}`,
    );

    const number = document.createElement('span');
    number.className = 'queue-number';
    number.textContent = (index + 1).toString().padStart(2, '0');

    const copy = document.createElement('span');
    copy.className = 'queue-copy';
    const title = document.createElement('strong');
    title.textContent = track.title;
    const subtitle = document.createElement('span');
    subtitle.textContent = track.local
      ? 'Local audio · This device'
      : `${track.artist} · ${track.subtitle}`;
    copy.append(title, subtitle);

    const duration = document.createElement('time');
    duration.textContent = knownDurations.has(track.id)
      ? formatTime(knownDurations.get(track.id) ?? 0)
      : '—:—';

    const playMark = document.createElement('span');
    playMark.className = 'queue-play-mark';
    playMark.setAttribute('aria-hidden', 'true');
    playMark.textContent = '▶';

    button.append(number, createMiniWave(index), copy, duration, playMark);
    button.addEventListener('click', () => {
      if (index === player.snapshot.index) {
        void player.toggle();
      } else {
        void player.select(index, true);
      }
    });
    fragment.append(button);
  });

  elements.queue.replaceChildren(fragment);
  elements.trackCount.textContent = `${player.trackList.length} ${player.trackList.length === 1 ? 'track' : 'tracks'}`;
}

function updateAudioAnalysis(analysis: AudioAnalysis): void {
  const track = player.currentTrack;
  knownDurations.set(track.id, analysis.duration);
  const channelLabel =
    analysis.channels === 1
      ? 'MONO'
      : `${analysis.channels === 2 ? 'STEREO' : `${analysis.channels} CH`}`;
  const sampleRate = `${(analysis.sampleRate / 1_000).toFixed(1).replace('.0', '')} KHZ`;
  elements.audioSpec.textContent = `${channelLabel} · ${sampleRate}`;
  renderQueue();
}

function handleTrackChange(track: Track, index: number): void {
  elements.trackTitle.textContent = track.title;
  elements.trackArtist.textContent = `${track.artist} · ${track.subtitle}`;
  elements.trackNumber.textContent = (index + 1).toString().padStart(2, '0');
  elements.trackArt.style.setProperty('--track-accent', track.accent);
  elements.audioSpec.textContent = 'Reading audio details';
  elements.download.href = track.src;
  elements.download.download = track.local
    ? track.title
    : (track.src.split('/').at(-1) ?? track.title);
  document.title = `${track.title} — Waveplayer`;
  window.history.replaceState(null, '', `#${track.id}`);
  renderQueue();
  void waveform.load(track.src);
}

function handleSnapshot(snapshot: PlayerSnapshot): void {
  const isPlaying = !snapshot.paused;
  elements.playerCard.dataset.playing = String(isPlaying);
  elements.play.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  elements.currentTime.textContent = formatTime(snapshot.currentTime);
  elements.currentTime.dateTime = `PT${Math.floor(snapshot.currentTime)}S`;
  elements.duration.textContent = formatTime(snapshot.duration);
  elements.duration.dateTime = `PT${Math.floor(snapshot.duration)}S`;
  elements.mute.classList.toggle('is-muted', snapshot.muted || snapshot.volume === 0);
  elements.mute.setAttribute('aria-label', snapshot.muted ? 'Unmute' : 'Mute');
  elements.volume.value = snapshot.volume.toString();
  elements.volume.style.setProperty('--volume', `${snapshot.volume * 100}%`);
  elements.rate.textContent = `${snapshot.playbackRate.toFixed(2).replace(/\.00$/, '').replace(/0$/, '')}×`;
  elements.rate.setAttribute('aria-label', `Playback speed, ${snapshot.playbackRate} times`);
  waveform.update(snapshot.currentTime, snapshot.duration);
}

function probeTrackDuration(track: Track): void {
  const probe = new Audio();
  probe.preload = 'metadata';
  probe.addEventListener(
    'loadedmetadata',
    () => {
      if (Number.isFinite(probe.duration)) {
        knownDurations.set(track.id, probe.duration);
        renderQueue();
      }
      probe.removeAttribute('src');
      probe.load();
    },
    { once: true },
  );
  probe.src = track.src;
}

function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith('audio/') || /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(file.name)
  );
}

async function loadLocalFile(file: File): Promise<void> {
  if (!isAudioFile(file)) {
    showToast('Choose a supported audio file.');
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  localUrls.add(objectUrl);
  const localTrack: Track = {
    id: `local-${crypto.randomUUID()}`,
    title: filenameToTitle(file.name),
    artist: 'Your library',
    subtitle: 'Local audio',
    src: objectUrl,
    accent: '#52e6c4',
    local: true,
  };

  const index = player.addTrack(localTrack);
  renderQueue();
  await player.select(index, true);
  showToast(`Loaded “${localTrack.title}” locally.`);
}

elements.play.addEventListener('click', () => void player.toggle());
elements.previous.addEventListener('click', () => void player.previous());
elements.next.addEventListener('click', () => void player.next());
elements.back.addEventListener('click', () => player.skip(-10));
elements.forward.addEventListener('click', () => player.skip(10));
elements.mute.addEventListener('click', () => player.toggleMuted());
elements.volume.addEventListener('input', () => player.setVolume(Number(elements.volume.value)));

const playbackRates = [0.75, 1, 1.25, 1.5, 2] as const;
elements.rate.addEventListener('click', () => {
  const currentRate = player.snapshot.playbackRate as (typeof playbackRates)[number];
  const currentIndex = playbackRates.indexOf(currentRate);
  const nextRate = playbackRates[(currentIndex + 1) % playbackRates.length] ?? 1;
  player.setPlaybackRate(nextRate);
});

elements.copy.addEventListener('click', async () => {
  if (player.currentTrack.local) {
    showToast('Local tracks stay on this device and cannot be linked.');
    return;
  }
  const url = new URL(window.location.href);
  url.hash = player.currentTrack.id;
  try {
    await navigator.clipboard.writeText(url.href);
    showToast('Track link copied.');
  } catch {
    showToast('Copy unavailable in this browser.');
  }
});

elements.uploadButton.addEventListener('click', () => elements.fileInput.click());
elements.fileInput.addEventListener('change', () => {
  const file = elements.fileInput.files?.[0];
  if (file) {
    void loadLocalFile(file);
  }
  elements.fileInput.value = '';
});

for (const eventName of ['dragenter', 'dragover'] as const) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('is-dragging');
  });
}

for (const eventName of ['dragleave', 'drop'] as const) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('is-dragging');
  });
}

elements.dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) {
    void loadLocalFile(file);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }

  switch (event.key.toLowerCase()) {
    case ' ':
    case 'k':
      void player.toggle();
      break;
    case 'j':
      player.skip(-10);
      break;
    case 'l':
      player.skip(10);
      break;
    case 'm':
      player.toggleMuted();
      break;
    default:
      return;
  }
  event.preventDefault();
});

player.on('change', handleSnapshot);
player.on('trackchange', ({ track, index }) => handleTrackChange(track, index));
player.on('error', (message) => showToast(message));

renderQueue();
handleTrackChange(player.currentTrack, player.snapshot.index);
handleSnapshot(player.snapshot);
for (const track of tracks) {
  probeTrackDuration(track);
}

window.addEventListener('beforeunload', () => {
  waveform.destroy();
  player.destroy();
  for (const url of localUrls) {
    URL.revokeObjectURL(url);
  }
});
