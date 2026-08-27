import AxeBuilder from '@axe-core/playwright';
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

  await expect(page.getByRole('heading', { name: 'Waveform audio player' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scales in Motion' })).toBeVisible();
  await expect(page.locator('[data-queue] .queue-item')).toHaveCount(3);
  await expect(page.locator('[data-waveform-state]')).toHaveClass(/is-hidden/, { timeout: 15_000 });

  const queueTrack = page.locator('.queue-item[data-track-id="creepy-piano-no-2"]');
  await expect(queueTrack).toHaveAttribute('aria-label', 'Play Creepy Piano No. 2');
  await queueTrack.click();
  await expect(page.getByRole('heading', { name: 'Creepy Piano No. 2' })).toBeVisible();
  await expect(page).toHaveURL(/#creepy-piano-no-2$/);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(queueTrack).toBeFocused();
  await expect(queueTrack).toHaveAttribute('aria-label', 'Pause current track, Creepy Piano No. 2');

  await queueTrack.click();
  await expect(queueTrack).toBeFocused();
  await expect(queueTrack).toHaveAttribute('aria-label', 'Play current track, Creepy Piano No. 2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await page.getByRole('button', { name: 'Playback speed, 1 times' }).click();
  await expect(page.getByRole('button', { name: 'Playback speed, 1.25 times' })).toHaveText(
    '1.25×',
  );

  await page.getByRole('button', { name: 'Mute' }).click();
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();

  const volume = page.getByRole('slider', { name: 'Volume' });
  await volume.fill('0');
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
  await page.getByRole('button', { name: 'Unmute' }).click();
  await expect(volume).toHaveValue('0.82');
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible();

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const waveform = page.getByRole('slider', { name: 'Seek through track' });
  const maximum = await waveform.getAttribute('aria-valuemax');
  await waveform.focus();
  await waveform.press('End');
  await expect(waveform).toHaveAttribute('aria-valuenow', maximum ?? '0');
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
  await expect(page.locator('[data-download]')).toHaveAttribute(
    'download',
    'late-night_sketch.wav',
  );
});

test('remains usable at a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Waveform audio player' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  const dropZone = page.locator('[data-drop-zone]');
  const dropZoneChild = dropZone.getByRole('heading', { name: 'Try your own audio' });
  await dropZone.dispatchEvent('dragenter');
  await dropZoneChild.dispatchEvent('dragenter');
  await dropZoneChild.dispatchEvent('dragleave');
  await expect(dropZone).toHaveClass(/is-dragging/);
  await dropZone.dispatchEvent('dragleave');
  await expect(dropZone).not.toHaveClass(/is-dragging/);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-waveform-state]')).toHaveClass(/is-hidden/, { timeout: 15_000 });

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('loads without runtime errors or failed asset requests', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/');
  await expect(page.locator('[data-waveform-state]')).toHaveClass(/is-hidden/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
