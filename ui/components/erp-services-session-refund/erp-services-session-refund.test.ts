// The session going BACK to its voucher, from the return screen (services#88 / ADR-0386).
//
// The mirror of `erp-services-voucher-tender`: that one fills `sales.pos.tender` and spends a
// session; this one fills `sales.refund.tender` and gives it back. `sales` hosts both and learns
// what a voucher is on neither — `sales_sale_item.is_covered` says another tender paid the line,
// never which one.
//
// 🔴 WHAT IS ASSERTED HERE IS THE SHAPE OF THE CONTRACT, not the prose: which properties the
// element read, which events it emitted, and what payload reached the runtime. The wording is the
// catalogue's job (ADR-0055) and asserting on it would make a copy-edit break the till.
//
// The four details of the host contract that are not cosmetic, and are each pinned below:
//
//   * the four properties are set BEFORE the element enters the DOM — the read starts in
//     `connectedCallback`, and reading an empty sale would paint «nothing to give back» over a
//     session that does go back;
//   * `lineIndex` is what tells twins apart: a mother and her daughter with the same haircut are
//     two covered lines and TWO sessions, and without the ordinal both holes would claim the first;
//   * `waitFor(promise)` works like `respondWith` — not calling it lets the screen close mid
//     command and unmount this element with the session still spent;
//   * an expired voucher WARNS and never blocks: a return undoes a past act.
import { beforeEach, describe, expect, it } from 'vitest';
// The refusal an operator reads is the module's OWN translated sentence, not the server's insides
// (`ui/lib/domain-error.ts`). Asserting through the CATALOGUE rather than against pasted prose is
// what keeps the two in step (ADR-0055): a code shipped without its wording fails here instead of
// reaching a salon as a raw gate error, and a copy-edit does not break the till.
import esLocale from '../../../locales/es.json';
const ERRORS = (esLocale as { errors: Record<string, string> }).errors;

/** A row of `services.packages.redemptions_for_sale` — the same answer `refund_check` gives. */
const SESSION = {
  redemption_id: 'red-1',
  grant_id: 'g-cuts',
  package_id: 'p-cuts',
  package_name: 'Bono 5 cortes',
  customer_id: 'cus-1',
  service_id: 'svc-cut',
  service_name: 'Corte',
  sale_id: 'sale-1',
  checkout_ref: 'order-7',
  line_ref: 'oline-1',
  refund_ref: '',
  redeemed_at: '2026-08-18T10:00:00Z',
  settled_at: '2026-08-18T10:05:00Z',
  refundable: 1,
  reason: '',
  already_refunded: 0,
  max_uses: 5,
  is_unlimited: 0,
  remaining_before: 2,
  remaining_after: 3,
  expires_at: '2026-09-17T10:00:00Z',
  voucher_expired: 0,
};
/** The daughter's haircut: same service, same sale, a SECOND session. */
const TWIN = { ...SESSION, redemption_id: 'red-2', line_ref: 'oline-2' };
/** Another line of the same ticket, a different service. */
const COLOUR = { ...SESSION, redemption_id: 'red-3', service_id: 'svc-colour', line_ref: 'oline-3' };

const commands: { name: string; payload: Record<string, unknown> }[] = [];
let rows: unknown[] = [];
let queries: { name: string; params: Record<string, unknown> }[] = [];
let sdk: Record<string, unknown>;
let nextCommandError: Error | null = null;
let queryFails = false;

