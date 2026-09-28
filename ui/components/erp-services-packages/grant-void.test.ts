// services#82 — a voucher SOLD by mistake can be voided from the voucher's sheet.
//
// The wrong voucher rung up, the wrong customer picked, the same one sold twice: until now the only
// way out was to leave a phantom balance on the customer forever. The packages screen grows one row
// action that lists the vouchers SOLD of that catalogue voucher — live and voided, a page at a time —
// and, on a sale nothing has been spent from, a «Void» button that asks for a reason before it does
// anything. The command re-checks everything on the server; what is asserted here is what breaks
// silently on a screen: that it asks for the sales OF THE VOUCHER it was opened on and one page at a
// time, that a void without a reason cannot even be sent, that the reason travels trimmed, that the
// list is read again after a void, that a refusal is painted where the person is looking, and that
// the button is not there for someone without the permission or on a sale that was already used.
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

const UNUSED = {
  grant_id: 'g-new',
  package_id: 'p1',
  customer_id: 'cus-1',
  granted_at: '2026-09-20T10:00:00Z',
  source: 'sale',
  sale_id: 'sale-9',
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

const USED = { ...UNUSED, grant_id: 'g-used', customer_id: 'cus-2', used: 2, remaining: 3, can_void: 0 };

const VOIDED = {
  ...UNUSED,
  grant_id: 'g-void',
  customer_id: 'cus-3',
  status: 'voided',
  voided_at: '2026-09-21T09:00:00Z',
  voided_by: 'u-manager',
  void_reason: 'sold twice',
  can_void: 0,
};

const asked: { name: string; params: Record<string, unknown> }[] = [];
const askedAll: string[] = [];
const sent: { name: string; payload: Record<string, unknown> }[] = [];
let answer: (params: Record<string, unknown>) => Promise<{ rows: unknown[]; total: number }>;
let reply: (payload: Record<string, unknown>) => Promise<unknown>;
let denied: string[] = [];

const page = (rows: unknown[], total = rows.length) => async () => ({ rows, total });

beforeEach(() => {
  asked.length = 0;
  askedAll.length = 0;
  sent.length = 0;
  denied = [];
  answer = page([UNUSED, USED, VOIDED]);
  reply = async () => ({ voided: true });
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async (name: string, params?: Record<string, unknown>) => {
      if (name === 'services.packages.grants') {
        asked.push({ name, params: params ?? {} });
        return answer(params ?? {});
      }
      return { rows: ROWS, total: 1 };
    },
    queryAll: async (name: string) => {
      askedAll.push(name);
      return [];
    },
    command: async (name: string, payload?: Record<string, unknown>) => {
      sent.push({ name, payload: payload ?? {} });
      return reply(payload ?? {});
    },
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
  actions: { id: string }[];
  grantsOf: { id: string; name: string } | null;
  grants: Record<string, unknown>[];
  grantsTotal: number;
  grantsLoading: boolean;
  grantsError: string;
  voidTarget: Record<string, unknown> | null;
  voidReason: string;
  voidError: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  loadMoreGrants(): Promise<void>;
  askVoid(grant: Record<string, unknown>): void;
  confirmVoid(): Promise<void>;
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
  el.onRowAction(new CustomEvent('rowAction', { detail: { actionId: 'grants', row: ROWS[0] } }));

const hook = (el: Mounted, id: string) => el.shadowRoot.querySelector(`[data-testid="${id}"]`);

describe('the vouchers sold are one click from the voucher row', () => {
  it('offers the action to anyone who may see a balance', async () => {
    const el = await mount();
    expect(el.actions.map((a) => a.id)).toContain('grants');
  });

  it('hides it from someone who cannot see balances', async () => {
    denied = ['services.view_package_balance'];
    const el = await mount();
    expect(el.actions.map((a) => a.id)).not.toContain('grants');
  });

  it('asks for ONE PAGE of the sales of the voucher it was opened on', async () => {
    const el = await mount();
    await open(el);
    expect(asked[0].params.params).toEqual({ package_id: 'p1' });
    expect(asked[0].params.offset).toBe(0);
    expect(askedAll).not.toContain('services.packages.grants');
    expect(el.grantsOf?.name).toBe('Bono 5 cortes');
  });

  it('paints a voided sale as voided — with who, when and why', async () => {
    const el = await mount();
    await open(el);
    await el.updateComplete;
    const text = el.shadowRoot.textContent ?? '';
    expect(text).toContain('ui.grantStatus.voided');
    expect(text).toContain('ui.grantStatus.active');
    expect(text).toContain('u-manager');
    expect(text).toContain('sold twice');
  });

  it('says so when nobody has bought the voucher yet', async () => {
    answer = page([]);
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(hook(el, 'services-packages-grants-empty')).not.toBeNull();
  });

  it('shows the error instead of an empty list when the query fails', async () => {
    answer = async () => {
      throw new Error('db: connection refused');
    };
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(el.grantsError).toBe('ui.errorGrants');
    expect(hook(el, 'services-packages-grants-error')).not.toBeNull();
    expect(hook(el, 'services-packages-grants-empty')).toBeNull();
  });

  it('is loading before it has an answer, and not after', async () => {
    let release: (p: { rows: unknown[]; total: number }) => void = () => {};
    answer = () => new Promise((r) => (release = r));
    const el = await mount();
    const pending = open(el);
    await el.updateComplete;
    expect(el.grantsLoading).toBe(true);
    expect(hook(el, 'services-packages-grants-loading')).not.toBeNull();
    release({ rows: [UNUSED], total: 1 });
    await pending;
    await el.updateComplete;
    expect(el.grantsLoading).toBe(false);
  });

  it('keeps the sales on screen when it brings the next page', async () => {
    answer = async (params) =>
      Number(params.offset ?? 0) === 0 ? { rows: [UNUSED, USED], total: 3 } : { rows: [VOIDED], total: 3 };
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(hook(el, 'services-packages-grants-more')).not.toBeNull();
    await el.loadMoreGrants();
    await el.updateComplete;
    expect(asked[1].params.offset).toBe(2);
    expect(el.grants.map((g) => g.grant_id)).toEqual(['g-new', 'g-used', 'g-void']);
    expect(hook(el, 'services-packages-grants-more')).toBeNull();
  });
});

describe('voiding a voucher sold by mistake', () => {
  it('offers «Void» only on a sale nothing was spent from, and only to who may void', async () => {
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(hook(el, 'services-packages-grant-void-g-new')).not.toBeNull();
    expect(hook(el, 'services-packages-grant-void-g-used')).toBeNull();
    expect(hook(el, 'services-packages-grant-void-g-void')).toBeNull();

    denied = ['services.void_grant'];
    const other = await mount();
    await open(other);
    await other.updateComplete;
    expect(hook(other, 'services-packages-grant-void-g-new')).toBeNull();
  });

  it('asks for a reason first: without one the void cannot be sent', async () => {
    const el = await mount();
    await open(el);
    el.askVoid(UNUSED);
    await el.updateComplete;
    // `?disabled` is an attribute: `ion-button` is not upgraded in happy-dom, so there is no property.
    const submit = hook(el, 'services-packages-grant-void-submit') as HTMLElement;
    expect(submit).not.toBeNull();
    expect(submit.hasAttribute('disabled')).toBe(true);

    el.voidReason = '   ';
    await el.updateComplete;
    expect(submit.hasAttribute('disabled')).toBe(true);
    await el.confirmVoid();
    expect(sent).toEqual([]);

    el.voidReason = 'wrong customer';
    await el.updateComplete;
    expect(submit.hasAttribute('disabled')).toBe(false);
    expect(sent).toEqual([]);
  });

  it('sends the grant and the trimmed reason, then reads the list again', async () => {
    const el = await mount();
    await open(el);
    el.askVoid(UNUSED);
    el.voidReason = '  wrong customer  ';
    await el.updateComplete;
    answer = page([{ ...UNUSED, status: 'voided', can_void: 0, voided_by: 'u-me', void_reason: 'wrong customer' }, USED, VOIDED]);
    await el.confirmVoid();
    await el.updateComplete;
    expect(sent).toEqual([
      { name: 'services.packages.void_grant', payload: { grant_id: 'g-new', reason: 'wrong customer' } },
    ]);
    expect(el.voidTarget).toBeNull();
    expect(asked[asked.length - 1].params.offset).toBe(0);
    expect(el.grants.map((g) => g.grant_id)).toEqual(['g-new', 'g-used', 'g-void']);
    expect(el.grants[0].status).toBe('voided');
  });

  it('paints the refusal on the confirmation and keeps it open', async () => {
    reply = async () => {
      throw Object.assign(new Error('That voucher was already used: it cannot be voided.'), { code: 'services.grant_in_use' });
    };
    const el = await mount();
    await open(el);
    el.askVoid(UNUSED);
    el.voidReason = 'sold twice';
    await el.confirmVoid();
    await el.updateComplete;
    expect(el.voidTarget?.grant_id).toBe('g-new');
    // The module's own translated sentence for its code, not the server's English.
    expect(el.voidError).toBe('Ese bono ya se ha usado: no se puede anular.');
    expect(hook(el, 'services-packages-grant-void-error')).not.toBeNull();
  });

  it('does nothing for someone without the permission, even if called', async () => {
    denied = ['services.void_grant'];
    const el = await mount();
    await open(el);
    el.askVoid(UNUSED);
    el.voidReason = 'sold twice';
    await el.confirmVoid();
    expect(sent).toEqual([]);
  });

  it('cancelling the confirmation leaves the sale untouched', async () => {
    const el = await mount();
    await open(el);
    el.askVoid(UNUSED);
    el.voidReason = 'sold twice';
    await el.updateComplete;
    (hook(el, 'services-packages-grant-void-cancel') as HTMLElement).click();
    await el.updateComplete;
    expect(el.voidTarget).toBeNull();
    expect(sent).toEqual([]);
  });
});
