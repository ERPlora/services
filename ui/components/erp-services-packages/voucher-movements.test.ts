// services#71 — the voucher's MOVEMENTS are consultable from its sheet (ADR-0386).
//
// «El movimiento es auditable y consultable desde la ficha del bono — no un decremento silencioso»
// is half the issue, and it is the half a database cannot deliver on its own: a refund that only
// exists as a soft-deleted row nobody can look at is exactly Mindbody's failure with better
// bookkeeping. So the packages screen grows one row action that opens the voucher's ledger —
// held, consumed, released and REFUNDED, with who, when and against which return document.
//
// What is asserted here is the part that breaks silently: that the screen asks for the movements
// with the voucher it was opened on, that it paints the three states a real screen has (loading,
// empty, error) instead of only the happy path, and that a refund is rendered as a refund — with
// its author and its document — rather than as one more consumed session.
import { beforeEach, describe, expect, it } from 'vitest';

const ROWS = [
  {
    id: 'p1',
    name: 'Bono 5 cortes',
    slug: 'bono-5-cortes',
    discount_type: 'percentage',
    discount_percent_bp: 1000,
    discount_amount_cents: 0,
    fixed_price: null,
    is_active: 1,
    items: 1,
  },
];

const MOVEMENTS = [
  {
    redemption_id: 'r3',
    package_id: 'p1',
    customer_id: 'cus-1',
    service_id: 's1',
    service_name: 'Corte',
    use_index: 2,
    status: 'consumed',
    redeemed_at: '2026-08-18T10:00:00Z',
    settled_at: '2026-08-18T10:05:00Z',
    sale_id: 'sale-2',
    refunded_at: '2026-08-20T09:00:00Z',
    refunded_by: 'u-manager',
    refund_ref: 'return-7',
    refund_note: 'la clienta cambió de idea',
    refund_expired: 0,
    is_deleted: 1,
    movement: 'refunded',
  },
  {
    redemption_id: 'r2',
    package_id: 'p1',
    customer_id: 'cus-1',
    service_id: 's1',
    service_name: 'Corte',
    use_index: 1,
    status: 'consumed',
    redeemed_at: '2026-08-17T10:00:00Z',
    settled_at: '2026-08-17T10:05:00Z',
    sale_id: 'sale-1',
    refunded_at: null,
    refunded_by: null,
    refund_ref: null,
    refund_note: '',
    refund_expired: 0,
    is_deleted: 0,
    movement: 'consumed',
  },
];

const asked: { name: string; params: Record<string, unknown> }[] = [];
let answer: () => Promise<unknown[]>;

beforeEach(() => {
  asked.length = 0;
  answer = async () => MOVEMENTS;
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async () => ({ rows: ROWS, total: 1 }),
    queryAll: async (name: string, params?: Record<string, unknown>) => {
      asked.push({ name, params: params ?? {} });
      if (name === 'services.packages.redemption_history') return answer();
      return [];
    },
    command: async () => ({}),
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  };
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  movementsOf: { id: string; name: string } | null;
  movements: Record<string, unknown>[];
  movementsLoading: boolean;
  movementsError: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
};

async function mount(): Promise<Mounted> {
  await import('./erp-services-packages');
  const el = document.createElement('erp-services-packages') as unknown as Mounted;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const open = (el: Mounted) =>
  el.onRowAction(
    new CustomEvent('rowAction', { detail: { actionId: 'movements', row: ROWS[0] } }),
  );

describe("the voucher's movements are one click from its row", () => {
  it('offers the action to anyone who may see a balance', async () => {
    const el = await mount();
    expect(el.actions.map((a) => a.id)).toContain('movements');
  });

  it('hides it from someone who cannot see balances', async () => {
    (globalThis as Record<string, unknown>).erplora = {
      ...((globalThis as Record<string, unknown>).erplora as object),
      hasPermission: (p: string) => p !== 'services.view_package_balance',
    };
    const el = await mount();
    expect(el.actions.map((a) => a.id)).not.toContain('movements');
  });

  it('asks for the movements OF THE VOUCHER it was opened on', async () => {
    const el = await mount();
    await open(el);
    const call = asked.find((a) => a.name === 'services.packages.redemption_history');
    expect(call).toBeDefined();
    expect(call?.params).toEqual({ package_id: 'p1' });
    expect(el.movementsOf?.name).toBe('Bono 5 cortes');
  });

  it('renders a refund as a refund — with who returned it and against what', async () => {
    const el = await mount();
    await open(el);
    await el.updateComplete;
    const text = el.shadowRoot.textContent ?? '';
    // The i18n stub echoes the key, so the movement's own label is what is asserted — a refund
    // that rendered as one more consumed session is the failure this catches.
    expect(text).toContain('ui.movement.refunded');
    expect(text).toContain('ui.movement.consumed');
    expect(text).toContain('u-manager');
    expect(text).toContain('return-7');
  });

  it('says so when the voucher has no movements yet, instead of showing an empty box', async () => {
    answer = async () => [];
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(el.movements).toEqual([]);
    expect(el.shadowRoot.textContent ?? '').toContain('ui.emptyMovements');
  });

  it('shows the error instead of an empty list when the query fails', async () => {
    answer = async () => {
      throw new Error('db: connection refused');
    };
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(el.movementsError).not.toBe('');
    expect(el.shadowRoot.textContent ?? '').toContain('ui.errorMovements');
  });

  it('is loading before it has an answer, and not after', async () => {
    let release: (rows: unknown[]) => void = () => {};
    answer = () => new Promise<unknown[]>((r) => (release = r));
    const el = await mount();
    const pending = open(el);
    await el.updateComplete;
    expect(el.movementsLoading).toBe(true);
    release(MOVEMENTS);
    await pending;
    await el.updateComplete;
    expect(el.movementsLoading).toBe(false);
  });
});
