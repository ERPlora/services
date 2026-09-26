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
  it('addable + form in the `create` slot + actions edit/movements/delete', async () => {
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { addable: boolean }) | null;
    expect(table?.addable).toBe(true);
    expect(el.shadowRoot.querySelector('form[slot="create"]')?.closest('ok-data-table')).toBeTruthy();
    // `movements` joined the row in services#71: the voucher's ledger (held, consumed, released,
    // refunded) is one click from its row, gated by `services.view_package_balance`.
    expect(el.actions.map((a) => a.id)).toEqual(['edit', 'movements', 'delete']);
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

// ── pm#155 (outfitkit#67, second half) ────────────────────────────────────────────────────────
//
// At 1440 px the «Actions» column fell off the screen with nothing hinting the table went on to
// the right, so the only door into a package was a button nobody could see. OutfitKit 0.1.44
// pins that column, but the other half of the fix is opt-in: `rowClickable` turns the whole row
// into a door — the first thing a user tries. The list has to ask for it, and wire `rowClick`
// to the same edit form the «edit» action opens (full record first, header form pre-filled).
describe('clicking the row opens the package (pm#155)', () => {
  it('the table declares `rowClickable` → the whole row is a door, not just the action button', async () => {
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { rowClickable: boolean }) | null;
    expect(
      table?.rowClickable,
      'without `rowClickable` the row is dead: if the actions column is off-screen there is no way in',
    ).toBe(true);
  });

  it('`rowClick` puts the package in the edit form, same as the «edit» action', async () => {
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as HTMLElement | null;
    table!.dispatchEvent(new CustomEvent('rowClick', { detail: { row: ROWS[0] } }));
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.editingId, 'the row was clicked and the edit form did not take the package').toBe('p1');
  });
});

// pm#450 (outfitkit#150): the edit panel said «New» in its header and «Editing package — Bono…» in
// its body. The screen opens it in «edit» mode with that title and drops the repeated line.
describe('editing titles the panel header, not its body (pm#450)', () => {
  type Table = HTMLElement & { open: (panel?: unknown, opts?: { title?: string }) => void; shadowRoot: ShadowRoot };
  const table = (el: Mounted) => el.shadowRoot.querySelector('ok-data-table') as Table;

  it("opens the panel with open('edit', { title }) — «Editing package — <name>» in the header", async () => {
    const el = await mount();
    const calls: unknown[][] = [];
    table(el).open = (...args: unknown[]) => void calls.push(args);
    await action(el, 'edit');
    await settle(el);
    expect(calls).toEqual([['edit', { title: 'ui.editingPackageTitle — Bono 5 cortes' }]]);
  });

  // The header only carries the title with OutfitKit ≥ 0.1.94 (outfitkit#150); an older shell
  // (hub:stable 1.1.29 ships 0.1.73) ignores it and keeps «New». The body line only goes away when
  // the table REALLY painted the title — its dialog is labelled with it — never on faith.
  const shellTable = (el: Mounted, honoursTitle: boolean) => {
    const t = table(el);
    const dialog = document.createElement('aside');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Form');
    const root = document.createElement('div');
    root.appendChild(dialog);
    Object.defineProperty(t, 'shadowRoot', { value: root, configurable: true });
    // Like the real Lit table, open() only schedules the render: the dialog is labelled on the
    // next microtask and `updateComplete` resolves once it is. Reading the label before awaiting
    // it sees the old «Form» and keeps the line even when the header carries the title.
    let rendered: Promise<void> = Promise.resolve();
    Object.defineProperty(t, 'updateComplete', { get: () => rendered, configurable: true });
    t.open = (_panel: unknown, opts?: { title?: string }) => {
      rendered = Promise.resolve().then(() => {
        if (honoursTitle && opts?.title) dialog.setAttribute('aria-label', opts.title);
      });
    };
  };

  it('the form body no longer repeats the editing title once the header carries it', async () => {
    const el = await mount();
    shellTable(el, true);
    await action(el, 'edit');
    await settle(el);
    const form = el.shadowRoot.querySelector('form[slot="create"]') as HTMLElement;
    expect(form.querySelector('[data-testid="services-packages-editing"]')).toBeNull();
    expect(form.textContent).not.toContain('ui.editingPackageTitle');
  });

  it('with a shell whose table ignores the title (OutfitKit < 0.1.94), the body keeps the editing line', async () => {
    const el = await mount();
    shellTable(el, false);
    await action(el, 'edit');
    await settle(el);
    const line = el.shadowRoot.querySelector('form[slot="create"] [data-testid="services-packages-editing"]') as HTMLElement | null;
    expect(line, 'the header says «New»: without this line nothing says it is an edit').toBeTruthy();
    expect(line!.textContent).toContain('ui.editingPackageTitle');
    expect(line!.textContent).toContain('Bono 5 cortes');
  });

  it('a later «Add» (clean form) hides the fallback line again', async () => {
    const el = await mount();
    shellTable(el, false);
    await action(el, 'edit');
    await settle(el);
    (el as unknown as { cancelEdit(): void }).cancelEdit();
    await settle(el);
    expect(el.shadowRoot.querySelector('form[slot="create"] [data-testid="services-packages-editing"]')).toBeNull();
  });

  it('«Add» after an edit opens a CLEAN create form (with its service lines back)', async () => {
    const el = await mount();
    await action(el, 'edit');
    await settle(el);
    const add = table(el).shadowRoot.querySelector('[data-testid="services-packages-table-add"]') as HTMLElement;
    expect(add, 'the table paints its «Add» button').toBeTruthy();
    add.click();
    await settle(el);
    expect(el.editingId, 'a submit here would UPDATE the edited package under a «New» header').toBeNull();
    expect(el.form.name).toBe('');
  });

  it('a click INSIDE the edit form (a field, a row) does not drop the edit — only «Add» does', async () => {
    const el = await mount();
    await action(el, 'edit');
    await settle(el);
    (el.shadowRoot.querySelector('[data-testid="services-packages-name"]') as HTMLElement).click();
    table(el).click();
    await settle(el);
    expect(el.editingId, 'the table host hears every click of the projected form').toBe('p1');
  });

  it('«Add» with no edit in progress keeps what was typed', async () => {
    const el = await mount();
    el.form = { ...el.form, name: 'Bono color' };
    (table(el).shadowRoot.querySelector('[data-testid="services-packages-table-add"]') as HTMLElement).click();
    await settle(el);
    expect(el.form.name).toBe('Bono color');
  });
});

