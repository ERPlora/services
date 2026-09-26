// Categories screen (services#4): `services.categories.create/update/delete` existed with no UI.
//
// Same pattern as inventory categories (inventory#8) and the rest of the Hub: the CRUD lives in an
// `ok-data-table` — the «+» opens the create panel, the row action «edit» pre-fills the SAME form
// (the submit decides by `editingId`), and «delete» never fires on the first tap: it confirms and
// says how many services are left without a category. Actions follow the permission (`can()`).
import { beforeEach, describe, expect, it } from 'vitest';

const ROWS = [
  { id: 'c1', name: 'Peluquería', slug: 'peluqueria', icon: null, color: null, parent_id: null, sort_order: 0, service_count: 3 },
  { id: 'c2', name: 'Color', slug: 'color', icon: null, color: null, parent_id: 'c1', sort_order: 1, service_count: 1 },
];
const commands: { name: string; payload: Record<string, unknown> }[] = [];
let sdk: Record<string, unknown>;

beforeEach(() => {
  commands.length = 0;
  sdk = {
    query: async () => [],
    queryPage: async () => ({ rows: ROWS, total: ROWS.length }),
    queryAll: async (name: string) => (name === 'services.categories.list' ? ROWS : []),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    t: (_c: unknown, key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  editingId: string | null;
  newName: string;
  newParent: string;
  newSortOrder: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  save(ev: Event): Promise<void>;
  confirmDelete(): Promise<void>;
};

async function mount(): Promise<Mounted> {
  await import('./erp-services-categories');
  const el = document.createElement('erp-services-categories') as unknown as Mounted;
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

describe('the CRUD lives inside the data-table', () => {
  it('the table is addable and the form is projected in its `create` slot', async () => {
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { addable: boolean }) | null;
    expect(table?.addable).toBe(true);
    expect(el.shadowRoot.querySelector('form[slot="create"]')?.closest('ok-data-table')).toBeTruthy();
  });
  it('actions follow the permissions', async () => {
    let el = await mount();
    expect(el.actions.map((a) => a.id)).toEqual(['edit', 'delete']);
    el.remove();
    sdk.hasPermission = (p: string) => p === 'services.view_category';
    el = await mount();
    expect(el.actions).toEqual([]);
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { addable: boolean }) | null;
    expect(table?.addable, 'no «+» without services.add_category').toBe(false);
  });
});

describe('create / edit / delete', () => {
  it('creates with name, parent and sort order', async () => {
    const el = await mount();
    el.newName = 'Estética';
    el.newParent = 'c1';
    el.newSortOrder = '2';
    await el.save(new Event('submit'));
    expect(commands).toEqual([{ name: 'services.categories.create', payload: { name: 'Estética', parent_id: 'c1', sort_order: 2 } }]);
  });

  it('edit pre-fills the form and the submit sends update with the id (partial door)', async () => {
    const el = await mount();
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    expect(el.editingId).toBe('c2');
    expect(el.newName).toBe('Color');
    expect(el.newParent).toBe('c1');
    el.newName = 'Coloración';
    await el.save(new Event('submit'));
    expect(commands.map((c) => c.name)).toEqual(['services.categories.update']);
    expect(commands[0].payload).toEqual({ category_id: 'c2', name: 'Coloración', parent_id: 'c1', sort_order: 1 });
    expect(el.editingId).toBeNull();
  });

  it('a category cannot be its own parent: editing it hides itself from the parent options', async () => {
    const el = await mount();
    await action(el, 'edit', ROWS[0]);
    await settle(el);
    const options = [...el.shadowRoot.querySelectorAll('form[slot="create"] ion-select-option')].map((o) => (o as HTMLElement & { value: string }).value);
    expect(options).not.toContain('c1');
    expect(options).toContain('c2');
  });

  it('delete confirms first, shows the impact, then runs the command', async () => {
    const el = await mount();
    await action(el, 'delete', ROWS[0]);
    await settle(el);
    expect(commands).toEqual([]);
    const modal = el.shadowRoot.querySelector('ion-modal') as (HTMLElement & { isOpen: boolean }) | null;
    expect(modal?.isOpen).toBe(true);
    expect(modal?.textContent).toContain('"count":3');
    await el.confirmDelete();
    expect(commands).toEqual([{ name: 'services.categories.delete', payload: { category_id: 'c1' } }]);
  });

  it('without the permission a forged action does nothing', async () => {
    sdk.hasPermission = () => false;
    const el = await mount();
    await action(el, 'delete', ROWS[0]);
    await el.confirmDelete();
    await action(el, 'edit', ROWS[0]);
    el.newName = 'x';
    await el.save(new Event('submit'));
    expect(commands).toEqual([]);
  });
});

// ── pm#155 (outfitkit#67, second half) ────────────────────────────────────────────────────────
//
// At 1440 px the «Actions» column fell off the screen with nothing hinting the table went on to
// the right, so the only door into a category was a button nobody could see. OutfitKit 0.1.44
// pins that column, but the other half of the fix is opt-in: `rowClickable` turns the whole row
// into a door — the first thing a user tries. The list has to ask for it, and wire `rowClick`
// to the same edit panel the «edit» action opens.
describe('clicking the row opens the category (pm#155)', () => {
  it('the table declares `rowClickable` → the whole row is a door, not just the action button', async () => {
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { rowClickable: boolean }) | null;
    expect(
      table?.rowClickable,
      'without `rowClickable` the row is dead: if the actions column is off-screen there is no way in',
    ).toBe(true);
  });

  it('`rowClick` puts the category in the edit panel, same as the «edit» action', async () => {
    const el = await mount();
    const table = el.shadowRoot.querySelector('ok-data-table') as HTMLElement | null;
    table!.dispatchEvent(new CustomEvent('rowClick', { detail: { row: ROWS[0] } }));
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.editingId, 'the row was clicked and the edit panel did not take the category').toBe('c1');
  });
});

