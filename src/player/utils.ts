export const clamp = (value: number, minimum: number, maximum: number): number =>
  Number.isNaN(value) ? minimum : Math.min(Math.max(value, minimum), maximum);

export function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(value);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3_600);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function filenameToTitle(filename: string): string {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '');
  const normalized = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return 'Untitled audio';
  }

  return normalized.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

export interface WaveformSource {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate?: number;
  getChannelData(channel: number): Float32Array;
}

export interface WaveformAnalysisData {
  readonly minimums: Float32Array<ArrayBuffer>;
  readonly maximums: Float32Array<ArrayBuffer>;
  readonly rootMeanSquares: Float32Array<ArrayBuffer>;
  readonly onsets: Float32Array<ArrayBuffer>;
  readonly texture: Float32Array<ArrayBuffer>;
}

const DEFAULT_WAVEFORM_BINS = 4_096;
// Long recordings stay responsive without changing the visual resolution of the overview.
const MAX_FRAMES_PER_BIN = 1_024;

function percentile(values: Float32Array<ArrayBuffer>, ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.slice().sort();
  const index = Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio));
  return sorted[index] ?? 0;
}

function normalize(values: Float32Array<ArrayBuffer>, reference: number): void {
  if (reference <= Number.EPSILON) {
    values.fill(0);
    return;
  }

  for (let index = 0; index < values.length; index += 1) {
    values[index] = clamp((values[index] ?? 0) / reference, 0, 1);
  }
}

function maximumValue(values: Float32Array<ArrayBuffer>): number {
  let maximum = 0;
  for (const value of values) {
    maximum = Math.max(maximum, value);
  }
  return maximum;
}

export function createWaveformAnalysis(
  source: WaveformSource,
  sampleCount = DEFAULT_WAVEFORM_BINS,
): WaveformAnalysisData {
  if (source.length === 0 || source.numberOfChannels === 0 || sampleCount < 1) {
    const empty = (): Float32Array<ArrayBuffer> => new Float32Array();
    return {
      minimums: empty(),
      maximums: empty(),
      rootMeanSquares: empty(),
      onsets: empty(),
      texture: empty(),
    };
  }

  const count = Math.min(Math.floor(sampleCount), source.length);
  const minimums = new Float32Array(count);
  const maximums = new Float32Array(count);
  const rootMeanSquares = new Float32Array(count);
  const onsets = new Float32Array(count);
  const texture = new Float32Array(count);
  const magnitudes = new Float32Array(count);
  const channels = Array.from({ length: source.numberOfChannels }, (_, channel) =>
    source.getChannelData(channel),
  );
  let largestPeak = 0;

  for (let bin = 0; bin < count; bin += 1) {
    const start = Math.floor((bin * source.length) / count);
    const end = Math.max(start + 1, Math.floor(((bin + 1) * source.length) / count));
    const stride = Math.max(1, Math.ceil((end - start) / MAX_FRAMES_PER_BIN));
    let minimum = 1;
    let maximum = -1;
    let squareTotal = 0;
    let variationTotal = 0;
    let variationCount = 0;
    let visited = 0;

    for (const channel of channels) {
      let previousSample: number | null = null;
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += stride) {
        const sample = channel[sampleIndex] ?? 0;
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
        squareTotal += sample * sample;
        visited += 1;

        if (previousSample !== null) {
          variationTotal += Math.abs(sample - previousSample);
          variationCount += 1;
        }
        previousSample = sample;
      }
    }

    const rootMeanSquare = visited > 0 ? Math.sqrt(squareTotal / visited) : 0;
    const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum));
    minimums[bin] = minimum;
    maximums[bin] = maximum;
    rootMeanSquares[bin] = rootMeanSquare;
    texture[bin] = variationCount > 0 ? variationTotal / variationCount : 0;
    magnitudes[bin] = magnitude;
    largestPeak = Math.max(largestPeak, magnitude);
  }

  const amplitudeReference = Math.max(percentile(magnitudes, 0.995), largestPeak * 0.15);
  if (amplitudeReference > Number.EPSILON) {
    for (let index = 0; index < count; index += 1) {
      minimums[index] = clamp((minimums[index] ?? 0) / amplitudeReference, -1, 1);
      maximums[index] = clamp((maximums[index] ?? 0) / amplitudeReference, -1, 1);
      rootMeanSquares[index] = clamp((rootMeanSquares[index] ?? 0) / amplitudeReference, 0, 1);
    }
  } else {
    minimums.fill(0);
    maximums.fill(0);
    rootMeanSquares.fill(0);
  }

  const sampleRate =
    source.sampleRate && Number.isFinite(source.sampleRate) && source.sampleRate > 0
      ? source.sampleRate
      : 44_100;
  const secondsPerBin = source.length / count / sampleRate;
  const fastAlpha = 1 - Math.exp(-secondsPerBin / 0.012);
  const slowAlpha = 1 - Math.exp(-secondsPerBin / 0.18);
  let fastEnergy = rootMeanSquares[0] ?? 0;
  let slowEnergy = fastEnergy;
  let previousEnergy = fastEnergy;

  // A fast/slow energy difference highlights attacks while the rising edge keeps long bins useful.
  for (let index = 1; index < count; index += 1) {
    const energy = rootMeanSquares[index] ?? 0;
    fastEnergy += (energy - fastEnergy) * fastAlpha;
    slowEnergy += (energy - slowEnergy) * slowAlpha;
    const risingEdge = Math.max(0, energy - previousEnergy);
    onsets[index] = Math.max(0, fastEnergy - slowEnergy) * 0.72 + risingEdge * 0.28;
    previousEnergy = energy;
  }

  const onsetReference = Math.max(percentile(onsets, 0.985), maximumValue(onsets) * 0.15);
  const textureReference = Math.max(percentile(texture, 0.97), maximumValue(texture) * 0.15);
  normalize(onsets, onsetReference);
  normalize(texture, textureReference);

  return { minimums, maximums, rootMeanSquares, onsets, texture };
}

export function createWaveformPeaks(source: WaveformSource, sampleCount = 2_000): Float32Array {
  const analysis = createWaveformAnalysis(source, sampleCount);
  const peaks = new Float32Array(analysis.maximums.length);

  for (let index = 0; index < peaks.length; index += 1) {
    const envelope = Math.max(
      Math.abs(analysis.minimums[index] ?? 0),
      Math.abs(analysis.maximums[index] ?? 0),
    );
    peaks[index] = clamp(envelope * 0.72 + (analysis.rootMeanSquares[index] ?? 0) * 0.28, 0, 1);
  }
  normalize(peaks, maximumValue(peaks));

  return peaks;
}
