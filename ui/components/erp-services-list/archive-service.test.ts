// Archiving a service (services#2) — the row action, its RBAC, its confirmation and its warning.
//
// `services.services.delete` is a soft-delete + `is_active = 0`: that is ARCHIVING, not deleting,
// and the market (Fresha, Square, Vagaro, Odoo, Business Central) never lets a service with
// upcoming appointments vanish silently — it archives it (no longer offered, history kept, booked
// slots kept with their snapshot) and TELLS the person how many bookings it still has.
//
// What was wrong: the row said «Delete», was shown to every role (manager/employee do not hold
// `services.delete_service`), fired the command on the first tap without confirmation, and knew
// nothing about appointments. This file pins the four things that replace it:
//
//   1. the action is `archive`, and only for who can (`services.delete_service`);
//   2. the tap does NOT run the command: it opens a confirmation;
//   3. the confirmation asks `appointments` for the upcoming appointments of THAT service
//      (`appointments.appointments.count_active_for_service`, public query, through the OPTIONAL
//      door `queryOptional` of ADR-0127) and shows the count;
//   4. confirming runs `services.services.delete`; and when `appointments` is not installed
//      (`queryOptional` → undefined) the confirmation still works and archiving still proceeds —
//      the warning is advisory, never a dependency (services must run without appointments).
import { beforeEach, describe, expect, it } from 'vitest';

const ROW = { id: 's1', name: 'Corte', price: '1200', pricing_type: 'fixed', duration_minutes: 30, is_bookable: 1, category_id: 'c1', category: 'Peluquería', tax_category_key: 'standard', status: 'active' };

const commands: { name: string; payload: Record<string, unknown> }[] = [];
const queries: { name: string; params: Record<string, unknown> | undefined }[] = [];
let sdk: Record<string, unknown>;
let activeCount: number | 'unavailable' = 0;

beforeEach(() => {
  commands.length = 0;
  queries.length = 0;
  activeCount = 0;
  sdk = {
    query: async (name: string, params?: Record<string, unknown>) => {
      queries.push({ name, params });
      return [];
    },
    // The optional door (ADR-0127): `undefined` = the owner module is not installed in this hub.
    queryOptional: async (name: string, params?: Record<string, unknown>) => {
      queries.push({ name, params });
      if (name === 'appointments.appointments.count_active_for_service') {
        if (activeCount === 'unavailable') return undefined;
        return [{ active_count: activeCount, next_start_datetime: '2026-08-20T10:00:00+02:00' }];
      }
      return undefined;
    },
    queryPage: async () => ({ rows: [ROW], total: 1 }),
    queryAll: async () => [],
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  confirmArchive(): Promise<void>;
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

const rowAction = (el: Mounted, actionId: string) =>
  el.onRowAction(new CustomEvent('rowAction', { detail: { actionId, row: ROW } }));

describe('the row action is «archive», gated by services.delete_service', () => {
  it('offers `archive` (not `delete`) to who holds the permission', async () => {
    const el = await mount();
    const ids = el.actions.map((a) => a.id);
    expect(ids).toContain('archive');
    expect(ids, 'the destructive-sounding «delete» is gone: the command archives').not.toContain('delete');
  });

  it('hides the action from who does not hold it (manager/employee)', async () => {
    sdk.hasPermission = (p: string) => p !== 'services.delete_service';
    const el = await mount();
    expect(el.actions.map((a) => a.id)).not.toContain('archive');
  });
});

describe('archiving asks first, and warns about the upcoming appointments', () => {
  it('the tap opens a confirmation instead of running the command', async () => {
    const el = await mount();
    await rowAction(el, 'archive');
    await settle(el);
    expect(commands.map((c) => c.name), 'archived on the first tap, no confirmation').toEqual([]);
    const modal = el.shadowRoot.querySelector('ion-modal') as (HTMLElement & { isOpen: boolean }) | null;
    expect(modal?.isOpen, 'no confirmation open').toBe(true);
  });

  it('the confirmation reads the count from appointments for THAT service and shows it', async () => {
    activeCount = 3;
    const el = await mount();
    await rowAction(el, 'archive');
    await settle(el);
    const read = queries.find((q) => q.name === 'appointments.appointments.count_active_for_service');
    expect(read, 'never asked appointments').toBeTruthy();
    expect(read?.params).toEqual({ service_id: 's1' });
    const modal = el.shadowRoot.querySelector('ion-modal');
    expect(modal?.textContent).toContain('ui.archiveWarnAppointments');
    expect(modal?.textContent, 'the count is not shown').toContain('"count":3');
  });

  it('with no upcoming appointments there is no warning line', async () => {
    activeCount = 0;
    const el = await mount();
    await rowAction(el, 'archive');
    await settle(el);
    const modal = el.shadowRoot.querySelector('ion-modal');
    expect(modal?.textContent).not.toContain('ui.archiveWarnAppointments');
  });

  it('confirming runs services.services.delete with the service id', async () => {
    activeCount = 3;
    const el = await mount();
    await rowAction(el, 'archive');
    await settle(el);
    await el.confirmArchive();
    expect(commands).toEqual([{ name: 'services.services.delete', payload: { service_id: 's1' } }]);
  });

  it('when appointments is not installed the confirmation still works and archiving proceeds', async () => {
    activeCount = 'unavailable';
    const el = await mount();
    await rowAction(el, 'archive');
    await settle(el);
    const modal = el.shadowRoot.querySelector('ion-modal') as (HTMLElement & { isOpen: boolean }) | null;
    expect(modal?.isOpen, 'a missing appointments module must not block archiving').toBe(true);
    expect(modal?.textContent).not.toContain('ui.archiveWarnAppointments');
    await el.confirmArchive();
    expect(commands.map((c) => c.name)).toEqual(['services.services.delete']);
  });

  it('without the permission the tap does nothing, even if forged', async () => {
    sdk.hasPermission = () => false;
    const el = await mount();
    await rowAction(el, 'archive');
    await settle(el);
    await el.confirmArchive();
    expect(commands).toEqual([]);
  });
});
