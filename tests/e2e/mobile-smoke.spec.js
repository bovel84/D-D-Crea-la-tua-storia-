const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    return route.abort();
  });
});

test('mobile shell loads one healthy consolidated runtime', async ({ page }) => {
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
    // The real topbar lives inside #game-screen, which is intentionally hidden on the
    // home screen. Build a visible fixture with the exact production selectors so this
    // smoke test measures the portrait CSS instead of the hidden screen geometry (0x0).
    const existingButton = document.getElementById('btn-top-character');
    const existingPortrait = document.getElementById('topbar-protagonist-portrait');
    if (existingButton) existingButton.id = 'btn-top-character-app-fixture-source';
    if (existingPortrait) existingPortrait.id = 'topbar-protagonist-portrait-app-fixture-source';

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'btn-top-character';
    button.className = 'topbar-protagonist';
    button.style.width = '72px';
    button.style.height = '72px';
    document.body.appendChild(button);

    const portrait = document.createElement('span');
    portrait.id = 'topbar-protagonist-portrait';
    button.appendChild(portrait);

    const image = document.createElement('img');
    image.className = 'portrait-image portrait-photo';
    image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    portrait.appendChild(image);

    const p = portrait.getBoundingClientRect();
    const i = image.getBoundingClientRect();
    const result = { portraitWidth: p.width, imageWidth: i.width, radius: getComputedStyle(image).borderRadius };

    button.remove();
    if (existingButton) existingButton.id = 'btn-top-character';
    if (existingPortrait) existingPortrait.id = 'topbar-protagonist-portrait';
    return result;
  });

  expect(geometry.portraitWidth).toBeGreaterThan(55);
  expect(geometry.imageWidth).toBeGreaterThanOrEqual(geometry.portraitWidth - 5); // 2px border each side
  expect(geometry.radius).toMatch(/50%|999/);
});

test('world chat composer stays visible and writable with a long conversation', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.CronacheRuntimeV9?.snapshot?.().ready === window.CronacheRuntimeV9?.snapshot?.().expected, null, { timeout: 10_000 });

  await page.evaluate(() => {
    const modal = document.getElementById('modal-world-chat');
    const threadList = document.getElementById('chat-thread-list');
    const head = document.getElementById('chat-conversation-head');
    const messages = document.getElementById('chat-messages');
    if (!modal || !threadList || !head || !messages) throw new Error('chat markup missing');

    modal.classList.add('active');
    threadList.innerHTML = '<button class="chat-thread active"><strong>Riunione di prova</strong><small>Conversazione molto lunga</small></button>';
    head.innerHTML = '<strong>Riunione di prova</strong><small>Tre partecipanti</small><div class="chat-participant-chips"><span>NPC A</span><span>NPC B</span><span>NPC C</span></div>';
    messages.innerHTML = Array.from({ length: 28 }, (_, index) => (
      `<div class="chat-message"><div class="chat-avatar"></div><div class="chat-bubble"><span class="chat-speaker">NPC ${index}</span>Messaggio di prova abbastanza lungo per riempire la conversazione e forzare lo scorrimento interno.</div></div>`
    )).join('');
  });

  const input = page.locator('#chat-input');
  const composer = page.locator('#modal-world-chat .chat-compose');
  await expect(input).toBeVisible();
  await expect(composer).toBeVisible();
  await input.fill('Posso ancora scrivere');
  await expect(input).toHaveValue('Posso ancora scrivere');

  const geometry = await page.evaluate(() => {
    const modal = document.querySelector('#modal-world-chat .chat-modal').getBoundingClientRect();
    const composer = document.querySelector('#modal-world-chat .chat-compose').getBoundingClientRect();
    const input = document.getElementById('chat-input').getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      modalTop: modal.top,
      modalBottom: modal.bottom,
      composerTop: composer.top,
      composerBottom: composer.bottom,
      inputTop: input.top,
      inputBottom: input.bottom
    };
  });

  expect(geometry.composerTop).toBeGreaterThanOrEqual(geometry.modalTop - 1);
  expect(geometry.composerBottom).toBeLessThanOrEqual(geometry.modalBottom + 1);
  expect(geometry.inputTop).toBeGreaterThanOrEqual(geometry.modalTop - 1);
  expect(geometry.inputBottom).toBeLessThanOrEqual(geometry.modalBottom + 1);
  expect(geometry.inputBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
});
