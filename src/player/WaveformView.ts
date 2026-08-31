import type { AudioAnalysis } from './types';
import { clamp, createWaveformAnalysis, formatTime, type WaveformAnalysisData } from './utils';

interface WaveformViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly hoverLabel: HTMLOutputElement;
  readonly stateElement: HTMLElement;
  readonly messageElement: HTMLElement;
  readonly onAnalysis: (analysis: AudioAnalysis) => void;
  readonly onSeek: (time: number) => void;
  readonly onToggle: () => void;
}

interface DisplayWaveform {
  readonly minimums: Float32Array<ArrayBuffer>;
  readonly maximums: Float32Array<ArrayBuffer>;
  readonly rootMeanSquares: Float32Array<ArrayBuffer>;
  readonly onsets: Float32Array<ArrayBuffer>;
  readonly texture: Float32Array<ArrayBuffer>;
}

interface WaveformPalette {
  readonly envelopeFill: string;
  readonly envelopeStroke: string;
  readonly energyFill: string;
  readonly onset: string;
  readonly texture: string;
}

const REMAINING_PALETTE: WaveformPalette = {
  envelopeFill: 'rgba(247, 245, 238, 0.07)',
  envelopeStroke: 'rgba(247, 245, 238, 0.34)',
  energyFill: 'rgba(247, 245, 238, 0.17)',
  onset: '#ff9b7b',
  texture: 'rgba(179, 168, 255, 0.62)',
};

const PLAYED_PALETTE: WaveformPalette = {
  envelopeFill: 'rgba(216, 255, 69, 0.13)',
  envelopeStroke: '#d8ff45',
  energyFill: 'rgba(216, 255, 69, 0.34)',
  onset: '#f7f5ee',
  texture: '#c7bdff',
};

function chooseTimeStep(duration: number, width: number): number {
  if (duration <= 0) {
    return 0;
  }

  const targetLines = Math.max(2, Math.floor(width / 105));
  const rawStep = duration / targetLines;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));

  for (const multiplier of [1, 2, 5, 10]) {
    const step = multiplier * magnitude;
    if (step >= rawStep) {
      return step;
    }
  }

  return rawStep;
}

function displayAmplitude(value: number): number {
  return Math.abs(value) ** 0.72;
}

export class WaveformView {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly remainingLayer = document.createElement('canvas');
  private readonly playedLayer = document.createElement('canvas');
  private readonly remainingContext: CanvasRenderingContext2D;
  private readonly playedContext: CanvasRenderingContext2D;
  private readonly hoverLabel: HTMLOutputElement;
  private readonly stateElement: HTMLElement;
  private readonly messageElement: HTMLElement;
  private readonly onAnalysis: (analysis: AudioAnalysis) => void;
  private readonly onSeek: (time: number) => void;
  private readonly onToggle: () => void;
  private readonly eventController = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private analysis: WaveformAnalysisData | null = null;
  private currentTime = 0;
  private duration = 0;
  private hoverRatio: number | null = null;
  private dragging = false;
  private pixelRatio = 1;
  private layersReady = false;
  private loadController: AbortController | null = null;
  private loadSequence = 0;

  constructor(options: WaveformViewOptions) {
    this.canvas = options.canvas;
    const context = this.canvas.getContext('2d');
    const remainingContext = this.remainingLayer.getContext('2d');
    const playedContext = this.playedLayer.getContext('2d');
    if (!context || !remainingContext || !playedContext) {
      throw new Error('Canvas rendering is not supported by this browser.');
    }
    this.context = context;
    this.remainingContext = remainingContext;
    this.playedContext = playedContext;
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
    this.analysis = null;
    this.currentTime = 0;
    this.duration = 0;
    this.layersReady = false;
    delete this.canvas.dataset.analysisBins;
    delete this.canvas.dataset.waveformDetail;
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

      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (sequence !== this.loadSequence) {
        return;
      }

      this.analysis = createWaveformAnalysis(audioBuffer);
      this.duration = audioBuffer.duration;
      this.canvas.dataset.analysisBins = this.analysis.maximums.length.toString();
      this.canvas.dataset.waveformDetail = 'ready';
      this.layersReady = false;
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
    this.analysis = null;
    this.remainingLayer.width = 1;
    this.remainingLayer.height = 1;
    this.playedLayer.width = 1;
    this.playedLayer.height = 1;
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
      this.layersReady = false;
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
    this.hoverLabel.value = `${formatTime(ratio * this.duration)} · ${this.describePosition(ratio)}`;
    this.hoverLabel.style.left = `${clamp(ratio * bounds.width, 58, bounds.width - 58)}px`;
    this.hoverLabel.classList.add('is-visible');
    this.render();
  }

