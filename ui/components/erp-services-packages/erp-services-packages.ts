import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import '@erplora/outfitkit/ok-data-table';
import '@erplora/outfitkit/ok-status-pill';
import type { DataTableColumn, DataTableAction } from '@erplora/outfitkit';
import { createListController, majorToMinor, minorToMajor } from '@erplora/module-sdk';
import type { ListController, ListClient, ListParams, ListPage } from '@erplora/module-sdk';
// Module i18n (ADR-0055): the `ui` catalogues are inlined at build time (esbuild).
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
import { domainMessage } from '../../lib/domain-error';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// «Packages» view of the services module (services#4): the CRUD of packages/vouchers (bonos) that
// existed only as commands. Same data-table pattern as the rest of the Hub. Lines (services +
// sessions) are part of `services.packages.create` (WASM handler); the runtime has no line-edit
// command, so «edit» changes the HEADER (name, discount, validity, uses) — the market's usual
// shape too (Fresha/Vagaro vouchers: edit price/validity, lines are the voucher's identity).

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  queryAll<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T[]>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  on(event: string, cb: (payload: unknown) => void): () => void;
  hasPermission?(permission: string): boolean;
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
  formatMoney(minor: number, opts?: { currency?: string; locale?: string }): string;
  currencyDecimals: number;
}

/** Row of `services.packages.list`. */
interface Package {
  id: string;
  name: string;
  slug: string;
  discount_type: 'percentage' | 'fixed';
  discount_percent_bp: number | null;
  discount_amount_cents: number | null;
  fixed_price: number | null;
  is_active: number;
  items: number;
}

/**
 * Row of `services.packages.redemption_history` — one MOVEMENT of the voucher (services#71).
 *
 * `movement` is the query's own derived field and not something re-derived here: a screen that
 * recomputed «is this a refund?» from `is_deleted` and `refunded_at` would be a second
 * implementation of the rule, free to drift from the one the database applies.
 */
interface Movement {
  redemption_id: string;
  customer_id: string;
  service_name: string | null;
  use_index: number | null;
  redeemed_at: string | null;
  settled_at: string | null;
  sale_id: string | null;
  refunded_at: string | null;
  refunded_by: string | null;
  refund_ref: string | null;
  refund_note: string;
  refund_expired: number;
  movement: 'held' | 'consumed' | 'released' | 'refunded' | string;
}

/** Row of `services.services.list` (the selector of the lines). */
interface ServiceOption {
  id: string;
  name: string;
  price: string | number;
}

interface PackageForm {
  name: string;
  discountType: 'percentage' | 'fixed' | string;
  /** Percent (0..100) or money in MAJOR units, by `discountType`. */
  discountValue: string;
  /** Closed price of the whole package, MAJOR units; '' = sum of lines minus discount. */
  fixedPrice: string;
  validityDays: string;
  maxUses: string;
}

interface LineDraft {
  serviceId: string;
  /** Sessions the voucher grants for that service (whole number typed by a human). */
  sessions: string;
}

/** Sessions → fixed-point 10⁶ (ADR-0147): 2 sessions = 2000000. */
const SESSION_SCALE = 1_000_000;

/**
 * Decimals a discount percentage keeps, i.e. the scale of a BASIS POINT: 1050 = 10,50 %.
 *
 * The catalogue stores the percentage as a whole number of basis points, not as a float
 * (services#55). This screen is the frontier where a human types `10,5` and where it goes back to
 * being readable — and, as the money contract asks (§4), the crossing is a named function on each
 * side, never an inline `* 100`.
 */
const PERCENT_DECIMALS = 2;

const EMPTY_FORM: PackageForm = { name: '', discountType: 'percentage', discountValue: '', fixedPrice: '', validityDays: '', maxUses: '' };

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

function decimals(): number {
  const d = erplora().currencyDecimals;
  return typeof d === 'number' ? d : 2;
}

/** Typed money (major units, comma or dot) → MINOR units. '' → null. */
function toMinorOrNull(v: string): number | null {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  return majorToMinor(s, decimals());
}

/** Typed percentage (major units, comma or dot) → whole BASIS POINTS. '' → 0. */
function toBasisPoints(v: string): number {
  const s = String(v ?? '').trim().replace(',', '.');
  return s ? majorToMinor(s, PERCENT_DECIMALS) : 0;
}

/** Basis points → the percentage as the hub's locale writes it (1050 → `10,5`). */
function formatPercent(bp: number): string {
  return Number(minorToMajor(bp || 0, PERCENT_DECIMALS))
    .toLocaleString(erplora().locale, { maximumFractionDigits: PERCENT_DECIMALS });
}

