// services#71 — the voucher's MOVEMENTS are consultable from its sheet (ADR-0386).
// services#76 — and they arrive a PAGE at a time.
//
// «El movimiento es auditable y consultable desde la ficha del bono — no un decremento silencioso»
// is half the issue, and it is the half a database cannot deliver on its own: a refund that only
// exists as a soft-deleted row nobody can look at is exactly Mindbody's failure with better
// bookkeeping. So the packages screen grows one row action that opens the voucher's ledger —
// held, consumed, released, expired and REFUNDED, with who, when and against which return document.
//
// What is asserted here is the part that breaks silently: that the screen asks for the movements
// with the voucher it was opened on, that it asks for ONE PAGE of them instead of the whole ledger
// (`queryAll` walks every page and hands a tablet thousands of rows — services#76), that «load
// more» ADDS to what is on screen instead of replacing it, that it paints the three states a real
// screen has (loading, empty, error) instead of only the happy path, and that a refund is rendered
// as a refund — with its author and its document — rather than as one more consumed session.
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
    release_reason: '',
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
    release_reason: '',
    movement: 'consumed',
  },
];

/** A session on a checkout nobody ever came back to: a timeout, NOT the cashier's undo. */
const EXPIRED = {
  ...MOVEMENTS[1],
  redemption_id: 'r1',
  use_index: 0,
  settled_at: null,
  sale_id: null,
  status: 'held',
  is_deleted: 1,
  release_reason: 'expired',
  movement: 'expired',
};

const asked: { name: string; params: Record<string, unknown> }[] = [];
const askedAll: string[] = [];
let answer: (params: Record<string, unknown>) => Promise<{ rows: unknown[]; total: number }>;

const page = (rows: unknown[], total = rows.length) => async () => ({ rows, total });