  private describePosition(ratio: number): string {
    const analysis = this.analysis;
    if (!analysis || analysis.rootMeanSquares.length === 0) {
      return 'loading';
    }

    const index = Math.min(
      analysis.rootMeanSquares.length - 1,
      Math.floor(ratio * analysis.rootMeanSquares.length),
    );
    const energy = analysis.rootMeanSquares[index] ?? 0;
    const onset = analysis.onsets[index] ?? 0;
    const texture = analysis.texture[index] ?? 0;

    if (onset >= 0.58) {
      return 'onset';
    }
    if (energy < 0.045) {
      return 'quiet';
    }
    if (texture >= 0.62) {
      return 'dense';
    }
    if (energy >= 0.62) {
      return 'loud';
    }
    return 'active';
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
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.analysis || this.analysis.maximums.length === 0) {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.drawGrid(context, width, height);
      this.drawPlaceholder(context, width, height);
      return;
    }

    if (!this.layersReady) {
      this.rebuildLayers(width, height);
    }

    context.drawImage(this.remainingLayer, 0, 0);
    const progress = this.duration > 0 ? clamp(this.currentTime / this.duration, 0, 1) : 0;
    const playedWidth = Math.round(this.canvas.width * progress);
    if (playedWidth > 0) {
      context.drawImage(
        this.playedLayer,
        0,
        0,
        playedWidth,
        this.canvas.height,
        0,
        0,
        playedWidth,
        this.canvas.height,
      );
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const progressX = clamp(progress * width, 1, width - 1);
    context.beginPath();
    context.moveTo(progressX, 22);
    context.lineTo(progressX, height - 22);
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(247, 245, 238, 0.24)';
    context.stroke();
    context.beginPath();
    context.arc(progressX, height / 2, 3.5, 0, Math.PI * 2);
    context.fillStyle = '#f7f5ee';
    context.fill();

    if (this.hoverRatio !== null) {
      const hoverX = this.hoverRatio * width;
      context.beginPath();
      context.moveTo(hoverX, 6);
      context.lineTo(hoverX, height - 6);
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(247, 245, 238, 0.75)';
      context.stroke();
    }
  }

  private rebuildLayers(width: number, height: number): void {
    // The expensive paths are rasterized only after analysis or resize; playback just crops them.
    this.remainingLayer.width = this.canvas.width;
    this.remainingLayer.height = this.canvas.height;
    this.playedLayer.width = this.canvas.width;
    this.playedLayer.height = this.canvas.height;

    for (const context of [this.remainingContext, this.playedContext]) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }

