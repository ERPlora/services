// services#157 — what the till says about a voucher BEFORE its sale is voided or refunded.
//
// Voiding the sale, or refunding it in full, voids every voucher sold on it, used or not
// (`sale_void_grants.sql`, `sale_refund_grants.sql`); refunding the voucher's line voids that one
// (`sale_refund_line_grants.sql`, services#158). `sales` cedes the hole
// `sales.reversal.notice` in its void and refund windows and hands the filler two properties:
// `saleId` and `action` ('void' | 'refund'). This element reads `services.packages.sold_on_sale`
// and paints one warning per voucher.
//
// 🔴 WHAT IS ASSERTED IS THE CONTRACT, not the prose: which query it asked, which catalogue key it
// painted with which parameters, and its loading / error / empty states. The wording is the
// catalogue's (ADR-0055).
import { beforeEach, describe, expect, it } from 'vitest';
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';

/** Rows of `services.packages.sold_on_sale`. */
const INTACT = { grant_id: 'g-1', package_id: 'p-1', package_name: 'Bono 5 cortes', customer_id: 'c-1', used: 0, remaining: 5 };
const USED = { grant_id: 'g-2', package_id: 'p-1', package_name: 'Bono 5 cortes', customer_id: 'c-2', used: 2, remaining: 3 };
const SPENT = { grant_id: 'g-3', package_id: 'p-1', package_name: 'Bono 5 cortes', customer_id: 'c-3', used: 5, remaining: 0 };
const UNLIMITED = { grant_id: 'g-4', package_id: 'p-2', package_name: 'Tarifa plana', customer_id: 'c-4', used: 1, remaining: null };
const UNLIMITED_INTACT = { ...UNLIMITED, grant_id: 'g-5', used: 0 };

let rows: unknown[] = [];
let queries: { name: string; params: Record<string, unknown> }[] = [];
let queryFails = false;

beforeEach(() => {
  rows = [INTACT, USED];
  queries = [];
  queryFails = false;
  document.body.innerHTML = '';
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string, params: Record<string, unknown>) => {
      queries.push({ name, params });
      if (queryFails) throw new Error('boom');
      return name === 'services.packages.sold_on_sale' ? rows : [];
    },
    command: async () => ({}),
    hasPermission: () => true,
    locale: 'es',
    t: (_c: unknown, key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  };
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  saleId: string;
  action: string;
};

