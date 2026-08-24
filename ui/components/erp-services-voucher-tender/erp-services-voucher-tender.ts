import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
// Module i18n (ADR-0055): the `ui` catalogues are inlined at build time (esbuild).
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
import { domainMessage } from '../../lib/domain-error';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// The voucher as a TENDER on a checkout LINE (services#70, ADR-0386).
//
// A voucher is N uses of CONCRETE services, not a wallet, so it covers the eligible LINE whole or
// not at all, and whatever it does not cover (the shampoo) is charged with its own tender. This is
// the surface where that happens, and its whole reason to exist is the PREVIEW: which voucher,
// which line, and how many sessions are left AFTERWARDS — before anything is spent.
//
// Why so insistent about showing it. With two valid vouchers no interface in the market says which
// one it is about to spend: Mindbody has a support article dedicated to «why was the wrong pass
// activated» and another about reassigning visits afterwards, and Vagaro states its precedence
// rule in small print. Auto-selecting without showing does not remove the mistake, it postpones it
// to next week's complaint — and here the mistake is expensive, because the line enters the
// VeriFactu chain and a fiscal record is not deleted, only corrected.
//
// So: the tie-break decides the DEFAULT (never the outcome), the reason is written on screen, the
// operator is told when there was more than one candidate, and the choice can be changed with one
// tap and undone until the sale is paid.
//
// 🔴 Redeeming issues NO fiscal document. A voucher of N sessions is univalent: the record came out
// when the voucher was SOLD, with the service's VAT (art. 30 ter.1 of Directive 2006/112/CE — the
// supply made in exchange for the voucher «shall not be regarded as an independent transaction»).

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  hasPermission?(permission: string): boolean;
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

/** A row of `services.packages.tender_options`. */
interface TenderOption {
  /** The customer's PURCHASE of this voucher (services#73). What is spent is a grant, never a
   * catalogue row: two purchases of the same voucher are two rows here, with their own balance
   * and their own expiry, and picking one of them is what this screen is for. */
  grant_id: string;
  package_id: string;
  package_name: string;
  max_uses: number | null;
  used: number;
  remaining_before: number | null;
  remaining_after: number | null;
  is_unlimited: number;
  validity_days: number | null;
  first_redeemed_at: string | null;
  expires_at: string | null;
  candidate_count: number;
  is_default: number;
  default_reason: string;
}

/** What `services.packages.hold_for_line` hands back. */
interface HeldSession {
  redemption_id: string;
  package_name: string;
  remaining_after: number | null;
}

/**
 * A row of `services.packages.holds_for_checkout` — a session this checkout ALREADY spent
 * (services#77).
 *
 * This is what makes the screen survive a reload. `held` is component state, so a remount used to
 * start from zero and paint the chooser over a session that was already gone: charging then billed
 * the FULL price (the host does not know the line is covered), redeeming again hit
 * `uq_services_redemption_line`, and undoing was impossible because the `redemption_id` had left
 * with the component's memory. The read gives it back, and the four props the host re-emits on
 * every mount are enough to ask for it.
 */
interface CheckoutHold {
  redemption_id: string;
  package_name: string;
  line_ref: string;
  remaining_after: number | null;
  is_unlimited: number;
}

/**
 * The tie-break reasons the query can name. Listing them here is deliberate: an unknown reason
 * must NOT render a raw key on a salon's screen, so anything outside this set falls back to the
 * generic sentence.
 */
const REASONS = [
  'only_option',
  'finite_before_unlimited',
  'expires_first',
  'already_started',
  'fewest_sessions_left',
  'oldest_voucher',
  'stable_order',
] as const;

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

/** UI visibility; the runtime re-validates the permission on every command. */
function can(permission: string): boolean {
  const client = erplora();
  return typeof client.hasPermission === 'function' ? client.hasPermission(permission) : true;
}

