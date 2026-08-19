// Seeing and REACTIVATING an archived service (services#44) — the scope, the action and its RBAC.
//
// Since services#2 the screen archives, but an archived service was gone for good from the UI:
// `queries/services_list.sql` filters `is_active = 1` (and `is_deleted = 0`) because `appointments`
// consumes that very query as its selector of bookable services. So the archived ones cannot simply
// be let into the default answer.
//
// The market solved this the same way everywhere (Square, Fresha, Vagaro, Treatwell, Odoo, Shopify,
// Lightspeed, Toast, Mindbody, Booksy — 10/10): **the list never shows archived items by default**,
// a STATUS filter brings them in, and the way back is an action on the row (Square: `Unarchive`;
// Fresha/Treatwell: the row's `⋯`), never a trip into the record. What this file pins:
//
//   1. the status filter offers «archived» (`inactive`) — until now it offered two of the three
//      words of the vocabulary, because the third could never come back;
//   2. picking it switches the SCOPE (`include_archived`), not just the filter — otherwise the
//      server keeps answering with the live ones and the filter shows an empty table;
//   3. in that scope the row offers `restore` (and not `archive`), gated by
//      `services.change_service`;
//   4. tapping it runs `services.services.restore` with the id, straight away (restoring is not
//      destructive: the market does not ask for a confirmation, and every tap counts at the desk);
//   5. clearing the filter puts the scope back — the diary's selector is never left widened.
import { beforeEach, describe, expect, it } from 'vitest';

const ARCHIVED = { id: 's1', name: 'Corte', price: '1200', pricing_type: 'fixed', duration_minutes: 30, is_bookable: 1, category_id: null, category: null, tax_category_key: 'standard', status: 'inactive' };

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
      return { rows: [ARCHIVED], total: 1 };
    },
    queryAll: async () => [],
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  columns: { key: string; options?: { value: string }[] }[];
  onFilterChange(col: string, value: unknown): void;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
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

const showArchived = async (el: Mounted) => {
  el.onFilterChange('status', 'inactive');
  await settle(el);
};

describe('the archived ones are reachable, and only on purpose', () => {
  it('the status filter offers the three words of the vocabulary', async () => {
    const el = await mount();
    const status = el.columns.find((c) => c.key === 'status');
    expect(status?.options?.map((o) => o.value)).toEqual(['active', 'unconfigured', 'inactive']);
  });

  it('the first load does NOT widen the scope (the diary consumes this query)', async () => {
    await mount();
    expect(pages[0]?.name).toBe('services.services.list');
    expect(pages[0]?.params.params ?? {}, 'the default answer must stay the live services').toEqual({});
  });

  it('picking «archived» switches the scope, not just the filter', async () => {
    const el = await mount();
    await showArchived(el);
    const last = pages[pages.length - 1];
    expect(last.params.params).toEqual({ include_archived: 1 });
    expect((last.params.filters as Record<string, unknown>).status).toBe('inactive');
  });

  it('clearing the filter puts the scope back', async () => {
    const el = await mount();
    await showArchived(el);
    el.onFilterChange('status', '');
    await settle(el);
    expect(pages[pages.length - 1].params.params ?? {}).toEqual({});
  });

  it('one filter change is ONE request (no double load)', async () => {
    const el = await mount();
    const before = pages.length;
    await showArchived(el);
    expect(pages.length - before).toBe(1);
  });
});

describe('restoring is a row action of the archived view', () => {
  it('offers `restore` instead of `archive` while the archived ones are shown', async () => {
    const el = await mount();
    expect(el.actions.map((a) => a.id)).toContain('archive');
    await showArchived(el);
    const ids = el.actions.map((a) => a.id);
    expect(ids).toContain('restore');
    expect(ids, 'archiving something already archived is not an offer').not.toContain('archive');
  });

  it('hides it from who cannot change the catalogue', async () => {
    sdk.hasPermission = (p: string) => p !== 'services.change_service';
    const el = await mount();
    await showArchived(el);
    expect(el.actions.map((a) => a.id)).not.toContain('restore');
  });

  it('runs services.services.restore with the id, with no confirmation in between', async () => {
    const el = await mount();
    await showArchived(el);
    await el.onRowAction(new CustomEvent('rowAction', { detail: { actionId: 'restore', row: ARCHIVED } }));
    await settle(el);
    expect(commands).toEqual([{ name: 'services.services.restore', payload: { service_id: 's1' } }]);
  });

  it('does nothing without the permission, even if the event is forged', async () => {
    sdk.hasPermission = () => false;
    const el = await mount();
    await showArchived(el);
    await el.onRowAction(new CustomEvent('rowAction', { detail: { actionId: 'restore', row: ARCHIVED } }));
    await settle(el);
    expect(commands).toEqual([]);
  });
});
