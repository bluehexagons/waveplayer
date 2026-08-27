export interface Track {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly subtitle: string;
  readonly src: string;
  readonly accent: string;
  readonly local?: boolean;
}

export interface PlayerSnapshot {
  readonly track: Track;
  readonly index: number;
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly muted: boolean;
  readonly volume: number;
  readonly playbackRate: number;
  readonly ready: boolean;
}

export interface AudioAnalysis {
  readonly channels: number;
  readonly duration: number;
  readonly sampleRate: number;
}

export interface PlayerEventMap {
  readonly change: PlayerSnapshot;
  readonly error: string;
  readonly trackchange: {
    readonly index: number;
    readonly track: Track;
  };
}
