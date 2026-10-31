import { test, expect } from '@playwright/test';
import { emptySong } from '../shared/song';

test('mobile library finds successful setups without changing storage', async ({ page }) => {
  const headers = { Origin: 'http://127.0.0.1:4173', 'X-Sunomat-Request': '1' };
  expect((await page.request.post('/api/register', { headers, data: { email: `discovery-${Date.now()}@example.test`, password: 'discovery-passphrase' } })).ok()).toBeTruthy();
  for (const song of [
    { ...emptySong(), title: 'Piano success', rating: 5, stage: 'finished', referenceNotes: 'Dry reference' },
    { ...emptySong(), title: 'Ambient idea', rating: 0 },
    { ...emptySong(), title: 'Guitar success', rating: 4 },
  ]) expect((await page.request.post('/api/saves', { headers, data: { song } })).ok()).toBeTruthy();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^My library/ }).click();
  await expect(page.locator('.project-card')).toHaveCount(3);
  await page.getByLabel('Sort saved projects').selectOption('rating');
  await expect(page.locator('.project-card h2')).toHaveText(['Piano success', 'Guitar success', 'Ambient idea']);
  await page.getByLabel('Minimum result rating').selectOption('4');
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.getByLabel('Search saved projects').fill('dry reference');
  await expect(page.locator('.project-card h2')).toHaveText(['Piano success']);
  await page.getByLabel('Filter saved projects').selectOption('idea');
  await expect(page.getByText('No projects match. Try another search or filter.')).toBeVisible();
  await expect(page.getByText('3 / 100 versions', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const library = await (await page.request.get('/api/projects')).json();
  expect(library.usage).toBe(3);
});