beforeEach(() => {
  commands.length = 0;
  queries = [];
  rows = [SESSION, TWIN, COLOUR];
  nextCommandError = null;
  queryFails = false;
  sdk = {
    query: async (name: string, params: Record<string, unknown>) => {
      queries.push({ name, params });
      if (queryFails) throw new Error('boom');
      return name === 'services.packages.redemptions_for_sale' ? rows : [];
    },
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (nextCommandError) throw nextCommandError;
      return { redemption_id: 'red-1' };
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    t: (_c: unknown, key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  saleId: string;
  lineRef: string;
  serviceId: string;
  lineIndex: number;
  refundId?: string;
  refundRef?: string;
  session: typeof SESSION | null;
  armed: boolean;
  toggle(on: boolean): void;
  load(force?: boolean): Promise<void>;
};

/** Mounts the way the host does: the four properties BEFORE the insert (sales#166). */
async function mount(props: Partial<Mounted> = {}): Promise<Mounted> {
  await import('./erp-services-session-refund');
  const el = document.createElement('erp-services-session-refund') as unknown as Mounted;
  el.saleId = 'sale-1';
  el.lineRef = 'line-1';
  el.serviceId = 'svc-cut';
  el.lineIndex = 0;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const text = (el: Mounted) => el.shadowRoot.textContent ?? '';

/** Listens on an ancestor: the contract says the events BUBBLE and cross the shadow boundary. */
function listenOnHost(): { armed: CustomEvent[]; disarmed: CustomEvent[] } {
  const armed: CustomEvent[] = [];
  const disarmed: CustomEvent[] = [];
  document.body.addEventListener('erp:tender-refund-armed', (e) => armed.push(e as CustomEvent));
  document.body.addEventListener('erp:tender-refund-disarmed', (e) =>
    disarmed.push(e as CustomEvent),
  );
  return { armed, disarmed };
}

/** The host's side of the commit: dispatch on the element, collect what was handed to `waitFor`. */
async function commit(
  el: Mounted,
  detail: Record<string, unknown> = {},
): Promise<Promise<unknown>[]> {
  const pending: Promise<unknown>[] = [];
  el.refundId = String(detail.refundId ?? 'ref-1');
  el.refundRef = String(detail.refundRef ?? 'ref-1');
  el.dispatchEvent(
    new CustomEvent('erp:tender-refund-commit', {
      detail: {
        saleId: 'sale-1',
        refundId: 'ref-1',
        refundRef: 'ref-1',
        ...detail,
        waitFor: (p: Promise<unknown>) => pending.push(Promise.resolve(p)),
      },
      bubbles: false,
    }),
  );
  await el.updateComplete;
  return pending;
}

describe('finding the session this hole is about', () => {
  it('asks `redemptions_for_sale` for the sale it was given, and only that', async () => {
    await mount();
    expect(queries).toEqual([
      { name: 'services.packages.redemptions_for_sale', params: { sale_id: 'sale-1' } },
    ]);
  });

  it('takes the session of ITS service, not the first row of the sale', async () => {
    const el = await mount({ serviceId: 'svc-colour', lineIndex: 0 });
    expect(el.session?.redemption_id).toBe('red-3');
  });

  it('🔴 the twins: the nth hole takes the nth session of that service', async () => {
    const first = await mount({ lineIndex: 0 });
    const second = await mount({ lineIndex: 1 });
    expect(first.session?.redemption_id).toBe('red-1');
    expect(second.session?.redemption_id).toBe('red-2');
  });

  it('an ordinal with no session behind it paints NOTHING and arms nothing', async () => {
    const seen = listenOnHost();
    const el = await mount({ lineIndex: 5 });
    expect(el.session).toBeNull();
    // Not an empty box with a header: NOTHING. The host hides an empty hole (`.rt-slot:empty`),
    // so painting a «nothing here» card would add a section to a screen that has no business
    // having one.
    expect(text(el)).toBe('');
    expect(el.shadowRoot.querySelector('*')).toBeNull();
    expect(seen.armed).toHaveLength(0);
  });

  it('a line whose service no session paid for is not claimed either', async () => {
    const el = await mount({ serviceId: 'svc-massage' });
    expect(el.session).toBeNull();
  });
});

describe('arming: the host is told this line goes back', () => {
  it('emits `armed` with its line ref, and it CROSSES the shadow boundary', async () => {
    const seen = listenOnHost();
    const el = await mount();
    expect(seen.armed).toHaveLength(1);
    expect(seen.armed[0].detail).toMatchObject({ lineRef: 'line-1' });
    expect(seen.armed[0].bubbles).toBe(true);
    expect(seen.armed[0].composed).toBe(true);
    expect(el.armed).toBe(true);
  });

  it('untick disarms, tick re-arms — the host hears both', async () => {
    const seen = listenOnHost();
    const el = await mount();
    el.toggle(false);
    await el.updateComplete;
    expect(el.armed).toBe(false);
    expect(seen.disarmed.at(-1)?.detail).toMatchObject({ lineRef: 'line-1' });
    el.toggle(true);
    await el.updateComplete;
    expect(seen.armed).toHaveLength(2);
  });

  it('the TICK itself disarms it — through `ionChange`, the event a real checkbox fires', async () => {
    // Not a detour around `toggle()`: happy-dom does not define `ion-checkbox`, so this is the only
    // place the wiring between the control and the state is exercised at all. It caught a real one
    // — `@click` next to `@ionChange` reads as belt and braces and is a NO-OP on a real till, where
    // both fire and the second undoes the first, with every test still green.
    const seen = listenOnHost();
    const el = await mount();
    const box = el.shadowRoot.querySelector('[data-testid="services-session-refund-give-back"]') as HTMLElement;
    expect(box).toBeTruthy();
    box.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: false } }));
    await el.updateComplete;
    expect(el.armed).toBe(false);
    expect(seen.disarmed).toHaveLength(1);
    box.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: true } }));
    await el.updateComplete;
    expect(el.armed).toBe(true);
    expect(seen.armed).toHaveLength(2);
  });

  it('🔴 a bare CLICK on the box changes nothing — one tap must be one toggle', async () => {
    // This is the assertion that kills the double-handler: a real tap raises `click` AND
    // `ionChange`, so a second listener on `click` makes the two cancel each other out and the
    // tick becomes dead on a real till while happy-dom — which raises neither by itself — stays
    // green. Here the click is raised on its own, and it must do nothing at all.
    const el = await mount();
    const box = el.shadowRoot.querySelector('[data-testid="services-session-refund-give-back"]') as HTMLElement;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.armed).toBe(true);
    // …and the pair, in the order a tap delivers them, nets out to exactly one toggle.
    box.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: false } }));
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.armed).toBe(false);
  });

  it('a session that CANNOT go back is disarmed, and says so as a CODE', async () => {
    rows = [{ ...SESSION, refundable: 0, reason: 'already_refunded', already_refunded: 1 }];
    const seen = listenOnHost();
    const el = await mount();
    expect(el.armed).toBe(false);
    expect(seen.armed).toHaveLength(0);
    expect(seen.disarmed).toHaveLength(1);
    expect(text(el)).toContain('ui.sessionRefund.reason.already_refunded');
  });

  it('an unknown reason falls back to the generic sentence, never a raw key', async () => {
    rows = [{ ...SESSION, refundable: 0, reason: 'something_new_from_the_server' }];
    const el = await mount();
    expect(text(el)).toContain('ui.sessionRefund.reason.generic');
    expect(text(el)).not.toContain('something_new_from_the_server');
  });
});

