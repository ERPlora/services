// services#153 — a voucher DELETED from the catalogue whose sold vouchers are still alive.
//
// Deleting a voucher stops SELLING it; what was sold is still the customer's (Square, Fresha,
// Booksy, Mindbody, Vagaro). Before the fix the row vanished from **Bonos y paquetes** and with it
// the only way into its «Bonos vendidos» and «Movimientos», although the delete prompt promised the
// sold ones «keep their balance». The server now answers retired packages with something sold when
// the catalogue asks (`include_retired`, `queries/packages_list.sql`). What this file pins:
//
//   1. the Estado filter offers the three words: active, inactive and retired (the column is the
//      query's `status`, not `is_active`, which cannot tell a deleted package from a live one);
//   2. picking «retired» switches the SCOPE (`include_retired`), not just the filter — otherwise
//      the server keeps answering the live ones and the filter paints an empty table;
//   3. the first load does NOT widen it, and clearing the filter puts it back;
//   4. in that view the row offers only what still makes sense — «Bonos vendidos» and
//      «Movimientos» — and never Edit or Delete;
//   5. tapping a retired row opens its «Bonos vendidos», not the editor of a package that is gone;
//   6. an Edit or Delete that still reaches a retired row (an action list painted before the
//      filter changed) does nothing.
// The filter and the tap go through the events of the table itself (`filterChange`, `rowClick`),
// the way a person reaches them — calling the handlers directly would not see the wiring.
import { beforeEach, describe, expect, it } from 'vitest';

const RETIRED = {
  id: 'p-old',
  name: 'Bono 5 cortes',
  slug: 'bono-5-cortes',
  discount_type: 'percentage',
  discount_percent_bp: 1000,
  discount_amount_cents: 0,
  fixed_price: null,
  is_active: 0,
  status: 'retired',
  items: 1,
};

const commands: { name: string; payload: Record<string, unknown> }[] = [];
const pages: { name: string; params: Record<string, unknown> }[] = [];
let sdk: Record<string, unknown>;

beforeEach(() => {
  commands.length = 0;
  pages.length = 0;
  sdk = {
    query: async () => [],
    queryOptional: async () => undefined,
    queryPage: async (name: string, params: Record<string, unknown>) => {
      pages.push({ name, params });
      return name === 'services.packages.list' ? { rows: [RETIRED], total: 1 } : { rows: [], total: 0 };
    },
    queryAll: async () => [],
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  columns: { key: string; options?: { value: string }[]; format?: (r: Record<string, unknown>) => string }[];
  grantsOf: { id: string; name: string } | null;
  editingId: string | null;
  deleteTarget: { id: string } | null;
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

const settle = async (el: Mounted) => {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
};

const catalogueLoads = () => pages.filter((p) => p.name === 'services.packages.list');

/** What the table emits; the component only ever hears it through the table. */
const fromTable = async (el: Mounted, event: string, detail: unknown) => {
  const table = el.shadowRoot.querySelector('ok-data-table');
  expect(table, 'the catalogue table is rendered').not.toBe(null);
  table!.dispatchEvent(new CustomEvent(event, { detail }));
  await settle(el);
};

const filterStatus = (el: Mounted, value: string) => fromTable(el, 'filterChange', { col: 'status', value });
const tapRow = (el: Mounted, row: Record<string, unknown>) => fromTable(el, 'rowClick', { row });
const showRetired = (el: Mounted) => filterStatus(el, 'retired');

describe('a deleted voucher with sales is reachable, and only on purpose', () => {
  it('the Estado filter offers active, inactive and retired, from the query `status`', async () => {
    const el = await mount();
    const status = el.columns.find((c) => c.key === 'status');
    expect(status?.options?.map((o) => o.value)).toEqual(['active', 'inactive', 'retired']);
    expect(status?.format?.(RETIRED)).toBe('ui.status.retired');
    expect(el.columns.some((c) => c.key === 'is_active'), 'is_active cannot tell deleted from live').toBe(false);
  });

  it('the first load does NOT widen the scope', async () => {
    await mount();
    expect(catalogueLoads()[0]?.params.params ?? {}).toEqual({});
  });

  it('picking «retired» switches the scope, not just the filter — in ONE request', async () => {
    const el = await mount();
    const before = catalogueLoads().length;
    await showRetired(el);
    const loads = catalogueLoads();
    expect(loads.length - before).toBe(1);
    const last = loads[loads.length - 1];
    expect(last.params.params).toEqual({ include_retired: 1 });
    expect((last.params.filters as Record<string, unknown>).status).toBe('retired');
  });

  it('clearing the filter puts the scope back', async () => {
    const el = await mount();
    await showRetired(el);
    await filterStatus(el, '');
    const loads = catalogueLoads();
    expect(loads[loads.length - 1].params.params ?? {}).toEqual({});
  });
});

describe('what a retired row offers', () => {
  it('only «Bonos vendidos» and «Movimientos» — never edit or delete', async () => {
    const el = await mount();
    expect(el.actions.map((a) => a.id)).toEqual(['edit', 'movements', 'grants', 'delete']);
    await showRetired(el);
    expect(el.actions.map((a) => a.id)).toEqual(['movements', 'grants']);
  });

  it('tapping the row opens its «Bonos vendidos», not the editor', async () => {
    const el = await mount();
    await showRetired(el);
    await tapRow(el, RETIRED);
    expect(el.grantsOf).toEqual({ id: 'p-old', name: 'Bono 5 cortes' });
    expect(el.editingId ?? null).toBe(null);
  });

  it('a live row still opens the editor', async () => {
    const el = await mount();
    await tapRow(el, { ...RETIRED, id: 'p-live', status: 'active', is_active: 1 });
    expect(el.grantsOf).toBe(null);
    expect(el.editingId).toBe('p-live');
  });

  it('an Edit or Delete that still reaches a retired row does nothing', async () => {
    const el = await mount();
    await fromTable(el, 'rowAction', { actionId: 'edit', row: RETIRED });
    await fromTable(el, 'rowAction', { actionId: 'delete', row: RETIRED });
    expect(el.editingId ?? null, 'no editor for a package that is gone').toBe(null);
    expect(el.deleteTarget ?? null, 'no second delete').toBe(null);
    expect(commands.filter((c) => c.name.startsWith('services.packages.')), 'nothing written').toEqual([]);
  });
});
