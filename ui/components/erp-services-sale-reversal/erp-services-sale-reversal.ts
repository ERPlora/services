import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
// Module i18n (ADR-0055): the `ui` catalogues are inlined at build time (esbuild).
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// What happens to a voucher when the sale that sold it is voided or refunded (services#157,
// services#158).
//
// Voiding the sale, refunding it in full, or refunding the voucher's line void the voucher, used or
// not (`sale_void_grants.sql`, `sale_refund_grants.sql`, `sale_refund_line_grants.sql`): the money
// goes back, so the voucher goes with it — the sessions already used stay used and what was left is
// lost. That is the market's rule (MyTime, Square, Lightspeed void what is left; WooCommerce leaving
// it live is the complaint), and the operator has to read it BEFORE confirming, not find it later
// in **Bonos vendidos**. `sales` cedes the hole `sales.reversal.notice` in its void and refund
// windows and hands two properties, set before the insert: `saleId` and `action`. It never learns
// what a voucher is.
//
// It warns and never blocks: the void is `sales`' decision, and this module only hears it.

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

/** A row of `services.packages.sold_on_sale`. */
interface SoldVoucher {
  grant_id: string;
  package_name: string;
  /** Sessions already used: they stay used. */
  used: number;
  /** Sessions that would be lost; null = unlimited. */
  remaining: number | null;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK not initialised by the shell');
  return c;
}

export class ErpServicesSaleReversal extends LitElement {
  static styles = css`
    :host { display: block; font-family: system-ui, sans-serif; }
    .box { display: flex; flex-direction: column; gap: 0.45rem; }
    ok-inline-feedback { overflow-wrap: anywhere; }
  `;

  /** The sale about to be voided or refunded. */
  @property({ type: String, attribute: 'sale-id' }) saleId = '';
  /** Which door hosts the hole: 'void' or 'refund' (a full refund, or one that returns the voucher's line, voids it). */
  @property({ type: String }) action = 'void';

  @state() vouchers: SoldVoucher[] = [];
  @state() loading = false;
  @state() loadFailed = false;

  private loadedSale = '';

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('saleId')) void this.load();
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return erplora().t(CATALOG, key, params);
  }

  async load(force = false): Promise<void> {
    if (!this.saleId) {
      this.vouchers = [];
      this.loading = false;
      this.loadFailed = false;
      this.loadedSale = '';
      return;
    }
    if (!force && this.saleId === this.loadedSale) return;
    const sale = this.saleId;
    this.loadedSale = sale;
    this.loading = true;
    this.loadFailed = false;
    try {
      const rows = await erplora().query<SoldVoucher[]>('services.packages.sold_on_sale', { sale_id: sale });
      if (sale !== this.saleId) return;
      this.vouchers = Array.isArray(rows) ? rows : [];
    } catch {
      if (sale !== this.saleId) return;
      this.vouchers = [];
      this.loadFailed = true;
    } finally {
      if (sale === this.saleId) this.loading = false;
    }
  }

  /** The sentence for one voucher: nothing used, some left to lose, or nothing left to lose. */
  private message(v: SoldVoucher): string {
    const door = this.action === 'refund' ? 'refund' : 'void';
    const used = Number(v.used) || 0;
    const name = v.package_name;
    if (used === 0) return this.t(`ui.saleReversal.${door}.intact`, { name });
    const remaining = v.remaining === null || v.remaining === undefined ? null : Number(v.remaining);
    if (remaining === null || remaining <= 0) {
      return this.t(`ui.saleReversal.${door}.usedNoMore`, { name, used });
    }
    return this.t(`ui.saleReversal.${door}.used`, { name, used, remaining });
  }

  render() {
    if (this.loading) {
      return html`<div class="box"><ion-skeleton-text animated style="height: 2.75rem"></ion-skeleton-text></div>`;
    }
    if (this.loadFailed) {
      return html`<div class="box">
        <ok-inline-feedback data-testid="services-sale-reversal-load-error" tone="danger" icon="alert-circle-outline"
          >${this.t('ui.saleReversal.loadFailed')}</ok-inline-feedback
        >
        <div>
          <ion-button fill="clear" size="small" data-testid="services-sale-reversal-retry" @click=${() => this.load(true)}
            >${this.t('ui.saleReversal.btnRetry')}</ion-button
          >
        </div>
      </div>`;
    }
    if (!this.vouchers.length) return nothing;
    return html`<div class="box">
      ${this.vouchers.map(
        (v) => html`<ok-inline-feedback
          data-testid=${`services-sale-reversal-voucher-${v.grant_id}`}
          tone="warning"
          icon="alert-circle-outline"
          >${this.message(v)}</ok-inline-feedback
        >`,
      )}
    </div>`;
  }
}

define('erp-services-sale-reversal', ErpServicesSaleReversal);
