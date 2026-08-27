import { describe, expect, it } from 'vitest';
import { clamp, createWaveformPeaks, filenameToTitle, formatTime } from '../src/player/utils';

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

describe('clamp', () => {
  it('keeps values inside a range', () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(clamp(18, 0, 10)).toBe(10);
  });
});
