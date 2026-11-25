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
  trackTitle: query<HTMLElement>('[data-track-title]'),
  trackArtist: query<HTMLElement>('[data-track-artist]'),
  trackStatus: query<HTMLElement>('[data-track-status]'),
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
  download: query<HTMLAnchorElement>('[data-download]'),
  copy: query<HTMLButtonElement>('[data-copy]'),
  uploadButton: query<HTMLButtonElement>('[data-upload-button]'),
  fileInput: query<HTMLInputElement>('[data-file-input]'),
  dropZone: query<HTMLElement>('[data-drop-zone]'),
  localStatus: query<HTMLElement>('[data-local-status]'),
  toast: query<HTMLElement>('[data-toast]'),
};

const initialUrl = new URL(window.location.href);
const linkedTrackId = initialUrl.searchParams.get('track') ?? initialUrl.hash.slice(1);
const initialTrackIndex = Math.max(
  0,
  tracks.findIndex((track) => track.id === linkedTrackId),
);
const player = new WavePlayer(tracks, initialTrackIndex);
const knownDurations = new Map<string, number>();
const localUrls = new Set<string>();
let toastTimer: number | null = null;
let queueStateKey = '';
let dragDepth = 0;
let localFileCheck: AbortController | null = null;

const waveform = new WaveformView({
  canvas: query<HTMLCanvasElement>('[data-waveform]'),
  hoverLabel: query<HTMLOutputElement>('[data-hover-time]'),
  stateElement: query<HTMLElement>('[data-waveform-state]'),
  messageElement: query<HTMLElement>('[data-waveform-message]'),
  onSeek: (time) => player.seek(time),
  onToggle: () => void player.toggle(),
  onAnalysis: (analysis) => updateAudioAnalysis(analysis),
  onAnalysisError: () => {
    elements.audioSpec.textContent = 'Analysis unavailable';
  },
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

function renderQueue(): void {
  const fragment = document.createDocumentFragment();
  const snapshot = player.snapshot;

  player.trackList.forEach((track, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-item';
    button.dataset.trackIndex = index.toString();
    button.dataset.trackId = track.id;
    button.style.setProperty('--track-accent', track.accent);

    const action = document.createElement('span');
    action.className = 'sr-only';
    action.dataset.queueAction = '';

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
    const knownDuration = knownDurations.get(track.id);
    if (knownDuration !== undefined) {
      duration.textContent = formatTime(knownDuration);
      duration.dateTime = `PT${Math.floor(knownDuration)}S`;
    }

    const playMark = document.createElement('span');
    playMark.className = 'queue-play-mark';
    playMark.setAttribute('aria-hidden', 'true');
    button.append(action, playMark, copy, duration);
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
  syncQueueState(snapshot, true);
}

function syncQueueState(snapshot: PlayerSnapshot, force = false): void {
  const stateKey = `${snapshot.index}:${snapshot.paused}`;
  if (!force && stateKey === queueStateKey) {
    return;
  }
  queueStateKey = stateKey;

  for (const button of elements.queue.querySelectorAll<HTMLButtonElement>('.queue-item')) {
    const index = Number(button.dataset.trackIndex);
    const isCurrent = index === snapshot.index;
    const isPlaying = isCurrent && !snapshot.paused;
    button.classList.toggle('is-active', isCurrent);
    if (isCurrent) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
    const action = button.querySelector<HTMLElement>('[data-queue-action]');
    if (action) {
      action.textContent = isPlaying ? 'Pause' : 'Play';
    }
    const playMark = button.querySelector<HTMLElement>('.queue-play-mark');
    if (playMark) {
      playMark.textContent = isPlaying ? 'Ⅱ' : '▶';
    }
  }
}

function updateQueueDuration(trackId: string, duration: number): void {
  const button = Array.from(elements.queue.querySelectorAll<HTMLButtonElement>('.queue-item')).find(
    (item) => item.dataset.trackId === trackId,
  );
  const time = button?.querySelector('time');
  if (time) {
    time.textContent = formatTime(duration);
    time.dateTime = `PT${Math.floor(duration)}S`;
  }
}

function updateAudioAnalysis(analysis: AudioAnalysis): void {
  const track = player.currentTrack;
  knownDurations.set(track.id, analysis.duration);
  const channelLabel =
    analysis.channels === 1
      ? 'Mono'
      : analysis.channels === 2
        ? 'Stereo'
        : `${analysis.channels} channels`;
  const sampleRate = Number((analysis.sampleRate / 1_000).toFixed(1));
  elements.audioSpec.textContent = `${channelLabel} · ${sampleRate} kHz analysis`;
  updateQueueDuration(track.id, analysis.duration);
}

function handleTrackChange(track: Track): void {
  elements.trackTitle.textContent = track.title;
  elements.trackArtist.textContent = `${track.artist} · ${track.subtitle}`;
  elements.audioSpec.textContent = 'Reading audio details';
  elements.download.href = track.src;
  elements.download.download = track.downloadName ?? track.src.split('/').at(-1) ?? track.title;
  document.title = `${track.title} — Waveplayer`;
  void waveform.load(track.src);
}

function updateTrackUrl(track: Track): void {
  const url = new URL(window.location.href);
  if (tracks.some(({ id }) => `#${id}` === url.hash)) {
    url.hash = '';
  }
  if (track.local) {
    url.searchParams.delete('track');
  } else {
    url.searchParams.set('track', track.id);
  }
  window.history.replaceState(null, '', url);
}

function handleSnapshot(snapshot: PlayerSnapshot): void {
  const isPlaying = !snapshot.paused;
  const status = isPlaying ? 'Playing' : snapshot.ready ? 'Paused' : 'Loading track';
  if (elements.trackStatus.textContent !== status) {
    elements.trackStatus.textContent = status;
  }
  elements.playerCard.dataset.playing = String(isPlaying);
  elements.play.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  elements.currentTime.textContent = formatTime(snapshot.currentTime);
  elements.currentTime.dateTime = `PT${Math.floor(snapshot.currentTime)}S`;
  elements.duration.textContent = formatTime(snapshot.duration);
  elements.duration.dateTime = `PT${Math.floor(snapshot.duration)}S`;
  const isSilent = snapshot.muted || snapshot.volume === 0;
  elements.mute.classList.toggle('is-muted', isSilent);
  elements.mute.setAttribute('aria-label', isSilent ? 'Unmute' : 'Mute');
  elements.volume.value = snapshot.volume.toString();
  elements.volume.style.setProperty('--volume', `${snapshot.volume * 100}%`);
  elements.rate.textContent = `${snapshot.playbackRate.toFixed(2).replace(/\.00$/, '').replace(/0$/, '')}×`;
  elements.rate.setAttribute('aria-label', `Playback speed, ${snapshot.playbackRate} times`);
  syncQueueState(snapshot);
  waveform.update(snapshot.currentTime, snapshot.duration);
}

function probeTrackDuration(track: Track): void {
  const probe = new Audio();
  const controller = new AbortController();
  probe.preload = 'metadata';
  const release = (): void => {
    controller.abort();
    probe.removeAttribute('src');
    probe.load();
  };
  probe.addEventListener(
    'loadedmetadata',
    () => {
      if (Number.isFinite(probe.duration)) {
        knownDurations.set(track.id, probe.duration);
        updateQueueDuration(track.id, probe.duration);
      }
      release();
    },
    { once: true, signal: controller.signal },
  );
  probe.addEventListener('error', release, { once: true, signal: controller.signal });
  probe.src = track.src;
}

function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith('audio/') || /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(file.name)
  );
}

function showLocalStatus(message: string, error = false): void {
  elements.localStatus.textContent = message;
  elements.localStatus.toggleAttribute('data-error', error);
}

async function canPlayLocalSource(source: string, signal: AbortSignal): Promise<boolean> {
  const probe = new Audio();
  probe.preload = 'auto';
  const listeners = new AbortController();
  try {
    return await new Promise<boolean>((resolve) => {
      const options = { once: true, signal: listeners.signal };
      probe.addEventListener('canplay', () => resolve(true), options);
      probe.addEventListener('error', () => resolve(false), options);
      signal.addEventListener('abort', () => resolve(false), options);
      probe.src = source;
    });
  } finally {
    listeners.abort();
    probe.removeAttribute('src');
    probe.load();
  }
}

async function loadLocalFile(file: File): Promise<void> {
  localFileCheck?.abort();
  localFileCheck = null;
  if (!isAudioFile(file)) {
    showLocalStatus('Choose a supported audio file, such as MP3, WAV, or OGG.', true);
    return;
  }

  const check = new AbortController();
  localFileCheck = check;
  showLocalStatus(`Checking “${file.name}”…`);
  const objectUrl = URL.createObjectURL(file);
  const signal = AbortSignal.any([check.signal, AbortSignal.timeout(10_000)]);
  const playable = await canPlayLocalSource(objectUrl, signal);
  if (check.signal.aborted || !playable) {
    URL.revokeObjectURL(objectUrl);
    if (!check.signal.aborted) {
      localFileCheck = null;
      showLocalStatus(`Could not open “${file.name}”. Choose a different audio file.`, true);
    }
    return;
  }

  localFileCheck = null;
  localUrls.add(objectUrl);
  const localTrack: Track = {
    id: `local-${player.trackList.length}`,
    title: filenameToTitle(file.name),
    artist: 'Your library',
    subtitle: 'Local audio',
    src: objectUrl,
    accent: '#52e6c4',
    downloadName: file.name,
    local: true,
  };

  const index = player.addTrack(localTrack);
  renderQueue();
  await player.select(index, false);
  showLocalStatus(`Opened “${file.name}” on this device.`);
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
  url.searchParams.set('track', player.currentTrack.id);
  url.hash = 'player';
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

elements.dropZone.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  elements.dropZone.classList.add('is-dragging');
});

elements.dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
});

elements.dropZone.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    elements.dropZone.classList.remove('is-dragging');
  }
});

elements.dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  elements.dropZone.classList.remove('is-dragging');
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
player.on('trackchange', ({ track }) => {
  updateTrackUrl(track);
  handleTrackChange(track);
});
player.on('error', (message) => {
  showToast(player.currentTrack.local ? 'This audio file could not be played.' : message);
});

renderQueue();
handleTrackChange(player.currentTrack);
handleSnapshot(player.snapshot);
for (const track of tracks) {
  probeTrackDuration(track);
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    return;
  }
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  localFileCheck?.abort();
  waveform.destroy();
  player.destroy();
  for (const url of localUrls) {
    URL.revokeObjectURL(url);
  }
});