/** Mounts the way the host does: both properties BEFORE the insert. */
async function mount(props: Partial<Mounted> = {}): Promise<Mounted> {
  await import('./erp-services-sale-reversal');
  const el = document.createElement('erp-services-sale-reversal') as unknown as Mounted;
  el.saleId = 'sale-1';
  el.action = 'void';
  Object.assign(el, props);
  document.body.appendChild(el);
  for (let i = 0; i < 3; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  return el;
}

const notice = (el: Mounted, grantId: string) =>
  el.shadowRoot.querySelector<HTMLElement>(`[data-testid="services-sale-reversal-voucher-${grantId}"]`);

describe('erp-services-sale-reversal — the voucher warning before a void or a full refund (services#157)', () => {
  it('reads the vouchers sold on THAT sale, once', async () => {
    await mount();
    expect(queries).toEqual([{ name: 'services.packages.sold_on_sale', params: { sale_id: 'sale-1' } }]);
  });

  it('void: one warning per voucher, with what is used and what is lost', async () => {
    rows = [INTACT, USED, SPENT, UNLIMITED, UNLIMITED_INTACT];
    const el = await mount({ action: 'void' });
    expect(notice(el, 'g-1')?.textContent?.trim()).toBe('ui.saleReversal.void.intact:{"name":"Bono 5 cortes"}');
    expect(notice(el, 'g-2')?.textContent?.trim()).toBe(
      'ui.saleReversal.void.used:{"name":"Bono 5 cortes","used":2,"remaining":3}',
    );
    // Nothing left to lose (all used, or no count at all): it simply cannot be used any more.
    expect(notice(el, 'g-3')?.textContent?.trim()).toBe('ui.saleReversal.void.usedNoMore:{"name":"Bono 5 cortes","used":5}');
    expect(notice(el, 'g-4')?.textContent?.trim()).toBe('ui.saleReversal.void.usedNoMore:{"name":"Tarifa plana","used":1}');
    expect(notice(el, 'g-5')?.textContent?.trim()).toBe('ui.saleReversal.void.intact:{"name":"Tarifa plana"}');
    expect(notice(el, 'g-1')?.getAttribute('tone')).toBe('warning');
  });

  it('refund: the same, worded for a refund (a full one, or one returning its line)', async () => {
    rows = [INTACT, USED, UNLIMITED];
    const el = await mount({ action: 'refund' });
    expect(notice(el, 'g-1')?.textContent?.trim()).toBe('ui.saleReversal.refund.intact:{"name":"Bono 5 cortes"}');
    expect(notice(el, 'g-2')?.textContent?.trim()).toBe(
      'ui.saleReversal.refund.used:{"name":"Bono 5 cortes","used":2,"remaining":3}',
    );
    expect(notice(el, 'g-4')?.textContent?.trim()).toBe('ui.saleReversal.refund.usedNoMore:{"name":"Tarifa plana","used":1}');
  });

  it('a sale that sold no voucher paints nothing', async () => {
    rows = [];
    const el = await mount();
    expect(el.shadowRoot.querySelector('ok-inline-feedback')).toBeNull();
    expect(el.shadowRoot.querySelector('ion-skeleton-text')).toBeNull();
    // Not even an empty box: the hole must take no room in the window.
    expect(el.shadowRoot.querySelector('.box')).toBeNull();
  });

  it('without a sale it asks nothing and paints nothing', async () => {
    const el = await mount({ saleId: '' });
    expect(queries).toEqual([]);
    expect(el.shadowRoot.querySelector('ok-inline-feedback')).toBeNull();
  });

  it('loading: a grey block, never «nothing sold here»', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    (globalThis as unknown as { erplora: { query: unknown } }).erplora.query = async () => { await gate; return rows; };
    await import('./erp-services-sale-reversal');
    const el = document.createElement('erp-services-sale-reversal') as unknown as Mounted;
    el.saleId = 'sale-1';
    el.action = 'void';
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('ion-skeleton-text')).not.toBeNull();
    release();
  });

  it('a failed read says so, with a retry that reads again', async () => {
    queryFails = true;
    const el = await mount();
    expect(el.shadowRoot.querySelector('[data-testid="services-sale-reversal-load-error"]')?.textContent?.trim())
      .toBe('ui.saleReversal.loadFailed');
    queryFails = false;
    el.shadowRoot.querySelector<HTMLElement>('[data-testid="services-sale-reversal-retry"]')!.click();
    for (let i = 0; i < 3; i++) {
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(queries.length).toBe(2);
    expect(notice(el, 'g-2')).not.toBeNull();
    expect(el.shadowRoot.querySelector('[data-testid="services-sale-reversal-load-error"]')).toBeNull();
  });

  it('a new sale on the same element reads again', async () => {
    const el = await mount();
    el.saleId = 'sale-2';
    for (let i = 0; i < 3; i++) {
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(queries.map((q) => q.params.sale_id)).toEqual(['sale-1', 'sale-2']);
  });

  it('a late answer for the previous sale never paints over the current one', async () => {
    const pending: Record<string, (r: unknown[]) => void> = {};
    (globalThis as unknown as { erplora: { query: unknown } }).erplora.query = (
      _name: string,
      params: Record<string, unknown>,
    ) => new Promise((resolve) => { pending[String(params.sale_id)] = resolve; });
    const el = await mount();
    el.saleId = 'sale-2';
    for (let i = 0; i < 3; i++) {
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
    }
    pending['sale-2']([USED]);
    pending['sale-1']([INTACT]);
    for (let i = 0; i < 3; i++) {
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(notice(el, 'g-2')).not.toBeNull();
    expect(notice(el, 'g-1')).toBeNull();
  });

  it('every key it paints exists in en AND es', () => {
    for (const cat of [enLocale, esLocale] as Array<{ ui: Record<string, unknown> }>) {
      const r = cat.ui.saleReversal as Record<string, Record<string, string> | string>;
      for (const action of ['void', 'refund']) {
        for (const k of ['intact', 'used', 'usedNoMore']) {
          expect(typeof (r[action] as Record<string, string>)?.[k], `${action}.${k}`).toBe('string');
        }
      }
      expect(typeof r.loadFailed).toBe('string');
      expect(typeof r.btnRetry).toBe('string');
    }
  });

  // services#158: returning the voucher's line voids it too, so the refund copy must not promise
  // that a partial refund leaves it, and must point at the list where that line is marked.
  it('refund copy: returning the voucher\'s line voids it too, in en AND es', () => {
    const where = { en: 'What goes back', es: 'Qué se devuelve' };
    for (const [lang, cat] of [['en', enLocale], ['es', esLocale]] as Array<[keyof typeof where, { ui: Record<string, unknown> }]>) {
      const refund = (cat.ui.saleReversal as Record<string, Record<string, string>>).refund;
      for (const k of ['intact', 'used', 'usedNoMore']) {
        expect(refund[k], `${lang} refund.${k}`).not.toMatch(/partial refund leaves|devolución parcial no lo toca/i);
        expect(refund[k], `${lang} refund.${k}`).toContain(where[lang]);
      }
    }
  });
});
