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
  getChannelData(channel: number): Float32Array;
}

export function createWaveformPeaks(source: WaveformSource, sampleCount = 2_000): Float32Array {
  if (source.length === 0 || source.numberOfChannels === 0 || sampleCount < 1) {
    return new Float32Array();
  }

  const count = Math.min(Math.floor(sampleCount), source.length);
  const peaks = new Float32Array(count);
  let largestPeak = 0;

  for (let bin = 0; bin < count; bin += 1) {
    const start = Math.floor((bin * source.length) / count);
    const end = Math.max(start + 1, Math.floor(((bin + 1) * source.length) / count));
    let absolutePeak = 0;
    let squareTotal = 0;
    let visited = 0;

    for (let channelIndex = 0; channelIndex < source.numberOfChannels; channelIndex += 1) {
      const channel = source.getChannelData(channelIndex);
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const sample = Math.abs(channel[sampleIndex] ?? 0);
        absolutePeak = Math.max(absolutePeak, sample);
        squareTotal += sample * sample;
        visited += 1;
      }
    }

    const rootMeanSquare = visited > 0 ? Math.sqrt(squareTotal / visited) : 0;
    const weightedPeak = absolutePeak * 0.72 + rootMeanSquare * 0.28;
    peaks[bin] = weightedPeak;
    largestPeak = Math.max(largestPeak, weightedPeak);
  }

  if (largestPeak > 0) {
    for (let index = 0; index < peaks.length; index += 1) {
      peaks[index] = (peaks[index] ?? 0) / largestPeak;
    }
  }

  return peaks;
}
