// Editing a service from the list (services#4).
//
// `services.services.update` existed since day one and had ZERO callers in the UI: the screen could
// create and archive, never change a price. Every catalogue the market ships (Fresha, Square,
// Vagaro, Odoo, Business Central) edits in place from the row. This file pins the pattern the rest
// of the Hub already uses (`inventory` products, inventory#8): the row action «edit» pre-fills the
// SAME form of the `create` panel, and the submit decides create vs update by `editingId`.
//
// The update goes through the PARTIAL door (`records.service.patch`, hub#632): the screen sends the
// id + the fields it edits and the runtime completes the rest from `services.services.get`, so a
// field the form does not show (buffers, capacity, sku…) is never wiped by an edit.
import { beforeEach, describe, expect, it } from 'vitest';

const ROW = { id: 's1', name: 'Corte', price: '1200', pricing_type: 'fixed', duration_minutes: 30, is_bookable: 1, category_id: 'c1', category: 'Peluquería', tax_category_key: 'standard', status: 'active' };
const FULL = { ...ROW, slug: 'corte', description: 'Corte clásico', is_active: 1, sort_order: 0, cost: 0, min_price: null, max_price: null };
const CATEGORIES = [{ id: 'c1', name: 'Peluquería', slug: 'peluqueria', service_count: 2 }];
const TAX = [{ id: 't1', key: 'standard', name: 'IVA general' }];

const commands: { name: string; payload: Record<string, unknown> }[] = [];
const queries: { name: string; params?: Record<string, unknown> }[] = [];
const queryAlls: string[] = [];
let sdk: Record<string, unknown>;

beforeEach(() => {
  commands.length = 0;
  queries.length = 0;
  queryAlls.length = 0;
  sdk = {
    query: async (name: string, params?: Record<string, unknown>) => {
      queries.push({ name, params });
      if (name === 'services.services.get') return [FULL];
      return [];
    },
    queryOptional: async () => undefined,
    queryPage: async () => ({ rows: [ROW], total: 1 }),
    queryAll: async (name: string) => {
      queryAlls.push(name);
      if (name === 'taxes.categories.list') return TAX;
      if (name === 'services.categories.list') return CATEGORIES;
      return [];
    },
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string) => key,
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  editingId: string | null;
  newName: string;
  newPrice: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  createService(ev: Event): Promise<void>;
};

async function mount(): Promise<Mounted> {
  await import('./erp-services-list');
  const el = document.createElement('erp-services-list') as unknown as Mounted;
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
const edit = (el: Mounted) => el.onRowAction(new CustomEvent('rowAction', { detail: { actionId: 'edit', row: ROW } }));

describe('the row offers «edit» to who can change a service', () => {
  it('offers `edit` with services.change_service', async () => {
    const el = await mount();
    expect(el.actions.map((a) => a.id)).toContain('edit');
  });
  it('hides it without the permission', async () => {
    sdk.hasPermission = (p: string) => p !== 'services.change_service';
    const el = await mount();
    expect(el.actions.map((a) => a.id)).not.toContain('edit');
  });
});

describe('editing pre-fills the create form and saves through services.services.update', () => {
  it('reads the FULL row (services.services.get) and pre-fills the form', async () => {
    const el = await mount();
    await edit(el);
    await settle(el);
    expect(queries.find((q) => q.name === 'services.services.get')?.params).toEqual({ service_id: 's1' });
    expect(el.editingId).toBe('s1');
    expect(el.newName).toBe('Corte');
    // services#54: the field shows the price in the hub's locale notation («12,00» in es), same
    // decimals and separator as the table next to it — not the raw `String(12)`.
    expect(el.newPrice, 'the price is shown in major units, in the hub locale (cents → «12,00»)').toBe('12,00');
    // pm#450: «Editing service — Corte» moved to the panel header (see below); the body no longer
    // repeats it.
  });

  it('the submit sends update (not create) with the id and the edited fields, price in minor units', async () => {
    const el = await mount();
    await edit(el);
    await settle(el);
    el.newName = 'Corte y peinado';
    el.newPrice = '15,50';
    await el.createService(new Event('submit'));
    expect(commands.map((c) => c.name)).toEqual(['services.services.update']);
    const p = commands[0].payload;
    expect(p.service_id).toBe('s1');
    expect(p.name).toBe('Corte y peinado');
    expect(p.price).toBe(1550);
    expect(p.tax_category_key).toBe('standard');
    expect(el.editingId, 'back to create mode after saving').toBeNull();
  });

  it('the categories of the form come from queryAll (a hub with > 50 categories saw only 50)', async () => {
    await mount();
    expect(queryAlls).toContain('services.categories.list');
    expect(queries.map((q) => q.name)).not.toContain('services.categories.list');
  });
});

// pm#450 (outfitkit#150): editing opened the panel with open('create'), so its header said «New»
// while the body said «Editing service — Corte». The table knows an «edit» mode and takes the whole
// title: the screen asks for it and drops the repeated line from the body.
describe('editing titles the panel header, not its body (pm#450)', () => {
  type Table = HTMLElement & { open: (...args: unknown[]) => void; shadowRoot: ShadowRoot };
  const table = (el: Mounted) => el.shadowRoot.querySelector('ok-data-table') as Table;

  it("opens the panel with open('edit', { title }) — «Editing service — <name>» in the header", async () => {
    const el = await mount();
    const calls: unknown[][] = [];
    table(el).open = (...args: unknown[]) => void calls.push(args);
    await edit(el);
    await settle(el);
    expect(calls).toEqual([['edit', { title: 'ui.editingTitle — Corte' }]]);
  });

  it('the form body no longer repeats the editing title', async () => {
    const el = await mount();
    await edit(el);
    await settle(el);
    const form = el.shadowRoot.querySelector('form[slot="create"]') as HTMLElement;
    expect(form.querySelector('[data-testid="services-list-editing"]')).toBeNull();
    expect(form.textContent).not.toContain('ui.editingTitle');
  });

  it('«Add» after an edit opens a CLEAN create form (the header says «New»: the form must agree)', async () => {
    const el = await mount();
    await edit(el);
    await settle(el);
    const add = table(el).shadowRoot.querySelector('[data-testid="services-list-table-add"]') as HTMLElement;
    expect(add, 'the table paints its «Add» button').toBeTruthy();
    add.click();
    await settle(el);
    expect(el.editingId, 'a submit here would UPDATE the edited service under a «New» header').toBeNull();
    expect(el.newName).toBe('');
  });

  it('a click INSIDE the edit form (a field, a row) does not drop the edit — only «Add» does', async () => {
    const el = await mount();
    await edit(el);
    await settle(el);
    (el.shadowRoot.querySelector('[data-testid="services-list-name"]') as HTMLElement).click();
    table(el).click();
    await settle(el);
    expect(el.editingId, 'the table host hears every click of the projected form').toBe('s1');
  });

  it('«Add» with no edit in progress keeps what was typed', async () => {
    const el = await mount();
    el.newName = 'Brushing';
    (table(el).shadowRoot.querySelector('[data-testid="services-list-table-add"]') as HTMLElement).click();
    await settle(el);
    expect(el.newName).toBe('Brushing');
  });
});