describe('what the operator reads before pressing Devolver', () => {
  it('names the voucher and previews the counter: 2 left → 3 after', async () => {
    const el = await mount();
    expect(text(el)).toContain('Bono 5 cortes');
    expect(text(el)).toContain('ui.sessionRefund.remainingAfter:{"before":2,"after":3}');
  });

  it('an unlimited voucher counts nothing instead of showing null', async () => {
    rows = [{ ...SESSION, max_uses: null, is_unlimited: 1, remaining_before: null, remaining_after: null }];
    const el = await mount();
    expect(text(el)).toContain('ui.sessionRefund.unlimited');
    expect(text(el)).not.toContain('null');
  });

  it('🔴 an expired voucher WARNS through the event and does not block', async () => {
    rows = [{ ...SESSION, voucher_expired: 1 }];
    const seen = listenOnHost();
    const el = await mount();
    // It is still armed: expiry never vetoes undoing a past act (ADR-0386).
    expect(el.armed).toBe(true);
    expect(seen.armed[0].detail.warning).toContain('ui.sessionRefund.expired');
    // …and the warning travels with the event so the host can paint it next to the button.
    expect(text(el)).toContain('ui.sessionRefund.expired');
  });

  it('a live voucher sends no warning at all', async () => {
    const seen = listenOnHost();
    await mount();
    expect(seen.armed[0].detail.warning).toBeUndefined();
  });
});

