// services#118 — a SOLD voucher can take one more session or a later expiry as a courtesy.
//
// «One more session on the house», «we were closed for a month, so it expires a month later»: the
// market (Fresha, Mindbody, Square) does it from the voucher the customer holds, with a reason. The
// sheet of vouchers sold grows an «Adjust» button on each live sale; it opens a small form in the
// same sheet — sessions to add (only on a voucher with a session limit), days to add (only on one
// that expires), a mandatory reason and a preview of what the customer will have. The command
// re-checks everything on the server; what is asserted here is what breaks silently on a screen:
// who sees the button, that a courtesy without a reason or without anything to add cannot be sent,
// what travels, that the list is read again, that a refusal stays where the person is looking, and
// that the voucher's movements show the gift with who and why.
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

const LIVE = {
  grant_id: 'g-live',
  package_id: 'p1',
  customer_id: 'cus-1',
  granted_at: '2026-09-01T10:00:00Z',
  source: 'sale',
  sale_id: 'sale-9',
  amount_cents: 12000,
  max_uses: 5,
  used: 2,
  remaining: 3,
  expires_at: '2026-12-01T10:00:00Z',
  status: 'active',
  voided_at: null,
  voided_by: null,
  void_reason: '',
  can_void: 0,
  adjusted_uses: 0,
  adjusted_days: 0,
  can_adjust: 1,
};

const GIFTED = { ...LIVE, grant_id: 'g-gift', customer_id: 'cus-2', max_uses: 6, remaining: 4, adjusted_uses: 1, adjusted_days: 30 };
const UNLIMITED = { ...LIVE, grant_id: 'g-unl', customer_id: 'cus-3', max_uses: null, remaining: null };
const FOREVER = { ...LIVE, grant_id: 'g-fvr', customer_id: 'cus-4', expires_at: null };
const VOIDED = { ...LIVE, grant_id: 'g-void', customer_id: 'cus-5', status: 'voided', voided_at: '2026-09-21T09:00:00Z', can_adjust: 0 };

const ADJUSTED_MOVEMENT = {
  redemption_id: 'adj-1',
  grant_id: 'g-gift',
  customer_id: 'cus-2',
  service_name: null,
  use_index: null,
  redeemed_at: '2026-09-25T10:00:00Z',
  settled_at: null,
  sale_id: null,
  refunded_at: null,
  refunded_by: null,
  refund_ref: null,
  refund_note: '',
  refund_expired: 0,
  release_reason: '',
  created_by: 'u-manager',
  uses_delta: 1,
  days_delta: 30,
  adjust_reason: 'we were closed',
  movement: 'adjusted',
};

const asked: { name: string; params: Record<string, unknown> }[] = [];
const sent: { name: string; payload: Record<string, unknown> }[] = [];
let answer: (params: Record<string, unknown>) => Promise<{ rows: unknown[]; total: number }>;
let reply: (payload: Record<string, unknown>) => Promise<unknown>;
let denied: string[] = [];
let usersAsked = 0;

const page = (rows: unknown[], total = rows.length) => async () => ({ rows, total });

