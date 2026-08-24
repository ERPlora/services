// The voucher as a TENDER on the checkout line (services#70, ADR-0386).
//
// The screen this component IS: the cashier is charging a line, the customer has vouchers that
// cover it, and before a single session is spent the till must say WHICH voucher, WHICH line, and
// HOW MANY SESSIONS ARE LEFT AFTERWARDS. That preview is the whole point — Mindbody has a support
// article dedicated to «why was the wrong pass activated», and Vagaro buries its precedence rule
// in the small print. Here the rule is on the screen: the default is marked, the reason is written
// out, and if there was more than one candidate the operator is TOLD there was a choice.
//
// And it is undoable, but only while the sale is not paid: `release_hold` reverses it, and once
// the sale settles the runtime refuses (`services.hold_not_releasable`) — which the component
// surfaces as a message, never as a silent no-op.
import { beforeEach, describe, expect, it } from 'vitest';
// The refusal a cashier reads is the module's OWN translated sentence, not the server's insides
// (`ui/lib/domain-error.ts`). Asserting against the catalogue is what keeps the two in step: a
// code shipped without its wording fails here instead of reaching a salon as a raw gate error.
import esLocale from '../../../locales/es.json';
const ERRORS = (esLocale as { errors: Record<string, string> }).errors;

const CUTS = {
  // services#73: what the till spends is a GRANT — the customer's purchase — and the row carries
  // both ids. Two purchases of the same voucher differ only in `grant_id`, which is exactly why
  // the selection and the command key on it.
  grant_id: 'g-cuts',
  package_id: 'p-cuts',
  package_name: 'Bono 5 cortes',
  max_uses: 5,
  used: 1,
  remaining_before: 4,
  remaining_after: 3,
  is_unlimited: 0,
  validity_days: 90,
  first_redeemed_at: '2026-06-01T10:00:00Z',
  expires_at: '2026-08-30T10:00:00Z',
  candidate_count: 2,
  is_default: 1,
  default_reason: 'expires_first',
};
const GIFT = {
  ...CUTS,
  grant_id: 'g-gift',
  package_id: 'p-gift',
  package_name: 'Bono regalo',
  remaining_before: 2,
  remaining_after: 1,
  expires_at: null,
  validity_days: null,
  is_default: 0,
  default_reason: '',
};

const commands: { name: string; payload: Record<string, unknown> }[] = [];
let options: unknown[] = [];
let sdk: Record<string, unknown>;
let nextCommandError: Error | null = null;