// pm#459: two «edit» taps in a row. Each opening awaits the full package (services.packages.get)
// and then the table render (updateComplete); the two waits can resolve in the opposite order. The
// LAST opening wins: form, id and header belong to the second row, never to a stale first reply.
describe('two «edit» in a row: the last opening wins (pm#459)', () => {
  type Table = HTMLElement & { open: (panel?: unknown, opts?: { title?: string }) => void; shadowRoot: ShadowRoot };
  const table = (el: Mounted) => el.shadowRoot.querySelector('ok-data-table') as Table;
  const ROW_B = { ...ROWS[0], id: 'p2', name: 'Bono color', discount_type: 'fixed', discount_percent_bp: 0, discount_amount_cents: 500 };
  const FULL_B = { ...FULL, ...ROW_B, validity_days: 30, max_uses: 3 };

  it('a slow reply for the FIRST row does not overwrite the form of the second', async () => {
    const el = await mount();
    let releaseFirst: () => void = () => {};
    const firstHeld = new Promise<void>((r) => (releaseFirst = r));
    sdk.query = async (name: string, params?: Record<string, unknown>) => {
      if (name !== 'services.packages.get') return [];
      if (params?.package_id === 'p1') {
        await firstHeld;
        return [FULL];
      }
      return [FULL_B];
    };
    const titles: (string | undefined)[] = [];
    table(el).open = (_panel?: unknown, opts?: { title?: string }) => void titles.push(opts?.title);
    const first = action(el, 'edit');
    const second = action(el, 'edit', ROW_B);
    await second;
    releaseFirst();
    await first;
    await settle(el);
    expect(el.editingId, 'a submit here would UPDATE the first package').toBe('p2');
    expect(el.form.name).toBe('Bono color');
    expect(el.form.discountType).toBe('fixed');
    expect(el.form.maxUses).toBe('3');
    expect(titles.at(-1), 'the header names the row last tapped').toBe('ui.editingPackageTitle — Bono color');
  });

  it('«Add» while an edit is still loading keeps the clean create form', async () => {
    const el = await mount();
    let releaseFirst: () => void = () => {};
    const firstHeld = new Promise<void>((r) => (releaseFirst = r));
    sdk.query = async (name: string) => {
      if (name !== 'services.packages.get') return [];
      await firstHeld;
      return [FULL];
    };
    const panels: unknown[] = [];
    table(el).open = (panel?: unknown) => void panels.push(panel);
    const first = action(el, 'edit');
    (el as unknown as { cancelEdit(): void }).cancelEdit();
    releaseFirst();
    await first;
    await settle(el);
    expect(el.editingId, 'the header says «New»: a late reply must not turn it into an edit').toBeNull();
    expect(el.form.name).toBe('');
    expect(panels).toEqual([]);
  });

  it('when the FIRST render settles last, the body does not bring the editing line back', async () => {
    const el = await mount();
    sdk.query = async (name: string, params?: Record<string, unknown>) =>
      name === 'services.packages.get' ? [params?.package_id === 'p2' ? FULL_B : FULL] : [];
    const t = table(el);
    const dialog = document.createElement('aside');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Form');
    const root = document.createElement('div');
    root.appendChild(dialog);
    Object.defineProperty(t, 'shadowRoot', { value: root, configurable: true });
    // The shell titles the header (OutfitKit ≥ 0.1.94); the first open's render is held and
    // resolves AFTER the second one.
    let releaseFirst: () => void = () => {};
    const firstHeld = new Promise<void>((r) => (releaseFirst = r));
    let opens = 0;
    let rendered: Promise<void> = Promise.resolve();
    Object.defineProperty(t, 'updateComplete', { get: () => rendered, configurable: true });
    t.open = (_panel: unknown, opts?: { title?: string }) => {
      const n = ++opens;
      const label = Promise.resolve().then(() => {
        if (opts?.title) dialog.setAttribute('aria-label', opts.title);
      });
      rendered = n === 1 ? label.then(() => firstHeld) : label;
    };
    // The first opening reaches its render (header «Bono 5 cortes», held) before the second tap.
    const first = action(el, 'edit');
    await new Promise((r) => setTimeout(r, 0));
    expect(opens).toBe(1);
    const second = action(el, 'edit', ROW_B);
    await second;
    releaseFirst();
    await first;
    await settle(el);
    expect(dialog.getAttribute('aria-label')).toBe('ui.editingPackageTitle — Bono color');
    expect(el.editingId).toBe('p2');
    expect(
      el.shadowRoot.querySelector('[data-testid="services-packages-editing"]'),
      'the header carries «Bono color»: a stale check against the first title must not repaint the line',
    ).toBeNull();
  });
});
