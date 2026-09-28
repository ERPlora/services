// services#121 — the voucher sheets name PEOPLE, not ids.
//
// «Vouchers sold», its void confirmation and «Movements» used to paint the customer's opaque id
// («Customer: 3f9c…») and the id of the employee who voided or gave back a session. A receptionist
// who wants to void the voucher sold by mistake to «Ana López» could not tell which row was hers.
//
// Names are resolved through the doors the catalogue already uses, never a new contract:
//   * the customer through `customers.get`, asked through the OPTIONAL door (`queryOptional`,
//     ADR-0127) because `services` does not depend on `customers`;
//   * the employee through `hub.users.list`, the core's reserved namespace (same door as
//     `kitchen`, `sales` and `appointments`).
// When a name cannot be had — `customers` not installed, no permission, the sheet deleted, the
// query failing — the id stays as the fallback and the sheet keeps working. And a name is only
// ever painted for the id it was asked for: a row answered for ANOTHER id (another hub's customer
// included) is never taken as this customer's name.
import { beforeEach, describe, expect, it } from 'vitest';

const PACKAGE = {
  id: 'p1',
  name: 'Bono 5 cortes',
  slug: 'bono-5-cortes',
  discount_type: 'percentage',
  discount_percent_bp: 1000,
  discount_amount_cents: 0,
  fixed_price: null,
  is_active: 1,
  items: 1,
};

const LIVE = {
  grant_id: 'g-live',
  package_id: 'p1',
  customer_id: 'cus-ana',
  granted_at: '2026-09-20T10:00:00Z',
  source: 'sale',
  sale_id: null,
  amount_cents: 12000,
  max_uses: 5,
  used: 0,
  remaining: 5,
  expires_at: null,
  status: 'active',
  voided_at: null,
  voided_by: null,
  void_reason: '',
  can_void: 1,
};

const VOIDED = {
  ...LIVE,
  grant_id: 'g-void',
  customer_id: 'cus-luis',
  status: 'voided',
  voided_at: '2026-09-21T09:00:00Z',
  voided_by: 'u-marta',
  void_reason: 'sold twice',
  can_void: 0,
};

const REFUNDED = {
  redemption_id: 'r1',
  customer_id: 'cus-ana',
  service_name: 'Corte',
  use_index: 1,
  redeemed_at: '2026-09-22T10:00:00Z',
  settled_at: '2026-09-22T10:30:00Z',
  sale_id: null,
  refunded_at: '2026-09-23T10:00:00Z',
  refunded_by: 'u-marta',
  refund_ref: 'R-1',
  refund_note: '',
  refund_expired: 0,
  release_reason: '',
  movement: 'refunded',
};

type Customers = Record<string, unknown>;
let customers: (params: Record<string, unknown>) => Promise<unknown>;
let users: () => Promise<unknown>;
let optionalAbsent = false;
let denied: string[] = [];
const askedCustomers: Record<string, unknown>[] = [];
let grantsRows: unknown[];
let movementRows: unknown[];

const DIRECTORY: Record<string, Customers> = {
  'cus-ana': { id: 'cus-ana', name: 'Ana López' },
  'cus-luis': { id: 'cus-luis', name: 'Luis Pardo' },
};

beforeEach(() => {
  askedCustomers.length = 0;
  optionalAbsent = false;
  denied = [];
  grantsRows = [LIVE, VOIDED];
  movementRows = [REFUNDED];
  customers = async (params) => {
    const row = DIRECTORY[String(params.customer_id)];
    return row ? [row] : [];
  };
  users = async () => [
    { id: 'u-marta', name: 'Marta Ruiz', role: 'manager', is_active: true },
    { id: 'u-other', name: 'Otro', role: 'cashier', is_active: true },
  ];
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      if (name === 'hub.users.list') return users();
      return [];
    },
    queryOptional: async (name: string, params?: Record<string, unknown>) => {
      if (name !== 'customers.get') return undefined;
      askedCustomers.push(params ?? {});
      if (optionalAbsent) return undefined;
      return customers(params ?? {});
    },
    queryPage: async (name: string) => {
      if (name === 'services.packages.grants') return { rows: grantsRows, total: grantsRows.length };
      if (name === 'services.packages.redemption_history') return { rows: movementRows, total: movementRows.length };
      return { rows: [PACKAGE], total: 1 };
    },
    queryAll: async () => [],
    command: async () => ({}),
    on: () => () => {},
    hasPermission: (p: string) => !denied.includes(p),
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
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  askVoid(grant: Record<string, unknown>): void;
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
  for (let i = 0; i < 4; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
  }
};

async function openSheet(el: Mounted, actionId: 'grants' | 'movements'): Promise<string> {
  await el.onRowAction(new CustomEvent('rowAction', { detail: { actionId, row: PACKAGE } }));
  await settle(el);
  return el.shadowRoot.textContent ?? '';
}

