// Packages / vouchers screen (services#4): `services.packages.create/update/delete` had no UI.
//
// Same data-table CRUD as the rest of the Hub: «+» → create panel (name, discount, validity, uses
// and the SERVICES included with their sessions), «edit» pre-fills the same form for the header
// (the runtime has no line-edit command: lines are part of `create`), «delete» confirms first.
// Money travels in MINOR units, sessions in fixed-point 10⁶ (ADR-0147): 2 sessions = 2000000,
// and the discount percentage in BASIS POINTS (services#55): 10,50 % = 1050.
import { beforeEach, describe, expect, it } from 'vitest';

const ROWS = [
  { id: 'p1', name: 'Bono 5 cortes', slug: 'bono-5-cortes', discount_type: 'percentage', discount_percent_bp: 1000, discount_amount_cents: 0, fixed_price: null, is_active: 1, items: 1 },
];
const FULL = { ...ROWS[0], description: '', validity_days: 90, max_uses: 5, is_featured: 0 };
const SERVICES = [
  { id: 's1', name: 'Corte', price: '1200' },
  { id: 's2', name: 'Color', price: '4000' },
];
const commands: { name: string; payload: Record<string, unknown> }[] = [];
let sdk: Record<string, unknown>;

beforeEach(() => {
  commands.length = 0;
  sdk = {
    query: async (name: string) => (name === 'services.packages.get' ? [FULL] : []),
    queryPage: async () => ({ rows: ROWS, total: 1 }),
    queryAll: async (name: string) => (name === 'services.services.list' ? SERVICES : []),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  editingId: string | null;
  form: { name: string; discountType: string; discountValue: string; fixedPrice: string; validityDays: string; maxUses: string };
  items: { serviceId: string; sessions: string }[];
  addItem(): void;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  save(ev: Event): Promise<void>;
  confirmDelete(): Promise<void>;
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
const action = (el: Mounted, actionId: string, row = ROWS[0]) =>
  el.onRowAction(new CustomEvent('rowAction', { detail: { actionId, row } }));

describe('the CRUD lives inside the data-table, gated by permission', () => {
  it('addable + form in the `create` slot + actions edit/delete', async () => {
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { addable: boolean }) | null;
    expect(table?.addable).toBe(true);
    expect(el.shadowRoot.querySelector('form[slot="create"]')?.closest('ok-data-table')).toBeTruthy();
    expect(el.actions.map((a) => a.id)).toEqual(['edit', 'delete']);
  });
  it('a viewer sees no «+» and no actions', async () => {
    sdk.hasPermission = (p: string) => p === 'services.view_package';
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { addable: boolean }) | null;
    expect(table?.addable).toBe(false);
    expect(el.actions).toEqual([]);
  });
});

describe('create', () => {
  it('sends the header + the lines (sessions in fixed-point 10⁶, money in minor units)', async () => {
    const el = await mount();
    el.form = { name: 'Bono 5 cortes', discountType: 'percentage', discountValue: '10', fixedPrice: '', validityDays: '90', maxUses: '5' };
    el.items = [{ serviceId: 's1', sessions: '5' }, { serviceId: '', sessions: '1' }];
    await el.save(new Event('submit'));
    expect(commands.map((c) => c.name)).toEqual(['services.packages.create']);
    expect(commands[0].payload).toEqual({
      name: 'Bono 5 cortes',
      discount_type: 'percentage',
      discount_percent_bp: 1000,
      discount_amount_cents: null,
      fixed_price: null,
      validity_days: 90,
      max_uses: 5,
      items: [{ service_id: 's1', quantity: 5000000 }],
    });
  });
  it('a percentage with decimals travels as whole basis points, comma or dot', async () => {
    // services#55: the screen is the frontier. Whatever the cashier types, what leaves here is an
    // integer — so the same statement can never see an int8 and a float8 through the same slot.
    for (const typed of ['10,5', '10.5']) {
      commands.length = 0;
      const el = await mount();
      el.form = { name: 'Bono', discountType: 'percentage', discountValue: typed, fixedPrice: '', validityDays: '', maxUses: '' };
      el.items = [{ serviceId: 's1', sessions: '1' }];
      await el.save(new Event('submit'));
      expect(commands[0].payload.discount_percent_bp).toBe(1050);
      expect(Number.isInteger(commands[0].payload.discount_percent_bp)).toBe(true);
    }
  });
  it('a fixed discount travels in minor units; a closed price too', async () => {
    const el = await mount();
    el.form = { name: 'Pack', discountType: 'fixed', discountValue: '5,50', fixedPrice: '49,90', validityDays: '', maxUses: '' };
    el.items = [{ serviceId: 's2', sessions: '1' }];
    await el.save(new Event('submit'));
    const p = commands[0].payload;
    expect(p.discount_percent_bp).toBeNull();
    expect(p.discount_amount_cents).toBe(550);
    expect(p.fixed_price).toBe(4990);
    expect(p.validity_days).toBeNull();
    expect(p.max_uses).toBeNull();
    expect(p.items).toEqual([{ service_id: 's2', quantity: 1000000 }]);
  });
  it('refuses to create a package with no service line (a voucher for nothing)', async () => {
    const el = await mount();
    el.form = { name: 'Vacío', discountType: 'percentage', discountValue: '0', fixedPrice: '', validityDays: '', maxUses: '' };
    el.items = [{ serviceId: '', sessions: '1' }];
    await el.save(new Event('submit'));
    expect(commands).toEqual([]);
  });
});

describe('edit / delete', () => {
  it('edit reads the full package, pre-fills the header and updates through the partial door', async () => {
    const el = await mount();
    await action(el, 'edit');
    await settle(el);
    expect(el.editingId).toBe('p1');
    expect(el.form.name).toBe('Bono 5 cortes');
    expect(el.form.discountValue).toBe('10');
    expect(el.form.validityDays).toBe('90');
    el.form = { ...el.form, name: 'Bono 5 cortes + peinado', maxUses: '6' };
    await el.save(new Event('submit'));
    expect(commands.map((c) => c.name)).toEqual(['services.packages.update']);
    expect(commands[0].payload).toEqual({
      package_id: 'p1',
      name: 'Bono 5 cortes + peinado',
      discount_type: 'percentage',
      discount_percent_bp: 1000,
      discount_amount_cents: 0,
      fixed_price: null,
      validity_days: 90,
      max_uses: 6,
    });
    expect(el.editingId).toBeNull();
  });
  it('delete confirms first, then runs the command', async () => {
    const el = await mount();
    await action(el, 'delete');
    await settle(el);
    expect(commands).toEqual([]);
    const modal = el.shadowRoot.querySelector('ion-modal') as (HTMLElement & { isOpen: boolean }) | null;
    expect(modal?.isOpen).toBe(true);
    await el.confirmDelete();
    expect(commands).toEqual([{ name: 'services.packages.delete', payload: { package_id: 'p1' } }]);
  });
  it('without permission a forged action does nothing', async () => {
    sdk.hasPermission = () => false;
    const el = await mount();
    await action(el, 'delete');
    await el.confirmDelete();
    el.form = { name: 'x', discountType: 'percentage', discountValue: '0', fixedPrice: '', validityDays: '', maxUses: '' };
    el.items = [{ serviceId: 's1', sessions: '1' }];
    await el.save(new Event('submit'));
    expect(commands).toEqual([]);
  });
});
