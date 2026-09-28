import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
// Module i18n (ADR-0055): the `ui` catalogues are inlined at build time (esbuild).
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
import { domainMessage } from '../../lib/domain-error';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// The session going BACK to its voucher, from the RETURN screen (services#88, ADR-0386).
//
// The mirror of `erp-services-voucher-tender`: that one fills `sales.pos.tender` and spends a
// session on a line; this one fills `sales.refund.tender` and gives it back when the sale is
// returned. `sales` hosts both holes and learns what a voucher is on neither —
// `sales_sale_item.is_covered` says another tender paid the line, never which one, and reading
// this module from there would break exactly the modularity that lets a hub without vouchers keep
// charging and refunding.
//
// WHY THE HOLE HAS TO BE FILLED AT ALL. Both doors have existed since 1.5.35 (services#71) and
// nobody called them: returning a sale a voucher covered left the session spent FOREVER, and the
// operator only found out if they remembered to walk into the voucher screen afterwards. That is
// Mindbody's documented failure — «it will remain attached to the returned Pricing Option as if it
// were still paid» — reached by a different door.
//
// 🔴 THE ORDINAL IS THE WHOLE OF THE TWINS CONTRACT. A mother and her daughter get the same
// haircut on one ticket: two covered lines of the same service, and TWO sessions. The host hands
// each hole its 0-based `lineIndex` among the covered lines of that service, and this element
// pairs it with the nth session of that (sale, service) in the order
// `services.packages.redemptions_for_sale` answers — which is stable by construction. Without it
// both holes would claim the first session and the second would never come back.
//
// 🔴 EXPIRY WARNS AND NEVER BLOCKS. A ticket from three weeks ago is being undone TODAY. Refusing
// would cost the customer the session AND the money path with it, and the screen would fail at
// confirm, which ADR-0386 forbids. The warning travels in `erp:tender-refund-armed` so the host
// can paint it next to the **Devolver** button — the line's hole is often off-screen by the time
// the thumb is on it.

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  hasPermission?(permission: string): boolean;
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

/** A row of `services.packages.redemptions_for_sale` — `refund_check`'s answer, by sale. */
interface SoldSession {
  redemption_id: string;
  grant_id: string;
  package_id: string;
  package_name: string;
  service_id: string;
  service_name: string;
  line_ref: string;
  refund_ref: string;
  /** 1 when this session can go back. 0 comes with `reason`, never with a missing row. */
  refundable: number;
  /** A business CODE, never a sentence: `already_refunded` | `not_settled` | ''. */
  reason: string;
  already_refunded: number;
  max_uses: number | null;
  is_unlimited: number;
  remaining_before: number | null;
  remaining_after: number | null;
  expires_at: string | null;
  /** 1 when the voucher had already expired. A WARNING (ADR-0386), never a refusal. */
  voucher_expired: number;
}

/** The detail the host sends once its refund document exists (`sales`' `commitTenderRefunds`). */
interface CommitDetail {
  saleId?: string;
  refundId?: string;
  refundRef?: string;
  /** `respondWith`'s contract: whoever calls it delays the screen's close until it settles. */
  waitFor?: (p: Promise<unknown>) => void;
}

/**
 * The refusal codes this screen knows how to say out loud.
 *
 * Listing them is deliberate, and it is the same guard `erp-services-voucher-tender` puts on the
 * tie-break reasons: a code the server grows tomorrow must NOT render as a raw key on a salon's
 * screen. Anything outside this set falls back to the generic sentence.
 */
const REASONS = ['already_refunded', 'not_settled'] as const;

/**
 * The new state of the checkbox that fired `ionChange`.
 *
 * Ionic puts it in `detail.checked`; the element's own property mirrors it. Both are read because
 * the second is what a shell stubbing the control leaves behind, and a tick that silently reads
 * `undefined` would disarm the hole instead of arming it.
 */