    const display = this.createDisplayWaveform(width);
    this.drawGrid(this.remainingContext, width, height);
    this.drawWaveform(this.remainingContext, display, width, height, REMAINING_PALETTE);
    this.drawWaveform(this.playedContext, display, width, height, PLAYED_PALETTE);
    this.layersReady = true;
  }

  private createDisplayWaveform(width: number): DisplayWaveform {
    const analysis = this.analysis;
    if (!analysis) {
      throw new Error('Waveform analysis is unavailable.');
    }

    const sourceCount = analysis.maximums.length;
    const count = Math.max(1, Math.min(sourceCount, Math.ceil(width)));
    const minimums = new Float32Array(count);
    const maximums = new Float32Array(count);
    const rootMeanSquares = new Float32Array(count);
    const onsets = new Float32Array(count);
    const texture = new Float32Array(count);

    for (let column = 0; column < count; column += 1) {
      const start = Math.floor((column * sourceCount) / count);
      const end = Math.max(start + 1, Math.floor(((column + 1) * sourceCount) / count));
      let minimum = 1;
      let maximum = -1;
      let energy = 0;
      let onset = 0;
      let detail = 0;

      for (let index = start; index < end; index += 1) {
        minimum = Math.min(minimum, analysis.minimums[index] ?? 0);
        maximum = Math.max(maximum, analysis.maximums[index] ?? 0);
        energy = Math.max(energy, analysis.rootMeanSquares[index] ?? 0);
        onset = Math.max(onset, analysis.onsets[index] ?? 0);
        detail = Math.max(detail, analysis.texture[index] ?? 0);
      }

      minimums[column] = minimum;
      maximums[column] = maximum;
      rootMeanSquares[column] = energy;
      onsets[column] = onset;
      texture[column] = detail;
    }

    return { minimums, maximums, rootMeanSquares, onsets, texture };
  }

  private drawWaveform(
    context: CanvasRenderingContext2D,
    waveform: DisplayWaveform,
    width: number,
    height: number,
    palette: WaveformPalette,
  ): void {
    const count = waveform.maximums.length;
    const center = height / 2;
    const amplitudeHeight = Math.max(1, (height - 54) / 2);
    const xAt = (index: number): number => (index / Math.max(1, count - 1)) * width;
    const topAt = (index: number): number =>
      center - displayAmplitude(Math.max(0, waveform.maximums[index] ?? 0)) * amplitudeHeight;
    const bottomAt = (index: number): number =>
      center + displayAmplitude(Math.max(0, -(waveform.minimums[index] ?? 0))) * amplitudeHeight;

    const envelope = new Path2D();
    envelope.moveTo(0, center);
    for (let index = 0; index < count; index += 1) {
      envelope.lineTo(xAt(index), topAt(index));
    }
    for (let index = count - 1; index >= 0; index -= 1) {
      envelope.lineTo(xAt(index), bottomAt(index));
    }
    envelope.closePath();
    context.fillStyle = palette.envelopeFill;
    context.fill(envelope);

    const energy = new Path2D();
    energy.moveTo(0, center);
    for (let index = 0; index < count; index += 1) {
      const energyHeight =
        displayAmplitude(waveform.rootMeanSquares[index] ?? 0) * amplitudeHeight * 0.72;
      energy.lineTo(xAt(index), center - energyHeight);
    }
    for (let index = count - 1; index >= 0; index -= 1) {
      const energyHeight =
        displayAmplitude(waveform.rootMeanSquares[index] ?? 0) * amplitudeHeight * 0.72;
      energy.lineTo(xAt(index), center + energyHeight);
    }
    energy.closePath();
    context.fillStyle = palette.energyFill;
    context.fill(energy);

    const upperOutline = new Path2D();
    const lowerOutline = new Path2D();
    for (let index = 0; index < count; index += 1) {
      if (index === 0) {
        upperOutline.moveTo(xAt(index), topAt(index));
        lowerOutline.moveTo(xAt(index), bottomAt(index));
      } else {
        upperOutline.lineTo(xAt(index), topAt(index));
        lowerOutline.lineTo(xAt(index), bottomAt(index));
      }
    }
    context.lineWidth = 0.8;
    context.lineJoin = 'round';
    context.strokeStyle = palette.envelopeStroke;
    context.stroke(upperOutline);
    context.stroke(lowerOutline);

    const textureRail = new Path2D();
    const textureBaseline = height - 16;
    for (let index = 0; index < count; index += 1) {
      const value = waveform.texture[index] ?? 0;
      if (value < 0.08) {
        continue;
      }
      const x = xAt(index);
      textureRail.moveTo(x, textureBaseline);
      textureRail.lineTo(x, textureBaseline - value * 6);
    }
    context.lineWidth = 0.75;
    context.strokeStyle = palette.texture;
    context.stroke(textureRail);

    const onsetMarks = new Path2D();
    for (let index = 1; index < count - 1; index += 1) {
      const value = waveform.onsets[index] ?? 0;
      if (
        value < 0.44 ||
        value < (waveform.onsets[index - 1] ?? 0) ||
        value < (waveform.onsets[index + 1] ?? 0)
      ) {
        continue;
      }
      const x = xAt(index);
      onsetMarks.moveTo(x, 7);
      onsetMarks.lineTo(x, 11 + value * 8);
    }
    context.lineWidth = 1.25;
    context.strokeStyle = palette.onset;
    context.stroke(onsetMarks);
  }

  private drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(247, 245, 238, 0.075)';
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);

    const timeStep = chooseTimeStep(this.duration, width);
    if (timeStep > 0) {
      for (let time = timeStep; time < this.duration; time += timeStep) {
        const x = (time / this.duration) * width;
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
    } else {
      for (let line = 1; line < 8; line += 1) {
        const x = (line / 8) * width;
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
    }
    context.stroke();

    if (timeStep <= 0) {
      return;
    }
    context.fillStyle = 'rgba(247, 245, 238, 0.38)';
    context.font = '600 8px ui-monospace, SFMono-Regular, Consolas, monospace';
    context.textBaseline = 'bottom';
    for (let time = timeStep; time < this.duration; time += timeStep) {
      const x = (time / this.duration) * width;
      context.fillText(formatTime(time), x + 4, height - 4);
    }
  }

  private drawPlaceholder(context: CanvasRenderingContext2D, width: number, height: number): void {
    const center = height / 2;
    context.beginPath();
    for (let x = 0; x < width; x += 5) {
      const wave = 5 + Math.abs(Math.sin(x * 0.025)) * 12;
      context.moveTo(x, center - wave);
      context.lineTo(x, center + wave);
    }
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(247, 245, 238, 0.11)';
    context.stroke();
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