beforeEach(() => {
  asked.length = 0;
  sent.length = 0;
  denied = [];
  usersAsked = 0;
  answer = page([LIVE, GIFTED, UNLIMITED, FOREVER, VOIDED]);
  reply = async () => ({ adjusted: true });
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      if (name === 'hub.users.list') {
        usersAsked += 1;
        return [{ id: 'u-other', name: 'Ana' }, { id: 'u-manager', name: 'Marta' }];
      }
      return [];
    },
    queryPage: async (name: string, params?: Record<string, unknown>) => {
      if (name === 'services.packages.grants') {
        asked.push({ name, params: params ?? {} });
        return answer(params ?? {});
      }
      if (name === 'services.packages.redemption_history') {
        return { rows: [ADJUSTED_MOVEMENT], total: 1 };
      }
      return { rows: ROWS, total: 1 };
    },
    queryAll: async () => [],
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
  grants: Record<string, unknown>[];
  adjustTarget: Record<string, unknown> | null;
  adjustUses: string;
  adjustDays: string;
  adjustReason: string;
  adjustError: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  askAdjust(grant: Record<string, unknown>): void;
  confirmAdjust(): Promise<void>;
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

const open = (el: Mounted, actionId = 'grants') =>
  el.onRowAction(new CustomEvent('rowAction', { detail: { actionId, row: ROWS[0] } }));

const hook = (el: Mounted, id: string) => el.shadowRoot.querySelector(`[data-testid="${id}"]`);

const settle = async (el: Mounted) => {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
};

describe('the sold voucher shows what it is worth now, and what was given', () => {
  it('paints the expiry of a voucher that expires', async () => {
    const el = await mount();
    await open(el);
    await el.updateComplete;
    const text = el.shadowRoot.textContent ?? '';
    expect(text).toContain('ui.grantExpires');
    expect(text).toContain('ui.grantNoExpiry');
  });

  it('says how many sessions and days were given on top of the purchase', async () => {
    const el = await mount();
    await open(el);
    await el.updateComplete;
    const text = el.shadowRoot.textContent ?? '';
    expect(text).toContain('ui.grantAdjusted:{"uses":1,"days":30}');
    // Only the gifted sale says so.
    expect(text.split('ui.grantAdjusted').length - 1).toBe(1);
  });
});

describe('adjusting a sold voucher', () => {
  it('offers «Adjust» on a live sale that has something to move, and only to who may adjust', async () => {
    const el = await mount();
    await open(el);
    await el.updateComplete;
    expect(hook(el, 'services-packages-grant-adjust-g-live')).not.toBeNull();
    expect(hook(el, 'services-packages-grant-adjust-g-unl')).not.toBeNull();
    expect(hook(el, 'services-packages-grant-adjust-g-fvr')).not.toBeNull();
    expect(hook(el, 'services-packages-grant-adjust-g-void')).toBeNull();

    denied = ['services.adjust_grant'];
    const other = await mount();
    await open(other);
    await other.updateComplete;
    expect(hook(other, 'services-packages-grant-adjust-g-live')).toBeNull();
  });

  it('asks only for what the voucher can take: no sessions on an unlimited one, no days on one that never expires', async () => {
    const el = await mount();
    await open(el);
    el.askAdjust(LIVE);
    await el.updateComplete;
    expect(hook(el, 'services-packages-grant-adjust-uses')).not.toBeNull();
    expect(hook(el, 'services-packages-grant-adjust-days')).not.toBeNull();
    expect(hook(el, 'services-packages-grant-adjust-reason')).not.toBeNull();

    el.askAdjust(UNLIMITED);
    await el.updateComplete;
    expect(hook(el, 'services-packages-grant-adjust-uses')).toBeNull();
    expect(hook(el, 'services-packages-grant-adjust-days')).not.toBeNull();

    el.askAdjust(FOREVER);
    await el.updateComplete;
    expect(hook(el, 'services-packages-grant-adjust-uses')).not.toBeNull();
    expect(hook(el, 'services-packages-grant-adjust-days')).toBeNull();
  });

  it('cannot be sent without a reason or without something to add', async () => {
    const el = await mount();
    await open(el);
    el.askAdjust(LIVE);
    await el.updateComplete;
    // `?disabled` is an attribute: `ion-button` is not upgraded in happy-dom, so there is no property.
    const submit = hook(el, 'services-packages-grant-adjust-submit') as HTMLElement;
    expect(submit.hasAttribute('disabled')).toBe(true);

    el.adjustUses = '1';
    el.adjustReason = '   ';
    await el.updateComplete;
    expect(submit.hasAttribute('disabled')).toBe(true);
    await el.confirmAdjust();
    expect(sent).toEqual([]);

    el.adjustUses = '0';
    el.adjustDays = '';
    el.adjustReason = 'birthday';
    await el.updateComplete;
    expect(submit.hasAttribute('disabled')).toBe(true);
    await el.confirmAdjust();
    expect(sent).toEqual([]);

    el.adjustUses = '-1';
    await el.updateComplete;
    expect(submit.hasAttribute('disabled')).toBe(true);
    await el.confirmAdjust();
    expect(sent).toEqual([]);

    el.adjustUses = '1';
    await el.updateComplete;
    expect(submit.hasAttribute('disabled')).toBe(false);
  });

  it('previews what the customer will have before anything is sent', async () => {
    const el = await mount();
    await open(el);
    el.askAdjust(LIVE);
    el.adjustUses = '2';
    el.adjustDays = '30';
    await el.updateComplete;
    const preview = hook(el, 'services-packages-grant-adjust-preview')?.textContent ?? '';
    expect(preview).toContain('"remaining":5');
    // 2026-12-01 + 30 days = 2026-12-31, painted in the hub's locale.
    expect(preview).toContain(new Date('2026-12-31T10:00:00Z').toLocaleDateString('es', { dateStyle: 'short' }));
  });

  it('sends whole numbers and the trimmed reason, then reads the list again', async () => {
    const el = await mount();
    await open(el);
    el.askAdjust(LIVE);
    el.adjustUses = '1';
    el.adjustDays = '';
    el.adjustReason = '  birthday  ';
    await el.updateComplete;
    answer = page([{ ...LIVE, max_uses: 6, remaining: 4, adjusted_uses: 1 }]);
    await el.confirmAdjust();
    await el.updateComplete;
    expect(sent).toEqual([
      {
        name: 'services.packages.adjust_grant',
        payload: { grant_id: 'g-live', uses_delta: 1, days_delta: 0, reason: 'birthday' },
      },
    ]);
    expect(el.adjustTarget).toBeNull();
    expect(asked[asked.length - 1].params.offset).toBe(0);
    expect(el.grants[0].remaining).toBe(4);
  });

  it('never sends a half the voucher cannot take, even if it was typed before switching', async () => {
    const el = await mount();
    await open(el);
    el.askAdjust(UNLIMITED);
    el.adjustUses = '3';
    el.adjustDays = '10';
    el.adjustReason = 'closed';
    await el.confirmAdjust();
    expect(sent[0].payload).toEqual({ grant_id: 'g-unl', uses_delta: 0, days_delta: 10, reason: 'closed' });
  });

  it('paints the refusal on the form and keeps it open', async () => {
    reply = async () => {
      throw Object.assign(new Error('That voucher was already voided.'), { code: 'services.grant_already_voided' });
    };
    const el = await mount();
    await open(el);
    el.askAdjust(LIVE);
    el.adjustDays = '15';
    el.adjustReason = 'closed';
    await el.confirmAdjust();
    await el.updateComplete;
    expect(el.adjustTarget?.grant_id).toBe('g-live');
    expect(el.adjustError).toBe('Ese bono ya estaba anulado.');
    expect(hook(el, 'services-packages-grant-adjust-error')).not.toBeNull();
  });

  it('does nothing for someone without the permission, even if called', async () => {
    denied = ['services.adjust_grant'];
    const el = await mount();
    await open(el);
    el.askAdjust(LIVE);
    el.adjustUses = '1';
    el.adjustReason = 'gift';
    await el.confirmAdjust();
    expect(sent).toEqual([]);
  });

  it('cancelling leaves the sale untouched and the list back', async () => {
    const el = await mount();
    await open(el);
    el.askAdjust(LIVE);
    el.adjustUses = '1';
    el.adjustReason = 'gift';
    await el.updateComplete;
    (hook(el, 'services-packages-grant-adjust-cancel') as HTMLElement).click();
    await el.updateComplete;
    expect(el.adjustTarget).toBeNull();
    expect(sent).toEqual([]);
  });
});

describe('the voucher movements show the courtesy', () => {
  it('paints an adjustment with what was given, by whom and why', async () => {
    const el = await mount();
    await open(el, 'movements');
    await settle(el);
    const text = el.shadowRoot.textContent ?? '';
    expect(text).toContain('ui.movement.adjusted');
    expect(text).toContain('ui.movementAdjusted:{"uses":1,"days":30}');
    expect(text).toContain('Marta');
    expect(text).toContain('we were closed');
    // The person is resolved once per opening, whatever their place in the list.
    expect(usersAsked).toBe(1);
    expect(text).not.toContain('ui.movementNoService');
  });
});
