import { describe, expect, it } from 'vitest';
import {
  clamp,
  createWaveformAnalysis,
  createWaveformPeaks,
  filenameToTitle,
  formatTime,
} from '../src/player/utils';

describe('formatTime', () => {
  it('formats short and hour-long timestamps', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3_665)).toBe('1:01:05');
  });

  it('guards invalid values', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
  });
});

describe('filenameToTitle', () => {
  it('turns common filenames into display titles', () => {
    expect(filenameToTitle('late-night_sketch.ogg')).toBe('Late Night Sketch');
    expect(filenameToTitle('  field   recording.wav')).toBe('Field Recording');
    expect(filenameToTitle('.mp3')).toBe('Untitled audio');
  });
});

describe('createWaveformPeaks', () => {
  it('combines channels and normalizes peak data', () => {
    const channels = [
      new Float32Array([0, 0.25, -0.5, 1, 0, 0.1, -0.2, 0.4]),
      new Float32Array([0, -0.1, 0.3, -0.8, 0, -0.1, 0.15, -0.3]),
    ];
    const peaks = createWaveformPeaks(
      {
        length: channels[0]?.length ?? 0,
        numberOfChannels: channels.length,
        getChannelData: (channel) => channels[channel] ?? new Float32Array(),
      },
      4,
    );

    expect(peaks).toHaveLength(4);
    expect(Math.max(...peaks)).toBeCloseTo(1);
    expect(peaks.every((peak) => peak >= 0 && peak <= 1)).toBe(true);
  });

  it('returns an empty result for empty audio', () => {
    expect(
      createWaveformPeaks({
        length: 0,
        numberOfChannels: 0,
        getChannelData: () => new Float32Array(),
      }),
    ).toHaveLength(0);
  });
});

describe('createWaveformAnalysis', () => {
  it('retains signed peaks and a separate energy envelope', () => {
    const samples = new Float32Array([-1, -0.4, 0.2, 0.8, -0.7, -0.1, 0.3, 0.6]);
    const analysis = createWaveformAnalysis(
      {
        length: samples.length,
        numberOfChannels: 1,
        sampleRate: 8,
        getChannelData: () => samples,
      },
      4,
    );

    expect(analysis.minimums).toHaveLength(4);
    expect(analysis.minimums[0]).toBeCloseTo(-1);
    expect(analysis.maximums[1]).toBeCloseTo(0.8);
    expect(analysis.rootMeanSquares.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('marks a sudden burst as an onset', () => {
    const samples = new Float32Array(4_000);
    for (let index = 1_000; index < samples.length; index += 1) {
      samples[index] = index % 2 === 0 ? 0.8 : -0.8;
    }

    const analysis = createWaveformAnalysis(
      {
        length: samples.length,
        numberOfChannels: 1,
        sampleRate: 1_000,
        getChannelData: () => samples,
      },
      200,
    );
    const strongestOnset = analysis.onsets.indexOf(Math.max(...analysis.onsets));

    expect(strongestOnset).toBeGreaterThanOrEqual(49);
    expect(strongestOnset).toBeLessThanOrEqual(51);
    expect(analysis.onsets[strongestOnset]).toBeCloseTo(1);
  });

  it('distinguishes a dense alternating signal from a steady one', () => {
    const samples = new Float32Array(2_000);
    samples.fill(0.4, 0, 1_000);
    for (let index = 1_000; index < samples.length; index += 1) {
      samples[index] = index % 2 === 0 ? 0.4 : -0.4;
    }

    const analysis = createWaveformAnalysis(
      {
        length: samples.length,
        numberOfChannels: 1,
        sampleRate: 1_000,
        getChannelData: () => samples,
      },
      20,
    );

    expect(Math.max(...analysis.texture.slice(0, 10))).toBe(0);
    expect(Math.max(...analysis.texture.slice(10))).toBeCloseTo(1);
  });

  it('bounds the default analysis resolution for long inputs', () => {
    const samples = new Float32Array(20_000);
    let channelReads = 0;
    const analysis = createWaveformAnalysis({
      length: samples.length,
      numberOfChannels: 2,
      getChannelData: () => {
        channelReads += 1;
        return samples;
      },
    });

    expect(analysis.maximums).toHaveLength(4_096);
    expect(channelReads).toBe(2);
  });
});

describe('clamp', () => {
  it('keeps values inside a range', () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(clamp(18, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 0, 10)).toBe(0);
  });
});
