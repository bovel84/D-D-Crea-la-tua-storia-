const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    return route.abort();
  });
});

test('mobile shell loads one healthy consolidated runtime', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#home-screen')).toBeVisible();

  await page.waitForFunction(() => {
    const health = window.CronacheRuntimeV9?.snapshot?.();
    return health && health.ready === health.expected;
  }, null, { timeout: 10_000 });

  const health = await page.evaluate(() => window.CronacheRuntimeV9.snapshot());
  expect(health.version).toBe(9);
  expect(health.failed).toEqual([]);
  expect(health.duplicates).toEqual([]);
  expect(pageErrors).toEqual([]);

  await expect(page.locator('script[data-ui-consolidation-v9]')).toHaveCount(1);
  await expect(page.locator('script[data-interface-cleanup]')).toHaveCount(0);
  await expect(page.locator('script[data-management-layout]')).toHaveCount(0);
  await expect(page.locator('script[data-portrait-size-tuning]')).toHaveCount(0);
  await expect(page.locator('#cronache-ui-consolidation-v9-style')).toHaveCount(1);
});

test('timeline mutations do not starve the event loop or freeze clicks', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.CronacheRuntimeV9?.snapshot?.().ready === window.CronacheRuntimeV9?.snapshot?.().expected, null, { timeout: 10_000 });

  const result = await page.evaluate(async () => {
    const agenda = document.getElementById('timeline-agenda');
    if (!agenda) return { agenda: false, timer: false, clicks: 0, hidden: false };

    let clicks = 0;
    const probe = document.createElement('button');
    probe.type = 'button';
    probe.id = 'phase9-click-probe';
    probe.addEventListener('click', () => { clicks += 1; });
    document.body.appendChild(probe);

    for (let index = 0; index < 80; index += 1) {
      const node = document.createElement('span');
      node.textContent = `probe-${index}`;
      agenda.appendChild(node);
      node.remove();
    }
    probe.click();

    let timer = false;
    await Promise.race([
      new Promise(resolve => setTimeout(() => { timer = true; resolve(); }, 80)),
      new Promise(resolve => setTimeout(resolve, 800))
    ]);

    const hidden = getComputedStyle(agenda).display === 'none' && agenda.getAttribute('aria-hidden') === 'true';
    probe.remove();
    return { agenda: true, timer, clicks, hidden };
  });

  expect(result.agenda).toBe(true);
  expect(result.timer).toBe(true);
  expect(result.clicks).toBe(1);
  expect(result.hidden).toBe(true);
});

test('protagonist portrait keeps the full medallion on a phone viewport', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.CronacheUiConsolidationV9), null, { timeout: 10_000 });

  const geometry = await page.evaluate(() => {
    let button = document.getElementById('btn-top-character');
    if (!button) {
      button = document.createElement('button');
      button.id = 'btn-top-character';
      button.className = 'topbar-protagonist';
      button.style.width = '72px';
      button.style.height = '72px';
      const portrait = document.createElement('span');
      portrait.id = 'topbar-protagonist-portrait';
      const image = document.createElement('img');
      image.className = 'portrait-image portrait-photo';
      image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
      portrait.appendChild(image);
      button.appendChild(portrait);
      document.body.appendChild(button);
    }
    const portrait = document.getElementById('topbar-protagonist-portrait');
    const image = portrait?.querySelector('img');
    const p = portrait?.getBoundingClientRect();
    const i = image?.getBoundingClientRect();
    return { portraitWidth: p?.width || 0, imageWidth: i?.width || 0, radius: image ? getComputedStyle(image).borderRadius : '' };
  });

  expect(geometry.portraitWidth).toBeGreaterThan(55);
  expect(geometry.imageWidth).toBeGreaterThanOrEqual(geometry.portraitWidth - 1);
  expect(geometry.radius).toMatch(/50%|999/);
});