export class ErpServicesVoucherTender extends LitElement {
  static styles = css`
    :host { display: block; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .box { display: flex; flex-direction: column; gap: 0.6rem; }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
    .title { font-size: 0.95rem; font-weight: 600; margin: 0; }
    .candidates { font-size: 0.8rem; color: var(--ion-color-medium, #6b6b6b); }
    .option { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem; align-items: start;
              padding: 0.55rem 0.6rem; border: 1px solid var(--ion-color-step-200, #e2e0dc);
              border-radius: 0.6rem; cursor: pointer; }
    .option[aria-checked='true'] { border-color: var(--ion-color-primary, #3b7d4f); background: var(--ion-color-step-50, #f7f6f3); }
    .name { font-weight: 600; }
    .counter { font-variant-numeric: tabular-nums; }
    .meta { font-size: 0.8rem; color: var(--ion-color-medium, #6b6b6b); display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .reason { font-size: 0.8rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .actions ion-button { flex: 1 1 9rem; }
    @media (min-width: 40rem) { .actions ion-button { flex: 0 0 auto; } }
  `;

  /** Whose sessions. Without a customer there is no voucher to offer. */
  @property({ type: String, attribute: 'customer-id' }) customerId = '';
  /** The service of the line being covered. A voucher covers it whole or not at all. */
  @property({ type: String, attribute: 'service-id' }) serviceId = '';
  /** The open checkout (the `order_id` when the till works an order). */
  @property({ type: String, attribute: 'checkout-ref' }) checkoutRef = '';
  /** The cart line inside that checkout. One line, one redemption — the database enforces it. */
  @property({ type: String, attribute: 'line-ref' }) lineRef = '';

  @state() options: TenderOption[] = [];
  @state() selectedId = '';
  @state() held: HeldSession | null = null;
  @state() feedback = '';
  @state() loading = true;
  @state() loadFailed = false;
  @state() busy = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  updated(changed: Map<string, unknown>): void {
    // The line under the cashier's finger changes as they move around the cart; the offer has to
    // follow it, or the screen would preview a voucher for a line nobody is charging.
    if (
      !this.held &&
      (changed.has('customerId') || changed.has('serviceId') || changed.has('lineRef'))
    ) {
      void this.load();
    }
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return erplora().t(CATALOG, key, params);
  }

  async load(): Promise<void> {
    if (!this.customerId || !this.serviceId) {
      this.options = [];
      this.loading = false;
      return;
    }
    this.loading = true;
    this.loadFailed = false;
    try {
      // 🔴 THE RECOVERY COMES FIRST, and it decides whether there is anything to choose at all
      // (services#77). If this checkout already holds a session for THIS line, the screen must come
      // back as «held, with undo» — not as the chooser. Painting the chooser over a spent session
      // is what charged the customer for a haircut they had already paid for.
      const mine = await this.recoverHold();
      if (mine) {
        this.held = mine;
        this.options = [];
        return;
      }
      const rows = await erplora().query<TenderOption[]>('services.packages.tender_options', {
        customer_id: this.customerId,
        service_id: this.serviceId,
      });
      this.options = Array.isArray(rows) ? rows : [];
      // The tie-break picks the DEFAULT. The operator's own choice, once made, survives a reload.
      const stillThere = this.options.some((o) => o.grant_id === this.selectedId);
      if (!stillThere) {
        this.selectedId =
          this.options.find((o) => Number(o.is_default) === 1)?.grant_id ??
          this.options[0]?.grant_id ??
          '';
      }
    } catch (e) {
      // 🔴 A read that failed is NOT «this customer has no vouchers». Painting the empty state
      // here would tell the cashier to charge full price for a session already paid for.
      this.options = [];
      this.loadFailed = true;
      this.feedback = domainMessage(e, erplora().locale, this.t('ui.tender.loadFailed'));
    } finally {
      this.loading = false;
    }
  }

