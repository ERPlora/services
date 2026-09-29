// A list that could not load must not read «No …» + «0 records» (pm#533, hub#2328).
//
// The shell's `<ok-data-table>` (OutfitKit ≥ 0.1.113) paints a failed load itself: «could not
// load», the reason and a Retry button. Each services list (services, categories, packages) hands
// it its controller's `error` and reloads on its `retry` event — and drops its own red banner,
// which would say the same thing twice. But a module paints with the SHELL's OutfitKit (ADR-0451):
// on a hub whose table has no `error` property the banner is the only place the reason is shown,
// so it stays.
//
// The shell's table is stood in for by a bare element registered BEFORE the screens load (as the
// shell does at boot; the screens' own `define()` then loses, like in the hub). Its `error`
// property is added or removed per test, which is exactly what `dataTableShowsLoadError()` reads.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

class ShellTable extends HTMLElement {}
const errors = new WeakMap<HTMLElement, unknown>();

function shellTableKnowsErrors(yes: boolean) {
  if (yes) {
    Object.defineProperty(ShellTable.prototype, 'error', {
      configurable: true,
      get(this: HTMLElement) { return errors.get(this) ?? ''; },
      set(this: HTMLElement, v: unknown) { errors.set(this, v); },
    });
  } else {
    delete (ShellTable.prototype as { error?: unknown }).error;
  }
}

/** `alongside`: what the screen reads with the list when it opens (the form's pickers). */
const SCREENS = [
  { tag: 'erp-services-list', table: 'services-list-table', banner: 'services-list-load-error', alongside: ['services.categories.list', 'taxes.categories.list'] },
  { tag: 'erp-services-categories', table: 'services-categories-table', banner: 'services-categories-load-error', alongside: ['services.categories.list'] },
  { tag: 'erp-services-packages', table: 'services-packages-table', banner: 'services-packages-load-error', alongside: ['services.services.list'] },
] as const;

const ROW = { id: 'r1', name: 'Corte' };

let hubAnswers = false;
let pageCalls = 0;
let allCalls: string[] = [];

beforeAll(async () => {
  customElements.define('ok-data-table', ShellTable);
  await import('../components/erp-services-list/erp-services-list');
  await import('../components/erp-services-categories/erp-services-categories');
  await import('../components/erp-services-packages/erp-services-packages');
});

beforeEach(() => {
  document.body.innerHTML = '';
  hubAnswers = false;
  pageCalls = 0;
  allCalls = [];
  const fail = () => {
    if (!hubAnswers) throw new Error('The hub is not responding.');
  };
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => { fail(); return []; },
    queryOptional: async () => { fail(); return []; },
    queryAll: async (name: string) => { allCalls.push(name); fail(); return []; },
    queryPage: async () => {
      pageCalls++;
      fail();
      return { rows: [ROW], total: 1 };
    },
    command: async () => ({}),
    hasPermission: () => true,
    on: () => () => {},
    locale: 'es',
    t: (_catalog: unknown, key: string) => key,
    currency: 'EUR',
    currencyDecimals: 2,
    formatMoney: (cents: number) => `${(cents / 100).toFixed(2)} €`,
  };
});

type Screen = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };
type Table = HTMLElement & { error: string; rows: unknown[] };

async function mountFailed(tag: string, testid: string): Promise<{ el: Screen; table: Table }> {
  const el = document.createElement(tag) as Screen;
  document.body.appendChild(el);
  await vi.waitFor(() => {
    if (pageCalls === 0) throw new Error('the list has not asked for its page yet');
  });
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  const table = el.shadowRoot.querySelector<Table>(`ok-data-table[testid="${testid}"]`);
  expect(table, `${tag} paints its table`).toBeTruthy();
  return { el, table: table! };
}

describe.each(SCREENS)('$tag — a list that could not load (pm#533)', ({ tag, table: testid, banner, alongside }) => {
  it('hands the reason to the shell table and paints no second banner', async () => {
    shellTableKnowsErrors(true);
    const { el, table } = await mountFailed(tag, testid);
    expect(table.error).toBe('The hub is not responding.');
    expect(el.shadowRoot.querySelector(`[data-testid="${banner}"]`), 'the reason would be said twice').toBeNull();
  });

  it('Retry on the table asks the hub again for the list and what loads with it, and paints the rows', async () => {
    shellTableKnowsErrors(true);
    const { el, table } = await mountFailed(tag, testid);
    const before = pageCalls;
    const count = (name: string) => allCalls.filter((n) => n === name).length;
    const asked = alongside.map(count);
    hubAnswers = true;
    table.dispatchEvent(new CustomEvent('retry', { detail: {} }));
    await vi.waitFor(() => {
      if (pageCalls === before) throw new Error('Retry did not ask the hub again');
      alongside.forEach((name, i) => {
        // The form's pickers failed with the list: without asking again they stay empty.
        if (count(name) === asked[i]) throw new Error(`Retry did not ask again for ${name}`);
      });
    });
    await vi.waitFor(async () => {
      await el.updateComplete;
      if (table.error !== '') throw new Error('the error is still on the table');
    });
    expect(table.rows).toEqual([ROW]);
  });

  it('on a shell whose table cannot paint the error, keeps its own banner with the reason', async () => {
    shellTableKnowsErrors(false);
    const { el } = await mountFailed(tag, testid);
    const node = el.shadowRoot.querySelector(`[data-testid="${banner}"]`);
    expect(node, 'an older hub would show the failure nowhere').toBeTruthy();
    expect(node!.textContent).toContain('The hub is not responding.');
  });
});
