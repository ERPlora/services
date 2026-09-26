// services#110 — closing the voucher (package) panel while an edit loads cancels the load.
//
// «Edit» awaits the FULL package (services.packages.get) and only then fills the form and opens the
// panel. With the panel already open (another package, or «Add»), the person taps a row and closes
// the panel — the X, the backdrop or Escape — before the read lands: the late reply must neither
// reopen the panel nor fill the form. ok-data-table ≥0.1.97 emits `panelClose` (outfitkit#195) on
// every open→closed transition; the screen retires the pending load on it. Every close below goes
// through the REAL table (its shadow DOM), never a handler called by hand.
import { beforeEach, describe, expect, it } from 'vitest';

const ROW_A = { id: 'p1', name: 'Bono 5 cortes', slug: 'bono-5-cortes', discount_type: 'percentage', discount_percent_bp: 1000, discount_amount_cents: 0, fixed_price: null, is_active: 1, items: 1, validity_days: 90, max_uses: 5 };
const ROW_B = { ...ROW_A, id: 'p2', name: 'Bono 10 tintes', slug: 'bono-10-tintes', validity_days: 180, max_uses: 10 };

type Query = (name: string, params?: Record<string, unknown>) => Promise<unknown>;
let query: Query;

beforeEach(() => {
  query = async (name, params) => (name === 'services.packages.get' ? [params?.package_id === 'p2' ? ROW_B : ROW_A] : []);
  (globalThis as Record<string, unknown>).erplora = {
    query: (name: string, params?: Record<string, unknown>) => query(name, params),
    queryPage: async () => ({ rows: [ROW_A, ROW_B], total: 2 }),
    queryAll: async () => [],
    command: async () => ({}),
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string) => key,
  };
});

type Table = HTMLElement & { panel: string; shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };
type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  editingId: string | null;
  form: { name: string; validityDays: string; maxUses: string };
};

async function mount(): Promise<Mounted> {
  await import('./erp-services-packages');
  const el = document.createElement('erp-services-packages') as unknown as Mounted;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const table = (el: Mounted) => el.shadowRoot.querySelector('ok-data-table') as unknown as Table;
const settle = async (el: Mounted) => {
  await tick();
  await el.updateComplete;
  await table(el).updateComplete;
  await tick();
  await el.updateComplete;
  await table(el).updateComplete;
};
const rows = (el: Mounted) => [...table(el).shadowRoot.querySelectorAll('.grow-data.clickable')] as HTMLElement[];

function hold(): { wait: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const wait = new Promise<void>((r) => (release = r));
  return { wait, release };
}

const CLOSES: Array<[string, (t: Table) => void]> = [
  ['the X button', (t) => (t.shadowRoot.querySelector('.drawer .dh ion-button') as HTMLElement).click()],
  ['the backdrop', (t) => (t.shadowRoot.querySelector('.tk-scrim') as HTMLElement).click()],
  ['Escape', (t) => t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }))],
];

/** Opens package A for editing through the REAL row, then holds the read of package B. */
async function editAThenTapB(el: Mounted): Promise<() => void> {
  expect(rows(el).length, 'the table paints both rows as clickable').toBe(2);
  rows(el)[0].click();
  await settle(el);
  expect(table(el).panel, 'positive control: tapping a row opens the edit panel').toBe('edit');
  expect(el.editingId).toBe('p1');
  const gate = hold();
  let reads = 0;
  query = async (name, params) => {
    if (name !== 'services.packages.get') return [];
    reads++;
    await gate.wait;
    return [params?.package_id === 'p2' ? ROW_B : ROW_A];
  };
  rows(el)[1].click();
  await tick();
  expect(reads, 'the read of B is in flight').toBe(1);
  return gate.release;
}

async function close(el: Mounted, how: (t: Table) => void): Promise<void> {
  how(table(el));
  await table(el).updateComplete;
  expect(table(el).panel, 'the close really closed the panel').toBe('none');
}

describe('closing the voucher panel while an edit loads cancels the load (services#110)', () => {
  it.each(CLOSES)('closed with %s: the late package neither reopens the panel nor fills the form', async (_how, how) => {
    const el = await mount();
    const release = await editAThenTapB(el);
    await close(el, how);
    release();
    await settle(el);
    expect(table(el).panel, 'the panel the person closed stays closed').toBe('none');
    expect(el.editingId, 'a read nobody waits for must not turn the form into B').not.toBe('p2');
    expect(el.form.name).not.toBe('Bono 10 tintes');
    expect(el.form.maxUses).not.toBe('10');
  });

  it('closed with the X after «Add»: the late package does not reopen the panel as an edit', async () => {
    const el = await mount();
    (table(el).shadowRoot.querySelector('[data-testid="services-packages-table-add"]') as HTMLElement).click();
    await settle(el);
    expect(table(el).panel, 'positive control: «Add» opens the create panel').toBe('create');
    const gate = hold();
    query = async (name) => {
      if (name !== 'services.packages.get') return [];
      await gate.wait;
      return [ROW_B];
    };
    rows(el)[1].click();
    await tick();
    await close(el, CLOSES[0][1]);
    gate.release();
    await settle(el);
    expect(table(el).panel).toBe('none');
    expect(el.editingId).toBeNull();
    expect(el.form.name).toBe('');
  });

  it('positive control: with the panel left OPEN the same slow read does fill the form', async () => {
    const el = await mount();
    const release = await editAThenTapB(el);
    release();
    await settle(el);
    expect(el.editingId).toBe('p2');
    expect(el.form.name).toBe('Bono 10 tintes');
    expect(el.form.maxUses).toBe('10');
    expect(table(el).panel).toBe('edit');
  });
});