function checkedOf(e: Event): boolean {
  const detail = (e as CustomEvent<{ checked?: unknown }>).detail;
  if (detail && typeof detail.checked === 'boolean') return detail.checked;
  return !!(e.target as { checked?: unknown } | null)?.checked;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

export class ErpServicesSessionRefund extends LitElement {
  static styles = css`
    :host { display: block; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .box { display: flex; flex-direction: column; gap: 0.45rem; }
    .head { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    /* A voucher name can be a single long code: break it rather than push the card wider. */
    .name { font-weight: 600; overflow-wrap: anywhere; }
    .counter { font-variant-numeric: tabular-nums; font-size: 0.85rem;
               color: var(--ion-color-medium, #6b6b6b); }
    .choice { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem; align-items: center;
              padding: 0.5rem 0.6rem; border: 1px solid var(--ion-color-step-200, #e2e0dc);
              border-radius: 0.6rem; cursor: pointer; }
    .choice[aria-checked='true'] { border-color: var(--ion-color-primary, #3b7d4f);
                                   background: var(--ion-color-step-50, #f7f6f3); }
    /* Ionic paints the checkbox label nowrap: on a phone the sentence ran off the card (services#137). */
    ion-checkbox::part(label) { white-space: normal; overflow-wrap: anywhere; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  `;

  /** The sale being returned. The only key that finds the sessions it spent. */
  @property({ type: String, attribute: 'sale-id' }) saleId = '';
  /** `sales_sale_item.id` — the host's name for this line. Travels back in every event. */
  @property({ type: String, attribute: 'line-ref' }) lineRef = '';
  /** The line's `product_id`: the service whose sessions this hole is about. */
  @property({ type: String, attribute: 'service-id' }) serviceId = '';
  /** 0-based ordinal among the covered lines of the SAME service. Tells twins apart. */
  @property({ type: Number, attribute: 'line-index' }) lineIndex = 0;
  /** Left by the host at commit time, for a filler that reads instead of listening. */
  @property({ type: String, attribute: 'refund-id' }) refundId = '';
  @property({ type: String, attribute: 'refund-ref' }) refundRef = '';

  @state() session: SoldSession | null = null;
  @state() armed = false;
  @state() loading = true;
  @state() loadFailed = false;
  @state() feedback = '';
  @state() busy = false;
  @state() refunded = false;

  /** One attempt per commit. The host dispatches once, but a screen is not a contract. */
  private committed = false;
  /** The (sale, service, ordinal) the current answer belongs to — the guard against re-reading. */
  private loadedKey = '';

  connectedCallback(): void {
    super.connectedCallback();
    // `bubbles: false` on the host's side: the event is dispatched ON this element.
    this.addEventListener('erp:tender-refund-commit', this.onCommit);
    void this.load();
  }

  disconnectedCallback(): void {
    this.removeEventListener('erp:tender-refund-commit', this.onCommit);
    super.disconnectedCallback();
  }

  updated(changed: Map<string, unknown>): void {
    // The host re-sets the four properties on every render of the return screen (it re-renders on
    // each keystroke of an amount), so the read is keyed on the triple and not on the callback:
    // `load` returns immediately when the answer it already has is the answer being asked for.
    if (changed.has('saleId') || changed.has('serviceId') || changed.has('lineIndex')) {
      void this.load();
    }
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return erplora().t(CATALOG, key, params);
  }

  private key(): string {
    return `${this.saleId}|${this.serviceId}|${this.lineIndex}`;
  }

  async load(force = false): Promise<void> {
    if (!this.saleId || !this.serviceId) {
      this.session = null;
      this.loading = false;
      return;
    }
    const key = this.key();
    if (!force && key === this.loadedKey) return;
    this.loadedKey = key;
    this.loading = true;
    this.loadFailed = false;
    this.feedback = '';
    try {
      const rows = await erplora().query<SoldSession[]>(
        'services.packages.redemptions_for_sale',
        { sale_id: this.saleId },
      );
      // The nth session of THIS service, in the order the query guarantees. One read answers the
      // whole ticket and every hole picks its own row out of it, instead of N round trips that
      // would each say the same thing.
      const mine = (Array.isArray(rows) ? rows : []).filter((r) => r.service_id === this.serviceId);
      this.session = mine[this.lineIndex] ?? null;
      this.settleArming();
    } catch (e) {
      // 🔴 A read that failed is NOT «nothing to give back here». Painting the empty state would
      // close the screen having quietly kept a session the salon owes the customer.
      this.session = null;
      this.loadFailed = true;
      this.feedback = domainMessage(e, erplora().locale, this.t('ui.sessionRefund.loadFailed'));
      this.setArmed(false);
    } finally {
      this.loading = false;
    }
  }

  /** Arms by default when the session goes back — the operator un-ticks, never has to opt in. */
  private settleArming(): void {
    const s = this.session;
    if (!s) {
      // Nothing of ours on this line: say nothing at all rather than claim a hole we do not fill.
      this.armed = false;
      return;
    }
    this.setArmed(Number(s.refundable) === 1);
  }

  private setArmed(on: boolean, silent = false): void {
    this.armed = on;
    if (silent) return;
    const warning = on ? this.expiryWarning() : '';
    this.dispatchEvent(
      new CustomEvent(on ? 'erp:tender-refund-armed' : 'erp:tender-refund-disarmed', {
        bubbles: true,
        composed: true,
        detail: warning ? { lineRef: this.lineRef, warning } : { lineRef: this.lineRef },
      }),
    );
  }

  /** The sentence the host paints next to **Devolver**, or '' when the voucher is live. */
  private expiryWarning(): string {
    const s = this.session;
    if (!s || Number(s.voucher_expired) !== 1) return '';
    return this.t('ui.sessionRefund.expired', {
      name: s.package_name,
      date: s.expires_at ? new Date(s.expires_at).toLocaleDateString(erplora().locale) : '',
    });
  }

  /** The operator's choice. It changes what this hole promises; it never changes the money. */
  toggle(on: boolean): void {
    if (!this.session || Number(this.session.refundable) !== 1) return;
    if (on === this.armed) return;
    this.feedback = '';
    this.setArmed(on);
  }

  /**
   * The host's document exists: give the session back, and make the screen WAIT for it.
   *
   * 🔴 `waitFor` is not optional politeness. Without it the screen closes as soon as the money is
   * back and unmounts this element mid-command, leaving the session spent with nobody at the
   * counter able to give it back — the exact failure this whole issue is about.
   */
  private readonly onCommit = (e: Event): void => {
    const detail = ((e as CustomEvent).detail ?? {}) as CommitDetail;
    // The reference is the refund DOCUMENT's id, stable across retries through its
    // `idempotency_key`: it is what makes `refund_redemption` idempotent, so the same document
    // twice returns one session and not two.
    const ref = String(detail.refundRef || this.refundRef || detail.refundId || this.refundId || '');
    if (this.committed || !this.armed || !this.session || !ref) return;
    this.committed = true;
    const promise = this.giveBack(ref);
    if (typeof detail.waitFor === 'function') detail.waitFor(promise);
    // Nobody is waiting: the refusal is already on screen, and an unhandled rejection would take
    // the shell's console with it.
    else void promise.catch(() => undefined);
  };

  private async giveBack(refundRef: string): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.busy = true;
    this.feedback = '';
    try {
      await erplora().command('services.packages.refund_redemption', {
        redemption_id: session.redemption_id,
        refund_ref: refundRef,
      });
      this.refunded = true;
    } catch (e) {
      // 🔴 Shown AND re-thrown. Shown because a failure nobody sees is the one nobody fixes;
      // re-thrown because the host's `waitFor` is what turns it into «the money came back, this
      // half did not» on a screen that would otherwise close saying everything went fine.
      this.feedback = domainMessage(e, erplora().locale, this.t('ui.sessionRefund.refundFailed'));
      throw e;
    } finally {
      this.busy = false;
    }
  }

  private renderCounter(s: SoldSession) {
    if (Number(s.is_unlimited) === 1 || s.remaining_after === null) {
      return html`<span class="counter">${this.t('ui.sessionRefund.unlimited')}</span>`;
    }
    return html`<span class="counter"
      >${this.t('ui.sessionRefund.remainingAfter', {
        before: s.remaining_before,
        after: s.remaining_after,
      })}</span
    >`;
  }

  private renderReason(s: SoldSession) {
    const known = (REASONS as readonly string[]).includes(s.reason);
    return html`<ok-inline-feedback
      data-testid="services-session-refund-reason"
      tone="neutral"
      icon="information-circle-outline"
      >${known
        ? this.t(`ui.sessionRefund.reason.${s.reason}`)
        : this.t('ui.sessionRefund.reason.generic')}</ok-inline-feedback
    >`;
  }

  private renderFeedback() {
    if (!this.feedback) return nothing;
    return html`<ok-inline-feedback
      data-testid="services-session-refund-error"
      tone="danger"
      icon="alert-circle-outline"
      >${this.feedback}</ok-inline-feedback
    >`;
  }

  render() {
    if (this.loading) {
      return html`<div class="box">
        <ion-skeleton-text animated style="height: 2.75rem"></ion-skeleton-text>
      </div>`;
    }
    if (this.loadFailed) {
      return html`<div class="box">
        <ok-inline-feedback
          data-testid="services-session-refund-load-error"
          tone="danger"
          icon="alert-circle-outline"
          >${this.t('ui.sessionRefund.loadFailed')}</ok-inline-feedback
        >
        <div class="actions">
          <ion-button fill="clear" data-testid="services-session-refund-retry" @click=${() => this.load(true)}
            >${this.t('ui.sessionRefund.btnRetry')}</ion-button
          >
        </div>
      </div>`;
    }
    const s = this.session;
    // No session of ours paid for this line: NOTHING. The host hides an empty hole, so a «nothing
    // here» card would add a section to a screen that has no business having one.
    if (!s) return nothing;
    if (this.refunded) {
      return html`<div class="box">
        <ok-inline-feedback
          data-testid="services-session-refund-done"
          tone="success"
          icon="checkmark-circle-outline"
          >${this.t('ui.sessionRefund.done', { name: s.package_name })}</ok-inline-feedback
        >
      </div>`;
    }
    if (Number(s.refundable) !== 1) {
      return html`<div class="box">
        <div class="head"><span class="name">${s.package_name}</span></div>
        ${this.renderReason(s)}${this.renderFeedback()}
      </div>`;
    }
    const warning = this.expiryWarning();
    return html`<div class="box">
      <div class="choice" aria-checked=${this.armed ? 'true' : 'false'}>
        <!-- 🔴 ONE handler, and it is \`ionChange\`. Wiring \`@click\` as well looks harmless — and
             is, in happy-dom, where \`ion-checkbox\` is an unknown element and only the click ever
             fires — but a real Ionic checkbox emits BOTH: the change would set the state and the
             click would immediately flip it back, so the tick would do nothing on a real till and
             every test would still be green. The label goes INSIDE the control, which is Ionic's
             own pattern and gives the whole row as a tap target. -->
        <ion-checkbox
          data-testid="services-session-refund-give-back"
          label-placement="end"
          justify="start"
          ?checked=${this.armed}
          ?disabled=${this.busy}
          @ionChange=${(e: Event) => this.toggle(checkedOf(e))}
        >
          <div>
            <div class="head">
              <span class="name"
                >${this.t('ui.sessionRefund.giveBack', { name: s.package_name })}</span
              >
            </div>
            ${this.renderCounter(s)}
          </div>
        </ion-checkbox>
      </div>
      ${warning
        ? html`<ok-inline-feedback
            data-testid="services-session-refund-expiry-warning"
            tone="warning"
            icon="alert-circle-outline"
            >${warning}</ok-inline-feedback
          >`
        : nothing}
      ${this.renderFeedback()}
    </div>`;
  }
}

define('erp-services-session-refund', ErpServicesSessionRefund);