beforeEach(() => {
  commands.length = 0;
  options = [CUTS, GIFT];
  nextCommandError = null;
  sdk = {
    query: async (name: string) =>
      name === 'services.packages.tender_options' ? options : [],
    queryAll: async () => [],
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (nextCommandError) throw nextCommandError;
      return { redemption_id: 'red-1', remaining_after: 3, package_name: 'Bono 5 cortes' };
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  customerId: string;
  serviceId: string;
  checkoutRef: string;
  lineRef: string;
  options: (typeof CUTS)[];
  selectedId: string;
  held: { redemption_id: string; package_name: string; remaining_after: number } | null;
  feedback: string;
  loading: boolean;
  confirm(): Promise<void>;
  undo(): Promise<void>;
  select(packageId: string): void;
};

async function mount(props: Partial<Mounted> = {}): Promise<Mounted> {
  await import('./erp-services-voucher-tender');
  const el = document.createElement('erp-services-voucher-tender') as unknown as Mounted;
  el.customerId = 'cus-1';
  el.serviceId = 'svc-1';
  el.checkoutRef = 'order-7';
  el.lineRef = 'line-1';
  Object.assign(el, props);
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
const text = (el: Mounted) => el.shadowRoot.textContent ?? '';

describe('the preview: which voucher, which line, and how many sessions are left AFTER', () => {
  it('asks only for the vouchers that cover THIS line', async () => {
    let asked: Record<string, unknown> | undefined;
    sdk.query = async (name: string, params: Record<string, unknown>) => {
      asked = { name, ...params };
      return options;
    };
    await mount();
    expect(asked).toMatchObject({
      name: 'services.packages.tender_options',
      customer_id: 'cus-1',
      service_id: 'svc-1',
    });
  });

  it('shows the sessions left BEFORE and AFTER, not a green tick', async () => {
    const el = await mount();
    expect(text(el)).toContain('ui.tender.remainingAfter:{"before":4,"after":3}');
  });

  it('the default is preselected and its reason is written out, not implied', async () => {
    const el = await mount();
    expect(el.selectedId).toBe('g-cuts');
    expect(text(el)).toContain('ui.tender.reason.expires_first');
  });

  it('with more than one candidate it SAYS there was a choice', async () => {
    const el = await mount();
    expect(text(el)).toContain('ui.tender.candidates:{"count":2}');
  });

  it('with a single candidate it does not pretend there was one', async () => {
    options = [{ ...CUTS, candidate_count: 1, default_reason: 'only_option' }];
    const el = await mount();
    expect(text(el)).not.toContain('ui.tender.candidates');
  });

  it('an unlimited voucher does not invent a countdown', async () => {
    options = [{ ...CUTS, max_uses: null, is_unlimited: 1, remaining_before: null, remaining_after: null }];
    const el = await mount();
    expect(text(el)).toContain('ui.tender.unlimited');
    expect(text(el)).not.toContain('ui.tender.remainingAfter');
  });

  it('no eligible voucher: it says so instead of showing an empty box', async () => {
    options = [];
    const el = await mount();
    expect(text(el)).toContain('ui.tender.none');
    expect(el.shadowRoot.querySelector('[data-test="confirm"]')).toBeFalsy();
  });
});

describe('the operator can override the tie-break — the rule is a default, not a cage', () => {
  it('picking the other voucher is what gets held', async () => {
    const el = await mount();
    el.select('g-gift');
    await settle(el);
    await el.confirm();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      name: 'services.packages.hold_for_line',
      payload: {
        grant_id: 'g-gift',
        customer_id: 'cus-1',
        service_id: 'svc-1',
        checkout_ref: 'order-7',
        line_ref: 'line-1',
      },
    });
  });
});

describe('the hold is explicit, and undoable while the sale is not paid', () => {
  it('nothing is spent until the operator confirms', async () => {
    await mount();
    expect(commands).toHaveLength(0);
  });

  it('after confirming, the till shows what was spent and offers to undo it', async () => {
    const el = await mount();
    await el.confirm();
    await settle(el);
    expect(el.held?.redemption_id).toBe('red-1');
    expect(el.shadowRoot.querySelector('[data-test="undo"]')).toBeTruthy();
    expect(el.shadowRoot.querySelector('[data-test="confirm"]')).toBeFalsy();
  });

  it('undo releases THAT redemption and puts the choice back on screen', async () => {
    const el = await mount();
    await el.confirm();
    await settle(el);
    await el.undo();
    await settle(el);
    expect(commands[1]).toMatchObject({
      name: 'services.packages.release_hold',
      payload: { redemption_id: 'red-1' },
    });
    expect(el.held).toBeNull();
    expect(el.shadowRoot.querySelector('[data-test="confirm"]')).toBeTruthy();
  });

  it('a refused undo is SHOWN, never swallowed — the session stays spent', async () => {
    const el = await mount();
    await el.confirm();
    await settle(el);
    nextCommandError = Object.assign(new Error('refused'), {
      code: 'services.hold_not_releasable',
    });
    await el.undo();
    await settle(el);
    expect(el.held?.redemption_id).toBe('red-1');
    expect(ERRORS['services.hold_not_releasable']).toBeTruthy();
    expect(text(el)).toContain(ERRORS['services.hold_not_releasable']);
  });

  it('a refused hold is shown with its business reason, not a raw gate error', async () => {
    const el = await mount();
    nextCommandError = Object.assign(new Error('refused'), {
      code: 'services.package_no_uses_left',
    });
    await el.confirm();
    await settle(el);
    expect(el.held).toBeNull();
    expect(ERRORS['services.package_no_uses_left']).toBeTruthy();
    expect(text(el)).toContain(ERRORS['services.package_no_uses_left']);
  });
});

describe('permissions and the loading state', () => {
  it('without services.hold_package there is nothing to confirm', async () => {
    sdk.hasPermission = (p: string) => p === 'services.view_package_balance';
    const el = await mount();
    expect(el.shadowRoot.querySelector('[data-test="confirm"]')).toBeFalsy();
  });

  it('a failing read says so instead of rendering an empty list as «no vouchers»', async () => {
    sdk.query = async () => {
      throw new Error('boom');
    };
    const el = await mount();
    expect(text(el)).toContain('ui.tender.loadFailed');
    expect(text(el)).not.toContain('ui.tender.none');
  });
});