describe('«Vouchers sold» names the customer and the employee who voided', () => {
  it('paints the customer name instead of the id', async () => {
    const text = await openSheet(await mount(), 'grants');
    expect(text).toContain('Ana López');
    expect(text).toContain('Luis Pardo');
    expect(text).not.toContain('cus-ana');
  });

  it('asks customers.get once per distinct customer, by its id', async () => {
    grantsRows = [LIVE, { ...LIVE, grant_id: 'g-live-2' }, VOIDED];
    await openSheet(await mount(), 'grants');
    expect(askedCustomers).toEqual([{ customer_id: 'cus-ana' }, { customer_id: 'cus-luis' }]);
  });

  it('does not ask again for a customer already named on an earlier page', async () => {
    let pages = 0;
    const g = globalThis as { erplora: { queryPage: (name: string) => Promise<unknown> } };
    const base = g.erplora.queryPage;
    g.erplora.queryPage = async (name: string) => {
      if (name !== 'services.packages.grants') return base(name);
      pages += 1;
      return pages === 1
        ? { rows: [LIVE], total: 2 }
        : { rows: [{ ...LIVE, grant_id: 'g-live-2' }], total: 2 };
    };
    const el = (await mount()) as Mounted & { loadMoreGrants(): Promise<void> };
    await openSheet(el, 'grants');
    await el.loadMoreGrants();
    await settle(el);
    expect(pages).toBe(2);
    expect(askedCustomers).toEqual([{ customer_id: 'cus-ana' }]);
  });

  it('reads the names again when the sheet is opened again (a rename is not kept)', async () => {
    const el = await mount();
    await openSheet(el, 'grants');
    DIRECTORY['cus-ana'] = { id: 'cus-ana', name: 'Ana López García' };
    try {
      const text = await openSheet(el, 'grants');
      expect(text).toContain('Ana López García');
    } finally {
      DIRECTORY['cus-ana'] = { id: 'cus-ana', name: 'Ana López' };
    }
  });

  it('names who voided the sale, not their user id', async () => {
    const text = await openSheet(await mount(), 'grants');
    expect(text).toContain('"who":"Marta Ruiz"');
    expect(text).not.toContain('u-marta');
  });

  it('names the customer in the void confirmation', async () => {
    const el = await mount();
    await openSheet(el, 'grants');
    el.askVoid(LIVE);
    await settle(el);
    expect(el.shadowRoot.textContent ?? '').toContain('"customer":"Ana López"');
  });

  it('says the name is loading while it is on its way, then paints it', async () => {
    let release: (v: unknown) => void = () => {};
    customers = () => new Promise((r) => (release = r));
    grantsRows = [LIVE];
    const el = await mount();
    const text = await openSheet(el, 'grants');
    expect(text).toContain('ui.nameLoading');
    expect(text).not.toContain('Ana López');
    release([DIRECTORY['cus-ana']]);
    await settle(el);
    expect(el.shadowRoot.textContent ?? '').toContain('Ana López');
    expect(el.shadowRoot.textContent ?? '').not.toContain('ui.nameLoading');
  });
});

describe('when a name cannot be had, the id stays and the sheet keeps working', () => {
  it('customers is not installed in this hub', async () => {
    optionalAbsent = true;
    const text = await openSheet(await mount(), 'grants');
    expect(text).toContain('cus-ana');
    expect(text).not.toContain('ui.nameLoading');
  });

  it('the person may not see customers: it does not even ask', async () => {
    denied = ['customers.view_customer'];
    const text = await openSheet(await mount(), 'grants');
    expect(askedCustomers).toEqual([]);
    expect(text).toContain('cus-ana');
  });

  it('the customer query fails', async () => {
    customers = async () => {
      throw new Error('forbidden');
    };
    const text = await openSheet(await mount(), 'grants');
    expect(text).toContain('cus-ana');
    expect(text).not.toContain('ui.nameLoading');
  });

  it('the customer sheet no longer exists (empty answer)', async () => {
    customers = async () => [];
    const text = await openSheet(await mount(), 'grants');
    expect(text).toContain('cus-ana');
  });

  it('the people list fails: the voided-by keeps the id', async () => {
    users = async () => {
      throw new Error('forbidden');
    };
    const text = await openSheet(await mount(), 'grants');
    expect(text).toContain('"who":"u-marta"');
    expect(text).toContain('Ana López');
  });
});

describe('tenancy: a name is only painted for the id it was asked for', () => {
  it('ignores a row answered for ANOTHER customer id (e.g. another hub)', async () => {
    customers = async () => [{ id: 'cus-foreign', name: 'Cliente de otro hub' }];
    const text = await openSheet(await mount(), 'grants');
    expect(text).not.toContain('Cliente de otro hub');
    expect(text).toContain('cus-ana');
  });

  it('ignores a person of the list that is not the one who voided', async () => {
    users = async () => [{ id: 'u-other', name: 'Otro' }];
    const text = await openSheet(await mount(), 'grants');
    expect(text).toContain('"who":"u-marta"');
    expect(text).not.toContain('"who":"Otro"');
  });
});

describe('«Movements» names the customer and who gave the session back', () => {
  it('paints names instead of ids', async () => {
    const text = await openSheet(await mount(), 'movements');
    expect(text).toContain('Ana López');
    expect(text).toContain('"who":"Marta Ruiz"');
    expect(text).not.toContain('cus-ana');
    expect(text).not.toContain('u-marta');
  });

  it('reads the names again when the ledger is opened again', async () => {
    const el = await mount();
    await openSheet(el, 'movements');
    DIRECTORY['cus-ana'] = { id: 'cus-ana', name: 'Ana López García' };
    try {
      const text = await openSheet(el, 'movements');
      expect(text).toContain('Ana López García');
    } finally {
      DIRECTORY['cus-ana'] = { id: 'cus-ana', name: 'Ana López' };
    }
  });
});
