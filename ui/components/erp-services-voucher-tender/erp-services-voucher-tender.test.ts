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

/** A row of `services.packages.holds_for_checkout` — what the reload finds already spent. */
const HELD_ROW = {
  redemption_id: 'red-9',
  grant_id: 'g-cuts',
  package_id: 'p-cuts',
  package_name: 'Bono 5 cortes',
  customer_id: 'cus-1',
  service_id: 'svc-1',
  service_name: 'Corte',
  checkout_ref: 'order-7',
  line_ref: 'line-1',
  redeemed_at: '2026-08-18T10:00:00Z',
  hold_expires_at: '2026-08-19T10:00:00Z',
  note: '',
  max_uses: 5,
  is_unlimited: 0,
  remaining_after: 2,
  expires_at: '2026-08-30T10:00:00Z',
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
    // `services.packages.holds_for_checkout` falls through to `[]` above: nothing held yet, which
    // is the state every test written before services#77 assumes.
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
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).toBeFalsy();
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
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-undo"]')).toBeTruthy();
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).toBeFalsy();
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
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).toBeTruthy();
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
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).toBeFalsy();
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

// ── services#77 · the reload ────────────────────────────────────────────────
//
// The bug this closes, in the cashier's words: she taps «pay with voucher», the session is spent
// there and then, and the tablet reloads before she can charge. The component came back from zero
// — `held` is component state — so it offered the voucher again, and there was NO WAY OUT: charging
// billed the full price (the host does not know the line is covered), redeeming again hit
// `uq_services_redemption_line`, and undoing needed a `redemption_id` the reload had taken with it.
//
// The fix is a READ, not a memory: `services.packages.holds_for_checkout` enumerates what this
// checkout already holds, and the four props the host re-emits on every mount are enough to ask.
describe('services#77 · a taken session survives the screen reloading', () => {
  it('asks what this checkout already holds, with the ref the host re-emits', async () => {
    const asked: Record<string, unknown>[] = [];
    sdk.query = async (name: string, params: Record<string, unknown>) => {
      asked.push({ name, ...params });
      return name === 'services.packages.holds_for_checkout' ? [] : options;
    };
    await mount();
    expect(asked).toContainEqual({
      name: 'services.packages.holds_for_checkout',
      checkout_ref: 'order-7',
    });
  });

  it('comes back as HELD — with the voucher, the counter and its undo', async () => {
    sdk.query = async (name: string) =>
      name === 'services.packages.holds_for_checkout' ? [HELD_ROW] : options;
    const el = await mount();
    // Not the chooser: the session is already spent, and offering it again is what charged the
    // customer twice.
    expect(el.held).toMatchObject({ redemption_id: 'red-9', package_name: 'Bono 5 cortes' });
    expect(text(el)).toContain('ui.tender.held:{"name":"Bono 5 cortes","after":2}');
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-undo"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).toBeNull();
  });

  it('the recovered id is what the undo releases, and the chooser comes back', async () => {
    // The stub RELEASES for real: once `release_hold` succeeds the server no longer lists that
    // hold. A mock that kept answering «still held» would have the component re-recover its own
    // undo and would hide the round trip this test exists to prove — the id came from the server,
    // went back to the server, and the screen re-read the answer rather than trusting itself.
    let stillHeld = true;
    sdk.query = async (name: string) =>
      name === 'services.packages.holds_for_checkout' ? (stillHeld ? [HELD_ROW] : []) : options;
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'services.packages.release_hold') stillHeld = false;
      return {};
    };
    const el = await mount();
    expect(el.held?.redemption_id).toBe('red-9');
    await el.undo();
    await settle(el);
    expect(commands).toContainEqual({
      name: 'services.packages.release_hold',
      payload: { redemption_id: 'red-9' },
    });
    expect(el.held).toBeNull();
    // …and the cashier can spend a voucher on this line again, which is the point of undoing.
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).not.toBeNull();
  });

  it('only the hold of THIS line comes back — a checkout covers several', async () => {
    sdk.query = async (name: string) =>
      name === 'services.packages.holds_for_checkout'
        ? [{ ...HELD_ROW, redemption_id: 'red-other', line_ref: 'line-9' }, HELD_ROW]
        : options;
    const el = await mount();
    expect(el.held?.redemption_id).toBe('red-9');
  });

  it('a hold on another line does NOT hijack this slot', async () => {
    sdk.query = async (name: string) =>
      name === 'services.packages.holds_for_checkout'
        ? [{ ...HELD_ROW, redemption_id: 'red-other', line_ref: 'line-9' }]
        : options;
    const el = await mount();
    expect(el.held).toBeNull();
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).not.toBeNull();
  });

  it('nothing held: the chooser, exactly as before', async () => {
    sdk.query = async (name: string) =>
      name === 'services.packages.holds_for_checkout' ? [] : options;
    const el = await mount();
    expect(el.held).toBeNull();
    expect(text(el)).toContain('ui.tender.remainingAfter:{"before":4,"after":3}');
  });

  it('🔴 a FAILED recovery never renders the chooser — it would spend a second session', async () => {
    // The dangerous direction is not «no vouchers», it is «offer it again». If this read is the
    // one that failed, the component cannot know whether a session is already spent on this line,
    // and confirming would hit the line's unique index at best and double-spend at worst. So it
    // refuses to guess and says so, with a retry.
    sdk.query = async (name: string) => {
      if (name === 'services.packages.holds_for_checkout') throw new Error('boom');
      return options;
    };
    const el = await mount();
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-confirm"]')).toBeNull();
    expect(text(el)).toContain('ui.tender.loadFailed');
    expect(el.shadowRoot.querySelector('[data-testid="services-voucher-tender-retry"]')).not.toBeNull();
  });

  // sales#520 — painting the recovered hold was only half of it. The till learns that a line is
  // covered from `erp:voucher-held`, and only `confirm()` used to send it: after a reload or a
  // resumed check the slot said «session spent» while the till still charged the line, and the
  // sale then spent the session too. The customer paid twice.
  const heldEvents = () => {
    const seen: CustomEvent[] = [];
    const listener = (e: Event) => seen.push(e as CustomEvent);
    document.addEventListener('erp:voucher-held', listener);
    return { seen, stop: () => document.removeEventListener('erp:voucher-held', listener) };
  };

  it('🔴 a recovered hold tells the till the line is covered, like confirming does', async () => {
    sdk.query = async (name: string) =>
      name === 'services.packages.holds_for_checkout' ? [HELD_ROW] : options;
    const events = heldEvents();
    try {
      await mount();
    } finally {
      events.stop();
    }
    // The mount reads twice (connect + first update), so it may say it twice: the host keeps a
    // Map keyed by line, so the contract is «at least once, always the same», not «exactly once».
    expect(events.seen.length).toBeGreaterThan(0);
    for (const e of events.seen) {
      expect(e.detail).toEqual({
        redemptionId: 'red-9',
        grantId: 'g-cuts',
        packageId: 'p-cuts',
        lineRef: 'line-1',
        checkoutRef: 'order-7',
      });
      expect(e.bubbles && e.composed).toBe(true);
    }
  });

  it('nothing recovered, or a hold of another line: the till is told nothing', async () => {
    for (const rows of [[], [{ ...HELD_ROW, redemption_id: 'red-other', line_ref: 'line-9' }]]) {
      sdk.query = async (name: string) =>
        name === 'services.packages.holds_for_checkout' ? rows : options;
      const events = heldEvents();
      try {
        await mount();
      } finally {
        events.stop();
      }
      expect(events.seen).toHaveLength(0);
    }
  });

  it('an unlimited voucher recovered does not invent a countdown', async () => {
    sdk.query = async (name: string) =>
      name === 'services.packages.holds_for_checkout'
        ? [{ ...HELD_ROW, is_unlimited: 1, remaining_after: null }]
        : options;
    const el = await mount();
    expect(text(el)).toContain('ui.tender.heldUnlimited:{"name":"Bono 5 cortes"}');
  });
});