/** Typed integer → number, '' → null. */
function toIntOrNull(v: string): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export class ErpServicesPackages extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .page { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
    .page > ok-data-table { flex: 1 1 auto; min-height: 0; }
    .form { display: flex; flex-direction: column; gap: 0.7rem; }
    .form ion-button[type='submit'] { align-self: flex-end; }
    .line { display: grid; grid-template-columns: 1fr 5.5rem auto; gap: 0.4rem; align-items: center; }
    .lines-title { font-size: 0.85rem; font-weight: 600; margin: 0.3rem 0 0; }
    .movement h3 { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
    .movement .refund { font-size: 0.82rem; opacity: 0.85; }
  `;

  @state() form: PackageForm = { ...EMPTY_FORM };
  @state() items: LineDraft[] = [{ serviceId: '', sessions: '1' }];
  @state() services: ServiceOption[] = [];
  @state() saving = false;
  @state() formError = '';
  /** Package being edited (header only); `null` = create mode. */
  @state() editingId: string | null = null;
  @state() deleteTarget: Package | null = null;
  /** Voucher whose ledger is open; `null` = the sheet is closed. */
  @state() movementsOf: { id: string; name: string } | null = null;
  @state() movements: Movement[] = [];
  @state() movementsLoading = false;
  @state() movementsError = '';

  private ctrl!: ListController<Package>;
  private unsub?: () => void;

  private get columns(): DataTableColumn[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return [
      { key: 'name', header: t('ui.colName'), sortable: true, filterable: true, filterType: 'text' },
      {
        key: 'discount_type',
        header: t('ui.colDiscount'),
        sortable: true,
        format: (r) => (r.discount_type === 'fixed'
          ? `-${erplora().formatMoney(Number(r.discount_amount_cents) || 0)}`
          : `-${formatPercent(Number(r.discount_percent_bp) || 0)} %`),
      },
      {
        key: 'fixed_price',
        header: t('ui.colFixedPrice'),
        align: 'right',
        sortable: true,
        format: (r) => (r.fixed_price == null || r.fixed_price === '' ? '—' : erplora().formatMoney(Number(r.fixed_price) || 0)),
      },
      { key: 'items', header: t('ui.colItems'), align: 'right', sortable: true },
      {
        key: 'is_active',
        header: t('ui.colStatus'),
        sortable: true,
        filterable: true,
        filterType: 'select',
        options: [{ value: '1', label: t('ui.status.active') }, { value: '0', label: t('ui.status.inactive') }],
        format: (r) => (Number(r.is_active) ? t('ui.status.active') : t('ui.status.inactive')),
      },
    ];
  }

  get actions(): DataTableAction[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return [
      ...(can('services.change_package') ? [{ id: 'edit', label: t('ui.actionEdit'), icon: 'create-outline' }] : []),
      // The voucher's ledger. Gated by the same permission as the balance, because that is what
      // it is: the movements behind a balance. Read-only — returning a session is `sales`' return
      // flow, not a button on the catalogue screen.
      ...(can('services.view_package_balance') ? [{ id: 'movements', label: t('ui.actionMovements'), icon: 'time-outline' }] : []),
      ...(can('services.delete_package') ? [{ id: 'delete', label: t('ui.actionDelete'), icon: 'trash-outline', color: 'danger' }] : []),
    ];
  }

  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    this.ctrl = createListController<Package>(erplora(), 'services.packages.list', () => this.requestUpdate(), {
      pageSize: 50,
      sort: 'name',
      dir: 'asc',
    });
    await Promise.all([this.ctrl.load(), this.loadServices()]);
    try {
      const off1 = erplora().on('services.package.created', () => this.ctrl.load());
      const off2 = erplora().on('services.package.updated', () => this.ctrl.load());
      const off3 = erplora().on('services.package.deleted', () => this.ctrl.load());
      this.unsub = () => { off1(); off2(); off3(); };
    } catch {
      /* no SDK (preview) → no live refresh */
    }
  }

  disconnectedCallback() {
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    super.disconnectedCallback();
    this.unsub?.();
  }

  private async loadServices() {
    try {
      this.services = (await erplora().queryAll<ServiceOption>('services.services.list', { sort: 'name', dir: 'asc' })) ?? [];
    } catch {
      this.services = [];
    }
  }

  private dataTable(): { open(p?: 'filters' | 'create'): void; close(): void } | null {
    return this.renderRoot.querySelector('ok-data-table') as { open(p?: 'filters' | 'create'): void; close(): void } | null;
  }

  addItem(): void {
    this.items = [...this.items, { serviceId: '', sessions: '1' }];
  }

  private removeItem(i: number): void {
    this.items = this.items.filter((_, idx) => idx !== i);
    if (this.items.length === 0) this.items = [{ serviceId: '', sessions: '1' }];
  }

  private setItem(i: number, patch: Partial<LineDraft>): void {
    this.items = this.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
  }

  async onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void> {
    const { actionId, row } = ev.detail;
    const p = row as unknown as Package;
    if (actionId === 'edit' && can('services.change_package')) {
      this.formError = '';
      let full: Record<string, unknown> = row;
      try {
        const rows = await erplora().query<Record<string, unknown>[]>('services.packages.get', { package_id: p.id });
        if (Array.isArray(rows) && rows[0]) full = rows[0];
      } catch {
        /* the list row is enough for what the header form shows */
      }
      const type = String(full.discount_type ?? 'percentage');
      this.editingId = p.id;
      this.form = {
        name: String(full.name ?? ''),
        discountType: type,
        discountValue: type === 'fixed'
          ? String(minorToMajor(Number(full.discount_amount_cents) || 0, decimals()))
          : String(minorToMajor(Number(full.discount_percent_bp) || 0, PERCENT_DECIMALS)),
        fixedPrice: full.fixed_price == null || full.fixed_price === '' ? '' : String(minorToMajor(Number(full.fixed_price) || 0, decimals())),
        validityDays: full.validity_days == null ? '' : String(full.validity_days),
        maxUses: full.max_uses == null ? '' : String(full.max_uses),
      };
      this.dataTable()?.open('create');
    } else if (actionId === 'movements' && can('services.view_package_balance')) {
      await this.openMovements(p);
    } else if (actionId === 'delete' && can('services.delete_package')) {
      this.deleteTarget = p;
    }
  }

  /** Open the voucher's ledger and load it. The three states are painted, not only the happy one. */
  private async openMovements(p: Package): Promise<void> {
    this.movementsOf = { id: p.id, name: p.name };
    this.movements = [];
    this.movementsError = '';
    this.movementsLoading = true;
    try {
      this.movements =
        (await erplora().queryAll<Movement>('services.packages.redemption_history', { package_id: p.id })) ?? [];
    } catch (e) {
      this.movementsError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorMovements'));
    } finally {
      this.movementsLoading = false;
    }
  }

  /** Back to a clean CREATE form. */
  cancelEdit(): void {
    this.editingId = null;
    this.form = { ...EMPTY_FORM };
    this.items = [{ serviceId: '', sessions: '1' }];
    this.formError = '';
  }

  /** The header fields as the commands want them: percent OR minor units by `discount_type`. */
  private headerPayload(): Record<string, unknown> {
    const fixed = this.form.discountType === 'fixed';
    return {
      name: this.form.name.trim(),
      discount_type: fixed ? 'fixed' : 'percentage',
      discount_percent_bp: fixed ? null : toBasisPoints(this.form.discountValue),
      discount_amount_cents: fixed ? toMinorOrNull(this.form.discountValue) ?? 0 : null,
      fixed_price: toMinorOrNull(this.form.fixedPrice),
      validity_days: toIntOrNull(this.form.validityDays),
      max_uses: toIntOrNull(this.form.maxUses),
    };
  }

  /** Submit: create (header + lines) OR update (header, partial door `records.package.patch`). */
  async save(ev: Event): Promise<void> {
    ev.preventDefault();
    const required = this.editingId ? 'services.change_package' : 'services.add_package';
    if (!can(required) || !this.form.name.trim()) return;
    const t = (k: string): string => erplora().t(CATALOG, k);
    const header = this.headerPayload();
    const lines = this.items
      .filter((l) => l.serviceId)
      .map((l) => ({ service_id: l.serviceId, quantity: Math.max(1, Math.round(Number(l.sessions) || 1)) * SESSION_SCALE }));
    if (!this.editingId && lines.length === 0) {
      // A voucher for nothing: the server would accept the header, the customer would buy air.
      this.formError = t('ui.errorPackageNoLines');
      return;
    }
    this.saving = true;
    this.formError = '';
    try {
      if (this.editingId) {
        // The update schema wants numbers, not nulls, for the two discount columns: the one that
        // does not apply is 0 (the type says which one counts).
        await erplora().command('services.packages.update', {
          package_id: this.editingId,
          ...header,
          discount_percent_bp: header.discount_percent_bp ?? 0,
          discount_amount_cents: header.discount_amount_cents ?? 0,
        });
      } else {
        await erplora().command('services.packages.create', { ...header, items: lines });
      }
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, t('ui.errorSavePackage'));
    } finally {
      this.saving = false;
    }
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget;
    if (!target || !can('services.delete_package')) return;
    this.saving = true;
    try {
      await erplora().command('services.packages.delete', { package_id: target.id });
      this.deleteTarget = null;
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorDeletePackage'));
      this.deleteTarget = null;
    } finally {
      this.saving = false;
    }
  }

  private renderDeleteConfirm() {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    return html`<ion-modal .isOpen=${!!this.deleteTarget} @ionModalDidDismiss=${() => (this.deleteTarget = null)}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t('ui.deletePackageTitle')}</ion-title></ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap"><b>${this.deleteTarget?.name ?? ''}</b> — ${t('ui.deletePackageHint', { count: Number(this.deleteTarget?.items ?? 0) || 0 })}</ion-label>
          </ion-item>
        </ion-list>
        <ion-button class="ion-margin-top" expand="block" color="danger" ?disabled=${this.saving} @click=${() => this.confirmDelete()}>${t('ui.actionDelete')}</ion-button>
        <ion-button expand="block" fill="outline" ?disabled=${this.saving} @click=${() => (this.deleteTarget = null)}>${t('ui.btnCancel')}</ion-button>
      </ion-content>
    </ion-modal>`;
  }

  /** A movement's date, in the hub's locale. An unparseable or absent stamp prints as «—». */
  private stamp(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleString(erplora().locale, { dateStyle: 'short', timeStyle: 'short' });
  }

  private renderMovement(m: Movement) {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const refunded = m.movement === 'refunded';
    return html`<ion-item class="movement">
      <ion-label class="ion-text-wrap">
        <h3>
          <ok-status-pill size="sm" tone=${refunded ? 'warning' : m.movement === 'released' ? 'neutral' : m.movement === 'held' ? 'info' : 'success'}>${t(`ui.movement.${m.movement}`)}</ok-status-pill>
          ${m.service_name ?? t('ui.movementNoService')}
        </h3>
        <p>${this.stamp(m.redeemed_at)} · ${t('ui.movementCustomer')}: ${m.customer_id}${m.sale_id ? html` · ${t('ui.movementSale')}: ${m.sale_id}` : nothing}</p>
        ${refunded
          ? html`<p class="refund">
              ${t('ui.movementRefundedBy', { who: m.refunded_by ?? '—', when: this.stamp(m.refunded_at) })}
              · ${t('ui.movementRefundDoc')}: ${m.refund_ref ?? '—'}
              ${m.refund_note ? html` · ${m.refund_note}` : nothing}
            </p>
            ${Number(m.refund_expired)
              ? html`<ok-inline-feedback tone="warning" icon="alert-circle-outline">${t('ui.movementRefundedExpired')}</ok-inline-feedback>`
              : nothing}`
          : nothing}
      </ion-label>
    </ion-item>`;
  }

  private renderMovements() {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    return html`<ion-modal .isOpen=${!!this.movementsOf} @ionModalDidDismiss=${() => (this.movementsOf = null)}>
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-title>${t('ui.movementsTitle')}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click=${() => (this.movementsOf = null)}>${t('ui.btnClose')}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <p><b>${this.movementsOf?.name ?? ''}</b> — ${t('ui.movementsHint')}</p>
        ${this.movementsError
          ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.movementsError}</ok-inline-feedback>`
          : this.movementsLoading
            ? html`<ok-inline-feedback tone="neutral" icon="time-outline">${t('ui.loading')}</ok-inline-feedback>`
            : this.movements.length === 0
              ? html`<ok-inline-feedback tone="neutral" icon="information-circle-outline">${t('ui.emptyMovements')}</ok-inline-feedback>`
              : html`<ion-list lines="full">${this.movements.map((m) => this.renderMovement(m))}</ion-list>`}
      </ion-content>
    </ion-modal>`;
  }

  private renderLines() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return html`<p class="lines-title">${t('ui.packageLinesTitle')}</p>
      ${this.items.map((line, i) => html`<div class="line">
        <ion-select fill="outline" label-placement="floating" label=${t('ui.colService')} .value=${line.serviceId} @ionChange=${(e: any) => this.setItem(i, { serviceId: e.target.value })}>
          ${this.services.map((s) => html`<ion-select-option .value=${s.id}>${s.name} · ${erplora().formatMoney(Number(s.price) || 0)}</ion-select-option>`)}
        </ion-select>
        <ion-input fill="outline" label-placement="floating" label=${t('ui.colSessions')} type="number" min="1" step="1" .value=${line.sessions} @ionInput=${(e: any) => this.setItem(i, { sessions: e.target.value })}></ion-input>
        <ion-button fill="clear" size="small" aria-label=${t('ui.removeLine')} @click=${() => this.removeItem(i)}><ion-icon slot="icon-only" name="close-outline"></ion-icon></ion-button>
      </div>`)}
      <ion-button fill="outline" size="small" @click=${() => this.addItem()}>${t('ui.addLine')}</ion-button>`;
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    const fixed = this.form.discountType === 'fixed';
    return html`<div class="page">
      ${this.formError ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : nothing}
      ${this.ctrl?.error ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : nothing}
      <ok-data-table .serverSide=${true} .fill=${true} .views=${true} .addable=${can('services.add_package')} .cardTitle=${(row: Record<string, unknown>) => String(row.name ?? '')} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? 'asc'} .searchable=${true} .searchPlaceholder=${t('ui.searchPackagePlaceholder')} .actions=${this.actions} .rowClickable=${true} .emptyMessage=${this.ctrl?.loading ? t('ui.loading') : t('ui.emptyPackages')} @rowAction=${(e: CustomEvent<{ actionId: string; row: Record<string, unknown> }>) => this.onRowAction(e)} @rowClick=${(e: CustomEvent<{ row: Record<string, unknown> }>) => this.onRowAction({ detail: { actionId: 'edit', row: e.detail.row } } as CustomEvent<{ actionId: string; row: Record<string, unknown> }>)}
 @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)} @pageSizeChange=${(e: CustomEvent<number>) => this.ctrl.setPageSize(e.detail)} @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)} @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)} @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.ctrl.setFilter(e.detail.col, e.detail.value)}>
        <form slot="create" class="form" @submit=${(e: Event) => this.save(e)}>
          ${this.editingId
            ? html`<ok-inline-feedback tone="info" icon="create-outline">
                <b>${t('ui.editingPackageTitle')}</b> — ${this.form.name}
                <ion-button size="small" fill="clear" @click=${() => this.cancelEdit()}>${t('ui.editingCancel')}</ion-button>
              </ok-inline-feedback>`
            : nothing}
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colName')} .value=${this.form.name} @ionInput=${(e: any) => (this.form = { ...this.form, name: e.target.value })}></ion-input>
          <ion-select fill="outline" label-placement="floating" label=${t('ui.colDiscountType')} .value=${this.form.discountType} @ionChange=${(e: any) => (this.form = { ...this.form, discountType: e.target.value })}>
            <ion-select-option value="percentage">${t('ui.discountType.percentage')}</ion-select-option>
            <ion-select-option value="fixed">${t('ui.discountType.fixed')}</ion-select-option>
          </ion-select>
          <ion-input fill="outline" label-placement="floating" label=${fixed ? t('ui.colDiscountAmount') : t('ui.colDiscountPercent')} type="text" inputmode="decimal" .value=${this.form.discountValue} @ionInput=${(e: any) => (this.form = { ...this.form, discountValue: e.target.value })}></ion-input>
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colFixedPrice')} helper-text=${t('ui.fixedPriceHelp')} type="text" inputmode="decimal" .value=${this.form.fixedPrice} @ionInput=${(e: any) => (this.form = { ...this.form, fixedPrice: e.target.value })}></ion-input>
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colValidityDays')} helper-text=${t('ui.validityHelp')} type="number" min="1" step="1" .value=${this.form.validityDays} @ionInput=${(e: any) => (this.form = { ...this.form, validityDays: e.target.value })}></ion-input>
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colMaxUses')} helper-text=${t('ui.maxUsesHelp')} type="number" min="1" step="1" .value=${this.form.maxUses} @ionInput=${(e: any) => (this.form = { ...this.form, maxUses: e.target.value })}></ion-input>
          ${this.editingId
            ? html`<ok-inline-feedback tone="neutral" icon="information-circle-outline">${t('ui.packageLinesFixed')}</ok-inline-feedback>`
            : this.renderLines()}
          <ion-button type="submit" ?disabled=${this.saving || !this.form.name}>${this.saving ? t('ui.btnSaving') : this.editingId ? t('ui.btnSave') : t('ui.btnAdd')}</ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
      ${this.renderMovements()}
    </div>`;
  }
}

define('erp-services-packages', ErpServicesPackages);