describe('committing: the refund document arrives and the session goes back', () => {
  it('calls `refund_redemption` with the redemption and the document as idempotency key', async () => {
    const el = await mount();
    const pending = await commit(el, { refundRef: 'refund-doc-9' });
    await Promise.all(pending);
    expect(commands).toEqual([
      {
        name: 'services.packages.refund_redemption',
        payload: { redemption_id: 'red-1', refund_ref: 'refund-doc-9' },
      },
    ]);
  });

  it('🔴 calls `waitFor`, or the screen closes and unmounts it mid-command', async () => {
    const el = await mount();
    const pending = await commit(el);
    expect(pending).toHaveLength(1);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });

  it('falls back to the `refundRef` PROPERTY when the detail carries none', async () => {
    const el = await mount();
    el.refundRef = 'from-the-property';
    el.dispatchEvent(
      new CustomEvent('erp:tender-refund-commit', { detail: { saleId: 'sale-1' }, bubbles: false }),
    );
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(commands[0]?.payload).toMatchObject({ refund_ref: 'from-the-property' });
  });

  it('disarmed means DISARMED: no command, and nothing to wait for', async () => {
    const el = await mount();
    el.toggle(false);
    await el.updateComplete;
    const pending = await commit(el);
    expect(commands).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it('a session that cannot go back is never sent to the runtime', async () => {
    rows = [{ ...SESSION, refundable: 0, reason: 'already_refunded' }];
    const el = await mount();
    const pending = await commit(el);
    expect(commands).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it('🔴 a refusal REJECTS the promise, so the screen can say this half did not complete', async () => {
    nextCommandError = Object.assign(new Error('nope'), {
      code: 'services.redemption_already_refunded',
    });
    const el = await mount();
    const pending = await commit(el);
    await expect(Promise.all(pending)).rejects.toBeTruthy();
    // …and the operator is not left guessing: the refusal is on screen too.
    await el.updateComplete;
    expect(text(el)).toContain(ERRORS['services.redemption_already_refunded']);
  });

  it('a second commit does not spend a second command', async () => {
    const el = await mount();
    await Promise.all(await commit(el));
    await Promise.all(await commit(el));
    expect(commands).toHaveLength(1);
  });
});

describe('the read failing is not «nothing to give back»', () => {
  it('says it could not read, arms nothing, and offers a retry', async () => {
    queryFails = true;
    const seen = listenOnHost();
    const el = await mount();
    expect(text(el)).toContain('ui.sessionRefund.loadFailed');
    expect(seen.armed).toHaveLength(0);
    expect(el.shadowRoot.querySelector('[data-testid="services-session-refund-retry"]')).toBeTruthy();
  });

  it('and a failed read never sends a refund on the operator pressing Devolver', async () => {
    queryFails = true;
    const el = await mount();
    const pending = await commit(el);
    expect(commands).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  // services#139 - `disarmed` is what the hole says when the session does NOT go back (it already
  // came back, or the operator un-ticked it). The return screen reopened over a recovered document
  // (sales#465) releases its pending key once every covered line has answered and nothing is armed:
  // a failed read that said `disarmed` counted as that answer, and closing the screen then lost the
  // session for good. Not knowing is SILENCE - the host's own reading of a hole that has not spoken.
  it('🔴 a failed first read tells the host NOTHING - silence is «not known yet»', async () => {
    queryFails = true;
    const seen = listenOnHost();
    await mount();
    expect(seen.armed).toHaveLength(0);
    expect(seen.disarmed).toHaveLength(0);
  });

  it('🔴 a failed RETRY stays silent too - only an answer the hole read speaks', async () => {
    queryFails = true;
    const seen = listenOnHost();
    const el = await mount();
    el.shadowRoot
      .querySelector<HTMLElement>('[data-testid="services-session-refund-retry"]')!
      .click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(queries).toHaveLength(2);
    expect(seen.disarmed).toHaveLength(0);
  });

  it('a retry that reads is the answer: the host hears `armed` then', async () => {
    queryFails = true;
    const seen = listenOnHost();
    const el = await mount();
    queryFails = false;
    await el.load(true);
    await el.updateComplete;
    expect(seen.armed.map((e) => e.detail)).toEqual([{ lineRef: 'line-1' }]);
    expect(seen.disarmed).toHaveLength(0);
  });

  it('🔴 a hole that HAD armed and then cannot read retracts it as UNKNOWN, not as «does not go back»', async () => {
    const seen = listenOnHost();
    const el = await mount();
    expect(seen.armed).toHaveLength(1);
    queryFails = true;
    await el.load(true);
    await el.updateComplete;
    // Retracted, so the host stops announcing a give-back this hole can no longer promise - and
    // flagged, so a host that counts answers does not count this one.
    expect(seen.disarmed.map((e) => e.detail)).toEqual([{ lineRef: 'line-1', unknown: true }]);
    expect(el.armed).toBe(false);
  });

  it('a session that does not go back is still a plain `disarmed`: an answer, never `unknown`', async () => {
    rows = [{ ...SESSION, refundable: 0, reason: 'already_refunded', already_refunded: 1 }];
    const seen = listenOnHost();
    await mount();
    expect(seen.disarmed.map((e) => e.detail)).toEqual([{ lineRef: 'line-1' }]);
  });
});

describe('the sale id arriving late', () => {
  it('re-reads when the host sets the sale after the insert', async () => {
    const el = await mount({ saleId: '' });
    expect(queries).toHaveLength(0);
    el.saleId = 'sale-1';
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(queries).toHaveLength(1);
  });
});
