import type { Page } from '@playwright/test';

/**
 * Introduction calls (a turn named someone new): the turn they followed, how long they took, and whether the reply hit
 * maxTokens. Routed, not watched: the SSE reader cancels the body after the last event, so the browser reports every
 * call as aborted and its body is gone. Other requests pass straight through, so story turns still stream.
 */
export async function watchIntroductions(page: Page, url: string) {
  const log = { turn: -1, calls: [] as { turn: number; ms: number; cut?: boolean; failed?: string }[] };
  await page.route(`${url.replace(/\/$/, '')}/completion`, async (route) => {
    if (!route.request().postData()?.includes('New here:')) return route.continue();
    const turn = log.turn;
    const start = Date.now();
    try {
      const res = await route.fetch();
      const body = await res.text();
      log.calls.push({ turn, ms: Date.now() - start, cut: body.includes('"stop_type":"limit"') });
      await route.fulfill({ response: res, body });
    } catch (e) {
      // The next turn aborted it: the page closed the request.
      log.calls.push({ turn, ms: Date.now() - start, failed: String(e).slice(0, 80) });
    }
  });
  return log;
}
