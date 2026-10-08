import { expect, test } from '@playwright/test';
import { clearSnapshot } from './helpers/storage';

test('shows canonical branding, build metadata, and safe project links', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Redline Tactics' })).toBeVisible();
  await expect(page.getByTestId('title-build-metadata')).toHaveText(/^v0\.1\.0 · build (?:[0-9a-f]{7}|dev)$/);
  const externalLinks = [
    ['Developed by @illyarules', 'https://github.com/illyarules'],
    ['GitHub', 'https://github.com/illyarules/redline-tactics-rts'],
    ['Report a bug', 'https://github.com/illyarules/redline-tactics-rts/issues/new'],
    ['Feedback', 'https://github.com/illyarules/redline-tactics-rts/issues/new?title=Feedback%3A%20'],
  ] as const;
  for (const [name, href] of externalLinks) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
});