beforeEach(() => {
  asked.length = 0;
  askedAll.length = 0;
  answer = page(MOVEMENTS);
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async (name: string, params?: Record<string, unknown>) => {
      if (name === 'services.packages.redemption_history') {
        asked.push({ name, params: params ?? {} });
        return answer(params ?? {});
      }
      return { rows: ROWS, total: 1 };
    },
    queryAll: async (name: string) => {
      askedAll.push(name);
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
  movementsTotal: number;
  movementsLoading: boolean;
  movementsError: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  loadMoreMovements(): Promise<void>;
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
    expect(call?.params.params).toEqual({ package_id: 'p1' });
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

  it('tells a session nobody came back for apart from one the cashier undid', async () => {
    // Migration 014 added `release_reason` exactly so the ledger could tell them apart; a screen
    // with no label for `expired` would print a raw key at a salon, or nothing at all.
    answer = page([EXPIRED]);
    const el = await mount();
    await open(el);
    await el.updateComplete;
    const text = el.shadowRoot.textContent ?? '';
    expect(text).toContain('ui.movement.expired');
    expect(text).not.toContain('ui.movement.released');
  });

  it('says so when the voucher has no movements yet, instead of showing an empty box', async () => {
    answer = page([]);
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
    let release: (p: { rows: unknown[]; total: number }) => void = () => {};
    answer = () => new Promise((r) => (release = r));
    const el = await mount();
    const pending = open(el);
    await el.updateComplete;
    expect(el.movementsLoading).toBe(true);
    release({ rows: MOVEMENTS, total: MOVEMENTS.length });
    await pending;
    await el.updateComplete;
    expect(el.movementsLoading).toBe(false);
  });
});

// ── services#76: a ledger with two years of movements is read a page at a time ────────────────
describe('the ledger arrives a page at a time', () => {
  it('asks for a PAGE, never for the whole ledger', async () => {
    const el = await mount();
    await open(el);
    // `queryAll` walks every page of a list query and hands back the lot: on the star voucher of
    // a salon after two years that is thousands of rows in one response, on a tablet.
    expect(askedAll).not.toContain('services.packages.redemption_history');
    expect(asked[0].params.offset).toBe(0);
  });

  it('keeps the movements already on screen when it brings the next page', async () => {
    answer = async (params) =>
      Number(params.offset ?? 0) === 0
        ? { rows: MOVEMENTS, total: 3 }
        : { rows: [EXPIRED], total: 3 };
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(el.movements.map((m) => m.redemption_id)).toEqual(['r3', 'r2']);
    expect(el.movementsTotal).toBe(3);

    await el.loadMoreMovements();
    await el.updateComplete;
    expect(asked[1].params.offset).toBe(2);
    expect(el.movements.map((m) => m.redemption_id)).toEqual(['r3', 'r2', 'r1']);
  });

  it('offers «load more» only while there is more, and says how much is left', async () => {
    answer = page(MOVEMENTS, 3);
    const el = await mount();
    await open(el);
    await el.updateComplete;
    let text = el.shadowRoot.textContent ?? '';
    expect(text).toContain('ui.movementsMore');
    expect(text).toContain('"shown":2');
    expect(text).toContain('"total":3');

    answer = page([EXPIRED], 3);
    await el.loadMoreMovements();
    await el.updateComplete;
    text = el.shadowRoot.textContent ?? '';
    expect(text).not.toContain('ui.movementsMore');
  });

  it('reopening the sheet starts the ledger again instead of stacking it', async () => {
    answer = page(MOVEMENTS, 3);
    const el = await mount();
    await open(el);
    await el.updateComplete;
    await open(el);
    await el.updateComplete;
    expect(el.movements.map((m) => m.redemption_id)).toEqual(['r3', 'r2']);
    expect(asked[asked.length - 1].params.offset).toBe(0);
  });
});

// pm#459 (customers#91 finding): a late reply of the FIRST voucher must not land on the sheet of
// the second — neither its rows (already guarded) nor its FAILURE, nor its end of loading.
describe('two vouchers opened in a row: the last one owns the sheet (pm#459)', () => {
  const ROW_B = { ...ROWS[0], id: 'p2', name: 'Bono color' };
  const openRow = (el: Mounted, row: Record<string, unknown>) =>
    el.onRowAction(new CustomEvent('rowAction', { detail: { actionId: 'movements', row } }));

  it("a late FAILURE of the first voucher's page does not paint an error on the second's sheet", async () => {
    let failFirst: (e: Error) => void = () => {};
    let releaseSecond: (p: { rows: unknown[]; total: number }) => void = () => {};
    answer = (params) =>
      (params.params as Record<string, unknown>)?.package_id === 'p1'
        ? new Promise((_, reject) => (failFirst = reject))
        : new Promise((r) => (releaseSecond = r));
    const el = await mount();
    const first = openRow(el, ROWS[0]);
    const second = openRow(el, ROW_B);
    failFirst(new Error('db: connection refused'));
    await first;
    await el.updateComplete;
    expect(el.movementsOf?.id).toBe('p2');
    expect(el.movementsError, "the first voucher's failure is not the second's").toBe('');
    expect(el.movementsLoading, "the second voucher's page is still on its way").toBe(true);
    releaseSecond({ rows: MOVEMENTS, total: MOVEMENTS.length });
    await second;
    await el.updateComplete;
    expect(el.movements.map((m) => m.redemption_id)).toEqual(['r3', 'r2']);
    expect(el.movementsLoading).toBe(false);
  });

  it("closing and reopening the SAME voucher: the page of the first opening is not stacked on the new one", async () => {
    const releases: ((p: { rows: unknown[]; total: number }) => void)[] = [];
    answer = () => new Promise((r) => releases.push(r));
    const el = await mount();
    const first = openRow(el, ROWS[0]);
    el.movementsOf = null; // the cashier closes the sheet while the page is on its way
    await el.updateComplete;
    const second = openRow(el, ROWS[0]);
    releases[1]({ rows: MOVEMENTS, total: MOVEMENTS.length });
    await second;
    releases[0]({ rows: MOVEMENTS, total: MOVEMENTS.length });
    await first;
    await el.updateComplete;
    expect(el.movements.map((m) => m.redemption_id), "one ledger, not two copies of it").toEqual(["r3", "r2"]);
  });
});
