import type { AudioAnalysis } from './types';
import { clamp, createWaveformPeaks, formatTime } from './utils';

interface WaveformViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly hoverLabel: HTMLOutputElement;
  readonly stateElement: HTMLElement;
  readonly messageElement: HTMLElement;
  readonly onAnalysis: (analysis: AudioAnalysis) => void;
  readonly onSeek: (time: number) => void;
  readonly onToggle: () => void;
}

export class WaveformView {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly hoverLabel: HTMLOutputElement;
  private readonly stateElement: HTMLElement;
  private readonly messageElement: HTMLElement;
  private readonly onAnalysis: (analysis: AudioAnalysis) => void;
  private readonly onSeek: (time: number) => void;
  private readonly onToggle: () => void;
  private readonly eventController = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private peaks: Float32Array<ArrayBufferLike> = new Float32Array();
  private currentTime = 0;
  private duration = 0;
  private hoverRatio: number | null = null;
  private dragging = false;
  private pixelRatio = 1;
  private loadController: AbortController | null = null;
  private loadSequence = 0;

  constructor(options: WaveformViewOptions) {
    this.canvas = options.canvas;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is not supported by this browser.');
    }
    this.context = context;
    this.hoverLabel = options.hoverLabel;
    this.stateElement = options.stateElement;
    this.messageElement = options.messageElement;
    this.onAnalysis = options.onAnalysis;
    this.onSeek = options.onSeek;
    this.onToggle = options.onToggle;
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas);
    this.bindEvents();
    window.addEventListener('resize', this.resize, { signal: this.eventController.signal });
  }

  async load(source: string): Promise<void> {
    this.loadController?.abort();
    this.loadController = new AbortController();
    const sequence = ++this.loadSequence;
    this.peaks = new Float32Array();
    this.showState('Reading waveform…');
    this.render();

    try {
      const response = await fetch(source, { signal: this.loadController.signal });
      if (!response.ok) {
        throw new Error(`Audio request failed with status ${response.status}.`);
      }

      const encodedAudio = await response.arrayBuffer();
      const audioContext = new AudioContext();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(encodedAudio);
      } finally {
        await audioContext.close();
      }

      if (sequence !== this.loadSequence) {
        return;
      }

      this.peaks = createWaveformPeaks(audioBuffer);
      this.duration = audioBuffer.duration;
      this.onAnalysis({
        channels: audioBuffer.numberOfChannels,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
      });
      this.hideState();
      this.updateAria();
      this.render();
    } catch (error) {
      if (sequence !== this.loadSequence) {
        return;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      this.showState('Waveform unavailable — playback still works.', true);
      this.render();
    }
  }

  update(currentTime: number, duration: number): void {
    this.currentTime = Number.isFinite(currentTime) ? currentTime : 0;
    if (Number.isFinite(duration) && duration > 0) {
      this.duration = duration;
    }
    this.updateAria();
    this.render();
  }

  destroy(): void {
    this.loadController?.abort();
    this.resizeObserver.disconnect();
    this.eventController.abort();
    this.dragging = false;
    this.hoverRatio = null;
    this.hoverLabel.classList.remove('is-visible');
  }

  private bindEvents(): void {
    const options = { signal: this.eventController.signal };
    this.canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
          return;
        }
        this.dragging = true;
        this.canvas.focus({ preventScroll: true });
        this.canvas.setPointerCapture(event.pointerId);
        this.seekFromPointer(event);
        event.preventDefault();
      },
      options,
    );

    this.canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!event.isPrimary) {
          return;
        }
        this.showHover(event);
        if (this.dragging) {
          this.seekFromPointer(event);
        }
      },
      options,
    );

    this.canvas.addEventListener(
      'pointerup',
      (event) => {
        this.dragging = false;
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        if (event.pointerType !== 'mouse') {
          this.hideHover();
        }
      },
      options,
    );

    this.canvas.addEventListener(
      'pointercancel',
      () => {
        this.dragging = false;
        this.hideHover();
      },
      options,
    );

    this.canvas.addEventListener(
      'pointerleave',
      () => {
        if (!this.dragging) {
          this.hideHover();
        }
      },
      options,
    );

    this.canvas.addEventListener(
      'dblclick',
      (event) => {
        event.preventDefault();
        this.onToggle();
      },
      options,
    );

    this.canvas.addEventListener(
      'keydown',
      (event) => {
        const jump = event.shiftKey ? 15 : 5;
        let nextTime: number | null = null;

        switch (event.key) {
          case ' ':
          case 'Enter':
            this.onToggle();
            break;
          case 'ArrowLeft':
          case 'ArrowDown':
            nextTime = this.currentTime - jump;
            break;
          case 'ArrowRight':
          case 'ArrowUp':
            nextTime = this.currentTime + jump;
            break;
          case 'Home':
            nextTime = 0;
            break;
          case 'End':
            nextTime = this.duration;
            break;
          default:
            return;
        }

        if (nextTime !== null) {
          this.onSeek(clamp(nextTime, 0, this.duration));
        }
        event.preventDefault();
      },
      options,
    );
  }

  private readonly resize = (): void => {
    const bounds = this.canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    this.pixelRatio = pixelRatio;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.render();
    }
  };

  private seekFromPointer(event: PointerEvent): void {
    const ratio = this.pointerRatio(event);
    this.onSeek(ratio * this.duration);
  }

  private showHover(event: PointerEvent): void {
    const ratio = this.pointerRatio(event);
    const bounds = this.canvas.getBoundingClientRect();
    this.hoverRatio = ratio;
    this.hoverLabel.value = formatTime(ratio * this.duration);
    this.hoverLabel.style.left = `${clamp(ratio * bounds.width, 30, bounds.width - 30)}px`;
    this.hoverLabel.classList.add('is-visible');
    this.render();
  }

  private pointerRatio(event: PointerEvent): number {
    const bounds = this.canvas.getBoundingClientRect();
    return clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  }

  private hideHover(): void {
    this.hoverRatio = null;
    this.hoverLabel.classList.remove('is-visible');
    this.render();
  }

  private render(): void {
    const pixelRatio = this.pixelRatio;
    const width = this.canvas.width / pixelRatio;
    const height = this.canvas.height / pixelRatio;
    if (width <= 1 || height <= 1) {
      return;
    }

    const context = this.context;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    this.drawGrid(width, height);

    if (this.peaks.length === 0) {
      this.drawPlaceholder(width, height);
      return;
    }

    const progress = this.duration > 0 ? clamp(this.currentTime / this.duration, 0, 1) : 0;
    const center = height / 2;
    const verticalPadding = 26;
    const amplitudeHeight = (height - verticalPadding * 2) / 2;
    const gap = width < 560 ? 3 : 4;
    const barCount = Math.max(1, Math.floor(width / gap));
    const playedPath = new Path2D();
    const remainingPath = new Path2D();

    for (let index = 0; index < barCount; index += 1) {
      const x = (index / Math.max(1, barCount - 1)) * width;
      const peakIndex = Math.min(
        this.peaks.length - 1,
        Math.floor((index / barCount) * this.peaks.length),
      );
      const peak = this.peaks[peakIndex] ?? 0;
      const barHeight = Math.max(2, peak * amplitudeHeight);
      const path = x / width <= progress ? playedPath : remainingPath;
      path.moveTo(x, center - barHeight);
      path.lineTo(x, center + barHeight);
    }

    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#d8ff45';
    context.stroke(playedPath);
    context.strokeStyle = 'rgba(247, 245, 238, 0.26)';
    context.stroke(remainingPath);

    const progressX = progress * width;
    context.beginPath();
    context.arc(progressX, center, 3.5, 0, Math.PI * 2);
    context.fillStyle = '#f7f5ee';
    context.fill();

    if (this.hoverRatio !== null) {
      const hoverX = this.hoverRatio * width;
      context.beginPath();
      context.moveTo(hoverX, 13);
      context.lineTo(hoverX, height - 13);
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(247, 245, 238, 0.72)';
      context.stroke();
    }
  }

  private drawGrid(width: number, height: number): void {
    this.context.lineWidth = 1;
    this.context.strokeStyle = 'rgba(247, 245, 238, 0.075)';
    this.context.beginPath();

    for (let line = 1; line < 8; line += 1) {
      const x = (line / 8) * width;
      this.context.moveTo(x, 0);
      this.context.lineTo(x, height);
    }
    this.context.moveTo(0, height / 2);
    this.context.lineTo(width, height / 2);
    this.context.stroke();
  }

  private drawPlaceholder(width: number, height: number): void {
    const center = height / 2;
    this.context.beginPath();
    for (let x = 0; x < width; x += 5) {
      const wave = 5 + Math.abs(Math.sin(x * 0.025)) * 12;
      this.context.moveTo(x, center - wave);
      this.context.lineTo(x, center + wave);
    }
    this.context.lineWidth = 2;
    this.context.lineCap = 'round';
    this.context.strokeStyle = 'rgba(247, 245, 238, 0.11)';
    this.context.stroke();
  }

  private updateAria(): void {
    this.canvas.setAttribute('aria-valuemax', Math.round(this.duration).toString());
    this.canvas.setAttribute('aria-valuenow', Math.round(this.currentTime).toString());
    this.canvas.setAttribute(
      'aria-valuetext',
      `${formatTime(this.currentTime)} of ${formatTime(this.duration)}`,
    );
  }

  private showState(message: string, isError = false): void {
    this.messageElement.textContent = message;
    this.stateElement.removeAttribute('aria-hidden');
    this.stateElement.classList.remove('is-hidden');
    this.stateElement.classList.toggle('is-error', isError);
  }

  private hideState(): void {
    this.stateElement.setAttribute('aria-hidden', 'true');
    this.stateElement.classList.add('is-hidden');
    this.stateElement.classList.remove('is-error');
  }
}