  /**
   * The hold this checkout already has for THIS line, or `null`.
   *
   * A checkout covers several lines and each one hosts its own slot, so the read is filtered by
   * `line_ref` here rather than server-side: one query answers the whole ticket and every slot
   * picks its own row out of it, instead of N round trips that would each say the same thing.
   *
   * The read only ever returns what can still be UNDONE — live, held, unsettled, not past its
   * deadline — so a settled session (the sale was paid; giving it back is a refund, with its own
   * audited door) never arrives here to be offered an «undo» the runtime would then refuse.
   */
  private async recoverHold(): Promise<HeldSession | null> {
    if (!this.checkoutRef || !this.lineRef) return null;
    const rows = await erplora().query<CheckoutHold[]>('services.packages.holds_for_checkout', {
      checkout_ref: this.checkoutRef,
    });
    const mine = (Array.isArray(rows) ? rows : []).find((r) => r.line_ref === this.lineRef);
    if (!mine) return null;
    return {
      redemption_id: String(mine.redemption_id ?? ''),
      package_name: String(mine.package_name ?? ''),
      remaining_after: Number(mine.is_unlimited) === 1 ? null : (mine.remaining_after ?? null),
    };
  }

  select(grantId: string): void {
    this.selectedId = grantId;
    this.feedback = '';
  }

  /** The explicit redemption: nothing is spent until this runs. */
  async confirm(): Promise<void> {
    const option = this.options.find((o) => o.grant_id === this.selectedId);
    if (!option || this.busy) return;
    this.busy = true;
    this.feedback = '';
    try {
      const out = await erplora().command<HeldSession>('services.packages.hold_for_line', {
        grant_id: option.grant_id,
        customer_id: this.customerId,
        service_id: this.serviceId,
        checkout_ref: this.checkoutRef,
        line_ref: this.lineRef,
      });
      this.held = {
        redemption_id: String(out?.redemption_id ?? ''),
        package_name: String(out?.package_name ?? option.package_name),
        remaining_after: out?.remaining_after ?? option.remaining_after,
      };
      // The line is covered: whoever hosts this slot needs to stop charging money for it.
      this.dispatchEvent(
        new CustomEvent('erp:voucher-held', {
          bubbles: true,
          composed: true,
          detail: {
            redemptionId: this.held.redemption_id,
            grantId: option.grant_id,
            packageId: option.package_id,
            lineRef: this.lineRef,
            checkoutRef: this.checkoutRef,
          },
        }),
      );
    } catch (e) {
      this.feedback = domainMessage(e, erplora().locale, this.t('ui.tender.holdFailed'));
    } finally {
      this.busy = false;
    }
  }

  /** Undo, which the runtime allows only while the sale is not paid. */
  async undo(): Promise<void> {
    const held = this.held;
    if (!held || this.busy) return;
    this.busy = true;
    this.feedback = '';
    try {
      await erplora().command('services.packages.release_hold', {
        redemption_id: held.redemption_id,
      });
      this.held = null;
      this.dispatchEvent(
        new CustomEvent('erp:voucher-released', {
          bubbles: true,
          composed: true,
          detail: { redemptionId: held.redemption_id, lineRef: this.lineRef },
        }),
      );
      await this.load();
    } catch (e) {
      // The refusal is SHOWN and the hold stays. `services.hold_not_releasable` means the sale was
      // already paid: giving that session back is a refund, and it goes through its own door.
      this.feedback = domainMessage(e, erplora().locale, this.t('ui.tender.releaseFailed'));
    } finally {
      this.busy = false;
    }
  }

  private renderCounter(o: TenderOption) {
    if (Number(o.is_unlimited) === 1 || o.remaining_after === null) {
      return html`<span class="counter">${this.t('ui.tender.unlimited')}</span>`;
    }
    return html`<span class="counter"
      >${this.t('ui.tender.remainingAfter', {
        before: o.remaining_before,
        after: o.remaining_after,
      })}</span
    >`;
  }

  private renderReason(o: TenderOption) {
    if (Number(o.is_default) !== 1) return nothing;
    const known = (REASONS as readonly string[]).includes(o.default_reason);
    return html`<div class="reason">
      ${known
        ? this.t(`ui.tender.reason.${o.default_reason}`)
        : this.t('ui.tender.reason.generic')}
    </div>`;
  }

