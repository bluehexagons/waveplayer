import { expect, test } from '@playwright/test';

function createSilentWave(): Buffer {
  const sampleRate = 8_000;
  const samples = sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);

  return buffer;
}

test('loads a real waveform and exposes complete transport controls', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'See what you hear.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scales in Motion' })).toBeVisible();
  await expect(page.locator('[data-queue] .queue-item')).toHaveCount(3);
  await expect(page.locator('[data-waveform-state]')).toHaveClass(/is-hidden/, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Play Creepy Piano No. 2' }).click();
  await expect(page.getByRole('heading', { name: 'Creepy Piano No. 2' })).toBeVisible();
  await expect(page).toHaveURL(/#creepy-piano-no-2$/);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  await page.getByRole('button', { name: 'Playback speed, 1 times' }).click();
  await expect(page.getByRole('button', { name: 'Playback speed, 1.25 times' })).toHaveText(
    '1.25×',
  );

  await page.getByRole('button', { name: 'Mute' }).click();
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
});

test('loads a local file without leaving the browser', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-file-input]').setInputFiles({
    name: 'late-night_sketch.wav',
    mimeType: 'audio/wav',
    buffer: createSilentWave(),
  });

  await expect(page.getByRole('heading', { name: 'Late Night Sketch' })).toBeVisible();
  await expect(page.locator('[data-queue] .queue-item')).toHaveCount(4);
  await expect(page.getByText('Local audio · This device')).toBeVisible();
  await expect(page.getByText('Loaded “Late Night Sketch” locally.')).toBeVisible();
});

test('remains usable at a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'See what you hear.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