// pm#450 (outfitkit#150): the edit panel said «New» in its header and «Editing category — Color» in
// its body. The screen opens it in «edit» mode with that title and drops the repeated line.
describe('editing titles the panel header, not its body (pm#450)', () => {
  type Table = HTMLElement & { open: (panel?: unknown, opts?: { title?: string }) => void; shadowRoot: ShadowRoot };
  const table = (el: Mounted) => el.shadowRoot.querySelector('ok-data-table') as Table;

  it("opens the panel with open('edit', { title }) — «Editing category — <name>» in the header", async () => {
    const el = await mount();
    const calls: unknown[][] = [];
    table(el).open = (...args: unknown[]) => void calls.push(args);
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    expect(calls).toEqual([['edit', { title: 'ui.editingCategoryTitle — Color' }]]);
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
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    const form = el.shadowRoot.querySelector('form[slot="create"]') as HTMLElement;
    expect(form.querySelector('[data-testid="services-categories-editing"]')).toBeNull();
    expect(form.textContent).not.toContain('ui.editingCategoryTitle');
  });

  it('with a shell whose table ignores the title (OutfitKit < 0.1.94), the body keeps the editing line', async () => {
    const el = await mount();
    shellTable(el, false);
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    const line = el.shadowRoot.querySelector('form[slot="create"] [data-testid="services-categories-editing"]') as HTMLElement | null;
    expect(line, 'the header says «New»: without this line nothing says it is an edit').toBeTruthy();
    expect(line!.textContent).toContain('ui.editingCategoryTitle');
    expect(line!.textContent).toContain('Color');
  });

  it('a later «Add» (clean form) hides the fallback line again', async () => {
    const el = await mount();
    shellTable(el, false);
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    (el as unknown as { cancelEdit(): void }).cancelEdit();
    await settle(el);
    expect(el.shadowRoot.querySelector('form[slot="create"] [data-testid="services-categories-editing"]')).toBeNull();
  });

  it('«Add» after an edit opens a CLEAN create form', async () => {
    const el = await mount();
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    const add = table(el).shadowRoot.querySelector('[data-testid="services-categories-table-add"]') as HTMLElement;
    expect(add, 'the table paints its «Add» button').toBeTruthy();
    add.click();
    await settle(el);
    expect(el.editingId, 'a submit here would UPDATE the edited category under a «New» header').toBeNull();
    expect(el.newName).toBe('');
  });

  it('a click INSIDE the edit form (a field, a row) does not drop the edit — only «Add» does', async () => {
    const el = await mount();
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    (el.shadowRoot.querySelector('[data-testid="services-categories-name"]') as HTMLElement).click();
    table(el).click();
    await settle(el);
    expect(el.editingId, 'the table host hears every click of the projected form').toBe('c2');
  });

  it('«Add» with no edit in progress keeps what was typed', async () => {
    const el = await mount();
    el.newName = 'Estética';
    (table(el).shadowRoot.querySelector('[data-testid="services-categories-table-add"]') as HTMLElement).click();
    await settle(el);
    expect(el.newName).toBe('Estética');
  });
});