  private renderOption(o: TenderOption) {
    const chosen = o.grant_id === this.selectedId;
    return html`<label
      class="option"
      role="radio"
      aria-checked=${chosen ? 'true' : 'false'}
      data-test="option"
    >
      <ion-radio
        .value=${o.grant_id}
        ?checked=${chosen}
        @click=${() => this.select(o.grant_id)}
      ></ion-radio>
      <div>
        <div class="name">${o.package_name}</div>
        <div class="meta">
          ${this.renderCounter(o)}
          ${o.expires_at
            ? html`<span
                >${this.t('ui.tender.expires', {
                  date: new Date(o.expires_at).toLocaleDateString(erplora().locale),
                })}</span
              >`
            : nothing}
        </div>
        ${this.renderReason(o)}
      </div>
    </label>`;
  }

  private renderHeld() {
    const held = this.held;
    if (!held) return nothing;
    return html`<div class="box">
      <ok-inline-feedback tone="success" icon="checkmark-circle-outline">
        ${held.remaining_after === null
          ? this.t('ui.tender.heldUnlimited', { name: held.package_name })
          : this.t('ui.tender.held', { name: held.package_name, after: held.remaining_after })}
      </ok-inline-feedback>
      ${this.feedback
        ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline"
            >${this.feedback}</ok-inline-feedback
          >`
        : nothing}
      <div class="actions">
        <ion-button
          data-test="undo"
          fill="clear"
          ?disabled=${this.busy}
          @click=${() => this.undo()}
          >${this.t('ui.tender.btnUndo')}</ion-button
        >
      </div>
    </div>`;
  }

  render() {
    if (this.held) return this.renderHeld();
    if (this.loading) {
      return html`<div class="box"><ion-skeleton-text animated style="height: 3.5rem"></ion-skeleton-text></div>`;
    }
    if (this.loadFailed) {
      // 🔴 The module's own sentence ALWAYS, and the server's detail after it. The rung-2 rule of
      // `domainMessage` (keep a presentable server message) is right for a refusal that explains
      // itself; it is not enough here, because a transport failure says «boom» and the one thing
      // the cashier must read is «do not charge full price yet, this customer may have a voucher».
      const detail = this.feedback && this.feedback !== this.t('ui.tender.loadFailed') ? this.feedback : '';
      return html`<div class="box">
        <ok-inline-feedback tone="danger" icon="alert-circle-outline">
          ${this.t('ui.tender.loadFailed')}${detail ? html` <span class="meta">${detail}</span>` : nothing}
        </ok-inline-feedback>
        <div class="actions">
          <ion-button fill="clear" data-test="retry" @click=${() => this.load()}
            >${this.t('ui.tender.btnRetry')}</ion-button
          >
        </div>
      </div>`;
    }
    if (this.options.length === 0) {
      return html`<div class="box">
        <ok-inline-feedback tone="neutral" icon="information-circle-outline"
          >${this.t('ui.tender.none')}</ok-inline-feedback
        >
      </div>`;
    }
    const candidates = Number(this.options[0]?.candidate_count ?? this.options.length);
    return html`<div class="box">
      <div class="head">
        <h3 class="title">${this.t('ui.tender.title')}</h3>
        ${candidates > 1
          ? html`<span class="candidates"
              >${this.t('ui.tender.candidates', { count: candidates })}</span
            >`
          : nothing}
      </div>
      <div role="radiogroup" class="box">
        ${this.options.map((o) => this.renderOption(o))}
      </div>
      ${this.feedback
        ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline"
            >${this.feedback}</ok-inline-feedback
          >`
        : nothing}
      ${can('services.hold_package')
        ? html`<div class="actions">
            <ion-button
              data-test="confirm"
              ?disabled=${this.busy || !this.selectedId}
              @click=${() => this.confirm()}
              >${this.busy ? this.t('ui.tender.btnHolding') : this.t('ui.tender.btnConfirm')}</ion-button
            >
          </div>`
        : nothing}
    </div>`;
  }
}

define('erp-services-voucher-tender', ErpServicesVoucherTender);
