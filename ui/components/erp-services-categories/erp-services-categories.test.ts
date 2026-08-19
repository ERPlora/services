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
