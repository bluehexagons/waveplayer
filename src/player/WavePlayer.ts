import type { PlayerEventMap, PlayerSnapshot, Track } from './types';
import { clamp } from './utils';

type Listener<T> = (payload: T) => void;

export class WavePlayer {
  private readonly audio = new Audio();
  private readonly listeners = new Map<keyof PlayerEventMap, Set<Listener<unknown>>>();
  private readonly eventController = new AbortController();
  private readonly tracks: Track[];
  private activeIndex = 0;
  private animationFrame: number | null = null;

  constructor(tracks: readonly Track[], initialIndex = 0) {
    if (tracks.length === 0) {
      throw new Error('WavePlayer requires at least one track.');
    }

    this.tracks = [...tracks];
    this.activeIndex = clamp(Math.floor(initialIndex), 0, this.tracks.length - 1);
    this.audio.preload = 'metadata';
    this.audio.volume = 0.82;
    this.bindAudioEvents();
    this.loadCurrentTrack();
  }

  get currentTrack(): Track {
    const track = this.tracks[this.activeIndex];
    if (!track) {
      throw new Error('The active track is unavailable.');
    }
    return track;
  }

  get trackList(): readonly Track[] {
    return this.tracks;
  }

  get snapshot(): PlayerSnapshot {
    return {
      track: this.currentTrack,
      index: this.activeIndex,
      currentTime: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
      paused: this.audio.paused,
      muted: this.audio.muted,
      volume: this.audio.volume,
      playbackRate: this.audio.playbackRate,
      ready: this.audio.readyState >= HTMLMediaElement.HAVE_METADATA,
    };
  }

  on<EventName extends keyof PlayerEventMap>(
    eventName: EventName,
    listener: Listener<PlayerEventMap[EventName]>,
  ): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set<Listener<unknown>>();
    listeners.add(listener as Listener<unknown>);
    this.listeners.set(eventName, listeners);

    return () => listeners.delete(listener as Listener<unknown>);
  }

  async play(): Promise<boolean> {
    try {
      await this.audio.play();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playback could not start.';
      this.emit('error', message);
      return false;
    }
  }

  pause(): void {
    this.audio.pause();
  }

  async toggle(): Promise<void> {
    if (this.audio.paused) {
      await this.play();
    } else {
      this.pause();
    }
  }

  seek(time: number): void {
    const duration = this.snapshot.duration;
    this.audio.currentTime = clamp(time, 0, duration || 0);
    this.emitChange();
  }

  skip(seconds: number): void {
    this.seek(this.audio.currentTime + seconds);
  }

  async select(index: number, autoplay = !this.audio.paused): Promise<void> {
    const normalizedIndex =
      ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    if (normalizedIndex === this.activeIndex) {
      if (autoplay) {
        await this.play();
      }
      return;
    }

    this.audio.pause();
    this.activeIndex = normalizedIndex;
    this.loadCurrentTrack();

    if (autoplay) {
      await this.play();
    }
  }

  async previous(): Promise<void> {
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    await this.select(this.activeIndex - 1);
  }

  async next(autoplay = !this.audio.paused): Promise<void> {
    await this.select(this.activeIndex + 1, autoplay);
  }

  addTrack(track: Track): number {
    this.tracks.push(track);
    return this.tracks.length - 1;
  }

  setVolume(value: number): void {
    this.audio.volume = clamp(value, 0, 1);
    if (this.audio.volume > 0) {
      this.audio.muted = false;
    }
  }

  toggleMuted(): void {
    this.audio.muted = !this.audio.muted;
  }

  setPlaybackRate(rate: number): void {
    this.audio.playbackRate = clamp(rate, 0.5, 2);
  }

  destroy(): void {
    this.stopAnimation();
    this.eventController.abort();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.listeners.clear();
  }

  private bindAudioEvents(): void {
    const signal = this.eventController.signal;
    const updateEvents = [
      'loadedmetadata',
      'durationchange',
      'volumechange',
      'ratechange',
    ] as const;

    for (const eventName of updateEvents) {
      this.audio.addEventListener(eventName, this.emitChange, { signal });
    }

    this.audio.addEventListener(
      'play',
      () => {
        this.startAnimation();
        this.emitChange();
      },
      { signal },
    );

    this.audio.addEventListener(
      'pause',
      () => {
        this.stopAnimation();
        this.emitChange();
      },
      { signal },
    );

    this.audio.addEventListener(
      'ended',
      () => {
        void this.next(true);
      },
      { signal },
    );

    this.audio.addEventListener(
      'error',
      () => {
        const message = this.audio.error?.message || 'This audio file could not be loaded.';
        this.emit('error', message);
      },
      { signal },
    );
  }

  private loadCurrentTrack(): void {
    this.audio.src = this.currentTrack.src;
    this.audio.load();
    this.updateMediaSession();
    this.emit('trackchange', { index: this.activeIndex, track: this.currentTrack });
    this.emitChange();
  }

  private updateMediaSession(): void {
    if (!('mediaSession' in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.currentTrack.title,
      artist: this.currentTrack.artist,
      album: 'Waveplayer Sessions',
    });

    const actions: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => void this.play(),
      pause: () => this.pause(),
      previoustrack: () => void this.previous(),
      nexttrack: () => void this.next(),
      seekbackward: (details) => this.skip(-(details.seekOffset ?? 10)),
      seekforward: (details) => this.skip(details.seekOffset ?? 10),
      seekto: (details) => {
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      },
    };

    for (const [action, handler] of Object.entries(actions)) {
      try {
        navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler ?? null);
      } catch {
        // Some browsers expose Media Session but implement only a subset of its actions.
      }
    }
  }

  private readonly emitChange = (): void => {
    this.emit('change', this.snapshot);
  };

  private readonly tick = (): void => {
    this.emitChange();
    if (!this.audio.paused) {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  };

  private startAnimation(): void {
    if (this.animationFrame === null) {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  }

  private stopAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private emit<EventName extends keyof PlayerEventMap>(
    eventName: EventName,
    payload: PlayerEventMap[EventName],
  ): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(payload);
    }
  }
}
