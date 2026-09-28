import { LitElement, html, css, nothing } from 'lit';
import type { PropertyValues } from 'lit';
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
import { ionTone } from '../../lib/ion-tone';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// «Packages» view of the services module (services#4): the CRUD of packages/vouchers (bonos) that
// existed only as commands. Same data-table pattern as the rest of the Hub. Lines (services +
// sessions) are part of `services.packages.create` (WASM handler); the runtime has no line-edit
// command, so «edit» changes the HEADER (name, discount, validity, uses) — the market's usual
// shape too (Fresha/Vagaro vouchers: edit price/validity, lines are the voucher's identity).

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  /** ADR-0127: `undefined` when the owner module is not in this hub. Optional in the type because an
   *  older shell may not carry it; then the name simply stays the id. */
  queryOptional?<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T | undefined>;
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
  release_reason: string;
  /** services#118: an `adjusted` movement is a courtesy, not a session — who gave it, how much, why.
   *  0/'' on a session. */
  created_by?: string | null;
  uses_delta?: number;
  days_delta?: number;
  adjust_reason?: string;
  movement: 'held' | 'consumed' | 'released' | 'expired' | 'refunded' | 'adjusted' | string;
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

/**
 * The name of `id` in an answer of `customers.get` or `hub.users.list` — or `null`.
 *
 * Only the row whose `id` IS the one asked for counts (services#121): a name is never painted for
 * an id it was not answered for. The dispatcher already scopes `customers.get` to this hub; this is
 * the screen's own half of that promise, so a wrong row can never become «this customer».
 */
function nameOf(answer: unknown, id: string): string | null {
  const list = Array.isArray(answer)
    ? answer
    : Array.isArray((answer as { rows?: unknown[] } | null)?.rows)
      ? (answer as { rows: unknown[] }).rows
      : [];
  const row = list.find((r) => String((r as { id?: unknown } | null)?.id ?? '') === id) as { name?: unknown } | undefined;
  const name = String(row?.name ?? '').trim();
  return name || null;
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

/**
 * Row of `services.packages.orphans` — a voucher whose customer sheet no longer exists
 * (services#81).
 *
 * `has_value` and `is_expired` are the QUERY's own derived fields, not something re-derived here: a
 * screen that recomputed «is there anything left?» from `remaining` and `max_uses` would be a
 * second implementation of a rule that already lives in SQL, free to drift from it. There is no
 * customer name anywhere in this shape and there must not be: the sheet was deleted — in the
 * `customer.anonymized` case precisely because somebody asked for their data to be erased — so the
 * opaque id is all this module has and all it should show.
 */
interface OrphanGrant {
  grant_id: string;
  package_id: string;
  package_name: string;
  customer_id: string;
  customer_deleted_at: string | null;
  granted_at: string | null;
  amount_cents: number;
  max_uses: number | null;
  used: number;
  remaining: number | null;
  has_value: number;
  expires_at: string | null;
  is_expired: number;
}

/**
 * Row of `services.packages.grants` — one voucher SOLD of a catalogue voucher, live or voided
 * (services#82).
 *
 * `status` and `can_void` are the QUERY's own derived fields: whether a sale may still be voided is
 * the same rule `_void_grant.sql` enforces (live, nothing spent or held), and a screen that
 * recomputed it from `used` would be a second copy free to drift from it.
 */
interface SoldGrant {
  grant_id: string;
  package_id: string;
  customer_id: string;
  granted_at: string | null;
  sale_id: string | null;
  amount_cents: number;
  max_uses: number | null;
  used: number;
  remaining: number | null;
  status: 'active' | 'voided' | string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string;
  can_void: number;
  /** services#118: `max_uses`, `remaining` and `expires_at` already include the courtesies given
   *  after the sale; these say how much of it was given, and `can_adjust` is the query's rule for
   *  offering «Adjust» (live, with a session limit or an expiry to move). */
  expires_at?: string | null;
  adjusted_uses?: number;
  adjusted_days?: number;
  can_adjust?: number;
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
    .more { font-size: 0.82rem; opacity: 0.75; margin: 0.6rem 0 0; text-align: center; }
  `;

  @state() form: PackageForm = { ...EMPTY_FORM };
  @state() items: LineDraft[] = [{ serviceId: '', sessions: '1' }];
  @state() services: ServiceOption[] = [];
  @state() saving = false;
  @state() formError = '';
  /** What went wrong in a ROW action (delete, confirmed on the page): no panel is open then, so it
   *  is painted on the page. `formError` is only what the panel's form was refused (pm#478). */
  @state() pageError = '';
  /** Package being edited (header only); `null` = create mode. */
  @state() editingId: string | null = null;

  /** pm#450: whether the table's panel HEADER already carries the editing title (OutfitKit
   *  ≥ 0.1.94, outfitkit#150). Set only after checking the rendered dialog — never assumed — so
   *  an older shell (hub:stable ships 0.1.73, which ignores the `title` and keeps «New») still
   *  gets the fallback line in the form body. */
  @state() editTitleInHeader = false;
  /** pm#459: generation of the last edit opening; a stale wait (package fetch, table render) of an
   *  earlier one sees a newer number and gives up, so the LAST tap wins. */
  private editSeq = 0;
  @state() deleteTarget: Package | null = null;
  /** Voucher whose ledger is open; `null` = the sheet is closed. */
  @state() movementsOf: { id: string; name: string } | null = null;
  @state() movements: Movement[] = [];
  /** Movements the voucher has IN TOTAL, which is almost never how many are on screen. */
  @state() movementsTotal = 0;
  @state() movementsLoading = false;
  @state() movementsError = '';

  @state() orphansOpen = false;
  @state() orphans: OrphanGrant[] = [];
  @state() orphansTotal = 0;
  @state() orphansLoading = false;
  @state() orphansError = '';

  /**
   * Names of the people the voucher sheets mention (services#121), keyed by the id ASKED for:
   * absent = never asked, `undefined` = on its way, `null` = cannot be had (the id is the fallback),
   * a string = the name. Read again on every opening of a sheet — a renamed customer is not kept.
   */
  @state() customerNames: ReadonlyMap<string, string | null | undefined> = new Map();
  /** The hub's people by user id (`hub.users.list`); `undefined` while on its way, empty when it
   *  failed (then the id is the fallback), `null` when nobody asked yet. */
  @state() userNames: ReadonlyMap<string, string> | null | undefined = null;

  /** Voucher whose SALES are listed (services#82); `null` = the sheet is closed. */
  @state() grantsOf: { id: string; name: string } | null = null;
  @state() grants: SoldGrant[] = [];
  @state() grantsTotal = 0;
  @state() grantsLoading = false;
  @state() grantsError = '';
  /** Sale being voided: the sheet shows its confirmation instead of the list. */
  @state() voidTarget: SoldGrant | null = null;
  @state() voidReason = '';
  @state() voiding = false;
  @state() voidError = '';
  /** Sale being adjusted (services#118): the sheet shows the courtesy form instead of the list. */
  @state() adjustTarget: SoldGrant | null = null;
  @state() adjustUses = '';
  @state() adjustDays = '';
  @state() adjustReason = '';
  @state() adjusting = false;
  @state() adjustError = '';

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
      // Who bought this voucher (services#82) — the same permission, because it shows the same
      // balances; voiding one of those sales asks for its own permission on top.
      ...(can('services.view_package_balance') ? [{ id: 'grants', label: t('ui.actionGrants'), icon: 'people-outline' }] : []),
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

  private dataTable(): {
    open(p?: 'filters' | 'create' | 'edit', opts?: { title?: string }): void;
    close(): void;
    updateComplete?: Promise<unknown>;
    shadowRoot: ShadowRoot | null;
  } | null {
    return this.renderRoot.querySelector('ok-data-table') as
      | {
        open(p?: 'filters' | 'create' | 'edit', opts?: { title?: string }): void;
        close(): void;
        updateComplete?: Promise<unknown>;
        shadowRoot: ShadowRoot | null;
      }
      | null;
  }

  /** pm#450: the table's «Add» emits no event and keeps our form state; after an edit it would
   *  show the edited record under a «New» header, and the submit would UPDATE it. */
  private onTableClick(e: Event): void {
    const addId = 'services-packages-table-add';
    if (!e.composedPath().some((n) => n instanceof HTMLElement && n.dataset.testid === addId)) return;
    if (this.editingId) this.cancelEdit();
    // pm#459: an edit still waiting for its package has no `editingId` yet; the tap on «Add» must
    // outrank that reply all the same. Nothing is being edited, so the draft stays.
    else this.editSeq++;
  }

  /** Wired natively, not with a Lit `@click` on the tag: `<ok-data-table>` carries `testid`, not
   *  `data-testid` (outfitkit#143), and a template binding would read as an action element that
   *  demands one. */
  firstUpdated(): void {
    const table = this.renderRoot.querySelector('ok-data-table');
    table?.addEventListener('click', (e) => this.onTableClick(e));
    // services#110: closing the panel (X, backdrop, Escape — outfitkit#195, ≥0.1.97) retires the
    // edit still loading, so its late reply neither reopens the panel nor fills the form. Older
    // shells never emit it and keep today's behaviour.
    table?.addEventListener('panelClose', () => this.editSeq++);
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
      const seq = ++this.editSeq;
      this.formError = '';
      let full: Record<string, unknown> = row;
      try {
        const rows = await erplora().query<Record<string, unknown>[]>('services.packages.get', { package_id: p.id });
        if (Array.isArray(rows) && rows[0]) full = rows[0];
      } catch {
        /* the list row is enough for what the header form shows */
      }
      if (seq !== this.editSeq) return;
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
      const title = `${erplora().t(CATALOG, 'ui.editingPackageTitle')} — ${this.form.name}`;
      const table = this.dataTable();
      table?.open('edit', { title });
      await table?.updateComplete;
      if (seq !== this.editSeq) return;
      // OutfitKit < 0.1.94 ignores the title and keeps «New»: only drop the in-form line when the
      // header REALLY carries it (the dialog is labelled with it).
      this.editTitleInHeader = table?.shadowRoot?.querySelector('[role="dialog"]')?.getAttribute('aria-label') === title;
    } else if (actionId === 'movements' && can('services.view_package_balance')) {
      await this.openMovements(p);
    } else if (actionId === 'grants' && can('services.view_package_balance')) {
      await this.openGrants(p);
    } else if (actionId === 'delete' && can('services.delete_package')) {
      this.deleteTarget = p;
      this.pageError = '';
    }
  }

  /** Open the voucher's ledger and load its FIRST page. The three states are painted, not only the
   *  happy one. Reopening starts from the top: the sheet is a fresh read of the ledger, never the
   *  previous one with a second copy stacked underneath. */
  private async openMovements(p: Package): Promise<void> {
    this.movementsOf = { id: p.id, name: p.name };
    this.forgetNames();
    this.movements = [];
    this.movementsTotal = 0;
    this.movementsError = '';
    await this.loadMovementsPage();
  }

  /**
   * One more page of the ledger, ADDED to what is on screen (services#76).
   *
   * 🔴 It is `queryPage`, not `queryAll`, and that is the whole issue: `queryAll` walks EVERY page
   * of a list query and hands back the lot. For a voucher created last week that is the same
   * thing; for the star voucher of a salon after two years — N customers × `max_uses` sessions,
   * plus the releases, the expiries and the refunds, which count too because the query includes
   * the soft-deleted rows on purpose — it is hundreds or thousands of rows in one response, on a
   * tablet. The page size is the module's own (`list.page_size` in the manifest): the screen does
   * not repeat the number, it just asks for what comes after what it already has.
   */
  async loadMoreMovements(): Promise<void> {
    if (this.movementsLoading || this.movements.length >= this.movementsTotal) return;
    await this.loadMovementsPage();
  }

  private async loadMovementsPage(): Promise<void> {
    const target = this.movementsOf;
    if (!target) return;
    this.movementsLoading = true;
    this.movementsError = '';
    try {
      const page = await erplora().queryPage<Movement>('services.packages.redemption_history', {
        offset: this.movements.length,
        params: { package_id: target.id },
      });
      // The sheet may have been closed, moved to another voucher or REOPENED (a new opening object,
      // pm#459) while the page was in flight; painting it then would stack a stale ledger on it.
      if (this.movementsOf !== target) return;
      const rows = page?.rows ?? [];
      this.movements = [...this.movements, ...rows];
      this.movementsTotal = page?.total ?? this.movements.length;
      this.resolveNames(
        rows.map((m) => m.customer_id),
        rows.map((m) => (m.movement === 'adjusted' ? m.created_by ?? null : m.refunded_by)),
      );
    } catch (e) {
      if (this.movementsOf !== target) return; // pm#459: another opening owns the sheet now
      this.movementsError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorMovements'));
    } finally {
      if (this.movementsOf === target) this.movementsLoading = false;
    }
  }

  /**
   * Open the rescue drawer (services#81).
   *
   * It reloads from scratch every time rather than keeping what it had: the set only changes when a
   * customer is deleted somewhere else in the hub, so a stale list is the one thing this screen
   * cannot afford — it exists to be the single place where this money is visible.
   */
  async openOrphans(): Promise<void> {
    this.orphansOpen = true;
    this.orphans = [];
    this.orphansTotal = 0;
    this.orphansError = '';
    await this.loadOrphansPage();
  }

  /** One more page, ADDED to what is on screen — same contract as the movements ledger. */
  async loadMoreOrphans(): Promise<void> {
    if (this.orphansLoading || this.orphans.length >= this.orphansTotal) return;
    await this.loadOrphansPage();
  }

  private async loadOrphansPage(): Promise<void> {
    this.orphansLoading = true;
    this.orphansError = '';
    try {
      // 🔴 NO `params`, and that is the entire point of this query: every other door into a voucher
      // is keyed by `customer_id`, and the customer is exactly what stopped existing.
      const page = await erplora().queryPage<OrphanGrant>('services.packages.orphans', {
        offset: this.orphans.length,
      });
      if (!this.orphansOpen) return; // closed while the page was in flight
      this.orphans = [...this.orphans, ...(page?.rows ?? [])];
      this.orphansTotal = page?.total ?? this.orphans.length;
    } catch (e) {
      this.orphansError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorOrphans'));
    } finally {
      this.orphansLoading = false;
    }
  }

  /** Open the sales of a voucher (services#82) from its FIRST page — same contract as the ledger:
   *  a page at a time, three states painted, a reopening reads again instead of stacking. */
  private async openGrants(p: Package): Promise<void> {
    this.grantsOf = { id: p.id, name: p.name };
    this.forgetNames();
    this.voidTarget = null;
    this.adjustTarget = null;
    await this.reloadGrants();
  }

  private async reloadGrants(): Promise<void> {
    this.grants = [];
    this.grantsTotal = 0;
    this.grantsError = '';
    await this.loadGrantsPage();
  }

  async loadMoreGrants(): Promise<void> {
    if (this.grantsLoading || this.grants.length >= this.grantsTotal) return;
    await this.loadGrantsPage();
  }

  private async loadGrantsPage(): Promise<void> {
    const target = this.grantsOf;
    if (!target) return;
    this.grantsLoading = true;
    this.grantsError = '';
    try {
      const page = await erplora().queryPage<SoldGrant>('services.packages.grants', {
        offset: this.grants.length,
        params: { package_id: target.id },
      });
      if (this.grantsOf !== target) return; // pm#459: another opening owns the sheet now
      const rows = page?.rows ?? [];
      this.grants = [...this.grants, ...rows];
      this.grantsTotal = page?.total ?? this.grants.length;
      this.resolveNames(rows.map((g) => g.customer_id), rows.map((g) => g.voided_by));
    } catch (e) {
      if (this.grantsOf !== target) return;
      this.grantsError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorGrants'));
    } finally {
      if (this.grantsOf === target) this.grantsLoading = false;
    }
  }

  private forgetNames(): void {
    this.customerNames = new Map();
    this.userNames = null;
  }

  /**
   * Resolve the names of a page just painted (services#121), through the doors the catalogue
   * already uses — no contract of its own:
   *   * customers through `customers.get` on the OPTIONAL door (ADR-0127): `services` does not
   *     depend on `customers`, so «not installed» answers `undefined` and the id stays. Asked once
   *     per distinct id not already known, and not at all without `customers.view_customer` (the
   *     runtime would refuse it anyway);
   *   * employees through `hub.users.list`, the core's reserved namespace — the same door
   *     `kitchen`, `sales` and `appointments` use — once per opening, and only if someone is named.
   * Every failure degrades to the id: the sheet never breaks for want of a name.
   */
  private resolveNames(customerIds: (string | null)[], userIds: (string | null)[]): void {
    const known = this.customerNames;
    const pending = [...new Set(customerIds.filter((id): id is string => !!id))].filter((id) => !known.has(id));
    if (pending.length) {
      const client = erplora();
      const allowed = can('customers.view_customer') && typeof client.queryOptional === 'function';
      this.customerNames = new Map([...known, ...pending.map((id): [string, null | undefined] => [id, allowed ? undefined : null])]);
      if (allowed) {
        for (const id of pending) {
          void client
            .queryOptional!<unknown>('customers.get', { customer_id: id })
            .then((answer) => nameOf(answer, id), () => null)
            .then((name) => {
              this.customerNames = new Map(this.customerNames).set(id, name);
            });
        }
      }
    }
    if (this.userNames === null && userIds.some((id) => !!id)) {
      this.userNames = undefined;
      void erplora()
        .query<unknown>('hub.users.list')
        .then(
          (answer) => {
            const names = new Map<string, string>();
            for (const person of Array.isArray(answer) ? answer : []) {
              const id = String((person as { id?: unknown } | null)?.id ?? '');
              const name = nameOf([person], id);
              if (id && name) names.set(id, name);
            }
            return names;
          },
          () => new Map<string, string>(),
        )
        .then((names) => {
          this.userNames = names;
        });
    }
  }

  /** What to paint for a customer id: its name, «loading name…» while on its way, else the id. */
  private customerLabel(id: string): string {
    const name = this.customerNames.get(id);
    if (name === undefined && this.customerNames.has(id)) return erplora().t(CATALOG, 'ui.nameLoading');
    return name ?? id;
  }

  /** Same for an employee (who voided, who gave a session back); `—` when nobody is recorded. */
  private userLabel(id: string | null): string {
    if (!id) return '—';
    if (this.userNames === undefined) return erplora().t(CATALOG, 'ui.nameLoading');
    return this.userNames?.get(id) ?? id;
  }

  private closeGrants(): void {
    this.grantsOf = null;
    this.voidTarget = null;
    this.adjustTarget = null;
  }

  /** Ask to void a sale: the sheet swaps its list for the confirmation, reason still blank. */
  askVoid(grant: SoldGrant): void {
    this.adjustTarget = null;
    this.voidTarget = grant;
    this.voidReason = '';
    this.voidError = '';
  }

  cancelVoid(): void {
    this.voidTarget = null;
    this.voidError = '';
  }

  /**
   * Void the sale being confirmed. The reason is mandatory — a void is an audit fact — so a blank
   * one is not even sent (the handler refuses it too). On success the list is READ AGAIN rather
   * than patched: the server is who says what the sale looks like now. A refusal stays on the
   * confirmation, where the person is looking, with the module's own sentence for its code.
   */
  async confirmVoid(): Promise<void> {
    const target = this.voidTarget;
    const reason = this.voidReason.trim();
    if (!target || !reason || this.voiding || !can('services.void_grant')) return;
    this.voiding = true;
    this.voidError = '';
    try {
      await erplora().command('services.packages.void_grant', { grant_id: target.grant_id, reason });
      if (this.voidTarget !== target) return;
      this.voidTarget = null;
      await this.reloadGrants();
    } catch (e) {
      if (this.voidTarget !== target) return;
      this.voidError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorVoidGrant'));
    } finally {
      this.voiding = false;
    }
  }

  /** Ask to adjust a sale (services#118): the sheet swaps its list for the courtesy form, blank. */
  askAdjust(grant: SoldGrant): void {
    this.voidTarget = null;
    this.adjustTarget = grant;
    this.adjustUses = '';
    this.adjustDays = '';
    this.adjustReason = '';
    this.adjustError = '';
  }

  cancelAdjust(): void {
    this.adjustTarget = null;
    this.adjustError = '';
  }

  /**
   * What the form would send: whole numbers, 0 for a blank field AND for a half the voucher cannot
   * take (no sessions on an unlimited voucher, no days on one that never expires — the field is not
   * even painted, but a value typed for another sale must not travel). `null` when a field is not a
   * whole number ≥ 0 or nothing is added: the button stays disabled.
   */
  private adjustAmounts(): { uses: number; days: number } | null {
    const target = this.adjustTarget;
    if (!target) return null;
    const read = (raw: string, allowed: boolean): number | null => {
      if (!allowed) return 0;
      const text = raw.trim();
      if (!text) return 0;
      return /^\d+$/.test(text) ? Number(text) : null;
    };
    const uses = read(this.adjustUses, target.max_uses != null);
    const days = read(this.adjustDays, target.expires_at != null);
    if (uses === null || days === null || uses + days === 0) return null;
    return { uses, days };
  }

  /**
   * Give the courtesy. The reason is mandatory and something must be added — a blank form is not
   * even sent (the handler refuses it too). On success the list is READ AGAIN: the server says what
   * the voucher is worth now. A refusal stays on the form with the module's own sentence.
   */
  async confirmAdjust(): Promise<void> {
    const target = this.adjustTarget;
    const reason = this.adjustReason.trim();
    const amounts = this.adjustAmounts();
    if (!target || !reason || !amounts || this.adjusting || !can('services.adjust_grant')) return;
    this.adjusting = true;
    this.adjustError = '';
    try {
      await erplora().command('services.packages.adjust_grant', {
        grant_id: target.grant_id,
        uses_delta: amounts.uses,
        days_delta: amounts.days,
        reason,
      });
      if (this.adjustTarget !== target) return;
      this.adjustTarget = null;
      await this.reloadGrants();
    } catch (e) {
      if (this.adjustTarget !== target) return;
      this.adjustError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorAdjustGrant'));
    } finally {
      this.adjusting = false;
    }
  }

  /** Back to a clean CREATE form. */
  cancelEdit(): void {
    this.editSeq++;
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
    this.pageError = ''; // a save is the next thing the person did: an older row refusal is stale
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
      this.pageError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorDeletePackage'));
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
        <ion-button class="ion-margin-top" expand="block" data-testid="services-packages-delete-submit" style=${ionTone('solid', 'danger')} ?disabled=${this.saving} @click=${() => this.confirmDelete()}>${t('ui.actionDelete')}</ion-button>
        <ion-button expand="block" fill="outline" data-testid="services-packages-delete-cancel" ?disabled=${this.saving} @click=${() => (this.deleteTarget = null)}>${t('ui.btnCancel')}</ion-button>
      </ion-content>
    </ion-modal>`;
  }

  /** A day (an expiry), in the hub's locale. */
  private day(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(erplora().locale, { dateStyle: 'short' });
  }

  /** A movement's date, in the hub's locale. An unparseable or absent stamp prints as «—». */
  private stamp(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleString(erplora().locale, { dateStyle: 'short', timeStyle: 'short' });
  }

  /** The colour of a movement. `expired` shares `released`'s neutral tone — the session is back
   *  either way — and only the LABEL tells a timeout from the cashier's undo (migration 014). */
  private movementTone(movement: string): string {
    switch (movement) {
      case 'refunded':
        return 'warning';
      case 'released':
      case 'expired':
        return 'neutral';
      case 'held':
      case 'adjusted':
        return 'info';
      default:
        return 'success';
    }
  }

  private renderMovement(m: Movement) {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const refunded = m.movement === 'refunded';
    if (m.movement === 'adjusted') {
      return html`<ion-item class="movement">
        <ion-label class="ion-text-wrap">
          <h3>
            <ok-status-pill size="sm" tone=${this.movementTone(m.movement)}>${t('ui.movement.adjusted')}</ok-status-pill>
            ${t('ui.movementAdjusted', { uses: Number(m.uses_delta) || 0, days: Number(m.days_delta) || 0 })}
          </h3>
          <p>${this.stamp(m.redeemed_at)} · ${t('ui.movementCustomer')}: ${this.customerLabel(m.customer_id)}</p>
          <p class="refund">${t('ui.movementAdjustedBy', { who: this.userLabel(m.created_by ?? null) })}${m.adjust_reason ? html` · ${m.adjust_reason}` : nothing}</p>
        </ion-label>
      </ion-item>`;
    }
    return html`<ion-item class="movement">
      <ion-label class="ion-text-wrap">
        <h3>
          <ok-status-pill size="sm" tone=${this.movementTone(m.movement)}>${t(`ui.movement.${m.movement}`)}</ok-status-pill>
          ${m.service_name ?? t('ui.movementNoService')}
        </h3>
        <p>${this.stamp(m.redeemed_at)} · ${t('ui.movementCustomer')}: ${this.customerLabel(m.customer_id)}${m.sale_id ? html` · ${t('ui.movementSale')}: ${m.sale_id}` : nothing}</p>
        ${refunded
          ? html`<p class="refund">
              ${t('ui.movementRefundedBy', { who: this.userLabel(m.refunded_by), when: this.stamp(m.refunded_at) })}
              · ${t('ui.movementRefundDoc')}: ${m.refund_ref ?? '—'}
              ${m.refund_note ? html` · ${m.refund_note}` : nothing}
            </p>
            ${Number(m.refund_expired)
              ? html`<ok-inline-feedback data-testid=${`services-packages-movement-refund-expired-${m.redemption_id}`} tone="warning" icon="alert-circle-outline">${t('ui.movementRefundedExpired')}</ok-inline-feedback>`
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
            <ion-button data-testid="services-packages-movements-close" @click=${() => (this.movementsOf = null)}>${t('ui.btnClose')}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <p><b>${this.movementsOf?.name ?? ''}</b> — ${t('ui.movementsHint')}</p>
        <!-- The error goes ABOVE the list, not instead of it: a page that failed to load must not
             take away the movements already on screen. -->
        ${this.movementsError
          ? html`<ok-inline-feedback data-testid="services-packages-movements-error" tone="danger" icon="alert-circle-outline">${this.movementsError}</ok-inline-feedback>`
          : nothing}
        ${this.movements.length === 0
          ? this.movementsLoading
            ? html`<ok-inline-feedback data-testid="services-packages-movements-loading" tone="neutral" icon="time-outline">${t('ui.loading')}</ok-inline-feedback>`
            : this.movementsError
              ? nothing
              : html`<ok-inline-feedback data-testid="services-packages-movements-empty" tone="neutral" icon="information-circle-outline">${t('ui.emptyMovements')}</ok-inline-feedback>`
          : html`<ion-list lines="full">${this.movements.map((m) => this.renderMovement(m))}</ion-list>
              ${this.movements.length < this.movementsTotal
                ? html`<p class="more">${t('ui.movementsCount', { shown: this.movements.length, total: this.movementsTotal })}</p>
                    <ion-button expand="block" fill="clear" data-testid="services-packages-movements-more" ?disabled=${this.movementsLoading} @click=${() => this.loadMoreMovements()}>
                      ${this.movementsLoading ? t('ui.loading') : t('ui.movementsMore')}
                    </ion-button>`
                : nothing}`}
      </ion-content>
    </ion-modal>`;
  }

  private renderOrphan(o: OrphanGrant) {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    // `has_value` and `is_expired` come from the query; the screen only chooses the colour.
    const worthless = !Number(o.has_value);
    return html`<ion-item class="movement">
      <ion-label class="ion-text-wrap">
        <h3>
          <ok-status-pill size="sm" tone=${worthless ? 'neutral' : 'warning'}>
            ${worthless ? t('ui.orphanNoValue') : t('ui.orphanRemaining', { remaining: o.remaining ?? 0 })}
          </ok-status-pill>
          ${o.package_name}
        </h3>
        <p>
          ${erplora().formatMoney(Number(o.amount_cents) || 0)}
          · ${t('ui.orphanDeletedAt', { when: this.stamp(o.customer_deleted_at) })}
          ${Number(o.is_expired) ? html` · ${t('ui.orphanExpired')}` : nothing}
        </p>
        <!-- The opaque id, which is all there is: no name, no e-mail, no phone. It is the only
             handle that matches this voucher against the sale that paid for it. -->
        <p>${t('ui.orphanCustomerRef')}: ${o.customer_id}</p>
      </ion-label>
    </ion-item>`;
  }

  private renderOrphans() {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    return html`<ion-modal .isOpen=${this.orphansOpen} @ionModalDidDismiss=${() => (this.orphansOpen = false)}>
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-title>${t('ui.orphansTitle')}</ion-title>
          <ion-buttons slot="end">
            <ion-button data-testid="services-packages-orphans-close" @click=${() => (this.orphansOpen = false)}>${t('ui.btnClose')}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <p>${t('ui.orphansHint')}</p>
        <!-- The error goes ABOVE the list, not instead of it: a page that failed must not take away
             the rows already on screen. -->
        ${this.orphansError
          ? html`<ok-inline-feedback data-testid="services-packages-orphans-error" tone="danger" icon="alert-circle-outline">${this.orphansError}</ok-inline-feedback>`
          : nothing}
        ${this.orphans.length === 0
          ? this.orphansLoading
            ? html`<ok-inline-feedback data-testid="services-packages-orphans-loading" tone="neutral" icon="time-outline">${t('ui.loading')}</ok-inline-feedback>`
            : this.orphansError
              ? nothing
              : html`<ok-inline-feedback data-testid="services-packages-orphans-empty" tone="neutral" icon="information-circle-outline">${t('ui.emptyOrphans')}</ok-inline-feedback>`
          : html`<ion-list lines="full">${this.orphans.map((o) => this.renderOrphan(o))}</ion-list>
              ${this.orphans.length < this.orphansTotal
                ? html`<p class="more">${t('ui.orphansCount', { shown: this.orphans.length, total: this.orphansTotal })}</p>
                    <ion-button expand="block" fill="clear" data-testid="services-packages-orphans-more" ?disabled=${this.orphansLoading} @click=${() => this.loadMoreOrphans()}>
                      ${this.orphansLoading ? t('ui.loading') : t('ui.orphansMore')}
                    </ion-button>`
                : nothing}`}
      </ion-content>
    </ion-modal>`;
  }

  private renderGrant(g: SoldGrant) {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const voided = g.status === 'voided';
    // `can_void` comes from the query; the permission decides whether this person sees the button.
    const voidable = Number(g.can_void) === 1 && can('services.void_grant');
    // Same for «Adjust» (services#118): `can_adjust` from the query, the permission from the person.
    const adjustable = Number(g.can_adjust) === 1 && can('services.adjust_grant');
    const giftedUses = Number(g.adjusted_uses) || 0;
    const giftedDays = Number(g.adjusted_days) || 0;
    return html`<ion-item class="movement">
      <ion-label class="ion-text-wrap">
        <h3>
          <ok-status-pill size="sm" tone=${voided ? 'neutral' : 'success'}>${t(`ui.grantStatus.${g.status}`)}</ok-status-pill>
          ${t('ui.movementCustomer')}: ${this.customerLabel(g.customer_id)}
        </h3>
        <p>
          ${this.stamp(g.granted_at)} · ${erplora().formatMoney(Number(g.amount_cents) || 0)}
          · ${g.max_uses == null
            ? t('ui.grantUsesUnlimited', { used: Number(g.used) || 0 })
            : t('ui.grantUses', { used: Number(g.used) || 0, remaining: Number(g.remaining) || 0 })}
          ${g.sale_id ? html` · ${t('ui.movementSale')}: ${g.sale_id}` : nothing}
        </p>
        <p>
          ${g.expires_at ? t('ui.grantExpires', { when: this.day(g.expires_at) }) : t('ui.grantNoExpiry')}
          ${giftedUses || giftedDays ? html` · ${t('ui.grantAdjusted', { uses: giftedUses, days: giftedDays })}` : nothing}
        </p>
        ${voided
          ? html`<p class="refund">${t('ui.grantVoidedBy', { who: this.userLabel(g.voided_by), when: this.stamp(g.voided_at) })}${g.void_reason ? html` · ${g.void_reason}` : nothing}</p>`
          : nothing}
      </ion-label>
      ${adjustable
        ? html`<ion-button slot="end" size="small" fill="clear" data-testid=${`services-packages-grant-adjust-${g.grant_id}`} @click=${() => this.askAdjust(g)}>${t('ui.actionAdjustGrant')}</ion-button>`
        : nothing}
      ${voidable
        ? html`<ion-button slot="end" size="small" fill="clear" data-testid=${`services-packages-grant-void-${g.grant_id}`} style=${ionTone('text', 'danger')} @click=${() => this.askVoid(g)}>${t('ui.actionVoidGrant')}</ion-button>`
        : nothing}
    </ion-item>`;
  }

  /** The courtesy form (services#118): only the halves the voucher can take, a mandatory reason, and
   *  a preview of what the customer will have — the server re-computes it, this is for the eye. */
  private renderAdjustForm(g: SoldGrant) {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const amounts = this.adjustAmounts();
    const hasLimit = g.max_uses != null;
    const expires = g.expires_at != null;
    const newRemaining = hasLimit ? (Number(g.remaining) || 0) + (amounts?.uses ?? 0) : null;
    let newExpiry: string | null = null;
    if (expires) {
      const d = new Date(String(g.expires_at));
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() + (amounts?.days ?? 0));
        newExpiry = d.toISOString();
      }
    }
    return html`<p>${t('ui.adjustGrantHint', { customer: this.customerLabel(g.customer_id) })}</p>
      ${hasLimit
        ? html`<ion-input data-testid="services-packages-grant-adjust-uses" fill="outline" mode="md" label-placement="floating" label=${t('ui.adjustUsesLabel')} helper-text=${t('ui.adjustUsesHelp', { remaining: Number(g.remaining) || 0 })} type="number" inputmode="numeric" min="0" max="100" step="1" .value=${this.adjustUses} @ionInput=${(e: any) => (this.adjustUses = String(e.target.value ?? ''))}></ion-input>`
        : nothing}
      ${expires
        ? html`<ion-input data-testid="services-packages-grant-adjust-days" fill="outline" mode="md" label-placement="floating" label=${t('ui.adjustDaysLabel')} helper-text=${t('ui.adjustDaysHelp', { when: this.day(g.expires_at) })} type="number" inputmode="numeric" min="0" max="366" step="1" .value=${this.adjustDays} @ionInput=${(e: any) => (this.adjustDays = String(e.target.value ?? ''))}></ion-input>`
        : nothing}
      <ion-textarea data-testid="services-packages-grant-adjust-reason" fill="outline" mode="md" label-placement="floating" label=${t('ui.voidReasonLabel')} helper-text=${t('ui.adjustReasonHelp')} auto-grow maxlength="500" .value=${this.adjustReason} @ionInput=${(e: any) => (this.adjustReason = String(e.target.value ?? ''))}></ion-textarea>
      <ok-inline-feedback data-testid="services-packages-grant-adjust-preview" tone="info" icon="gift-outline">
        ${t('ui.adjustPreview', {
          remaining: newRemaining == null ? t('ui.adjustPreviewUnlimited') : newRemaining,
          when: newExpiry ? this.day(newExpiry) : t('ui.grantNoExpiry'),
        })}
      </ok-inline-feedback>
      ${this.adjustError
        ? html`<ok-inline-feedback data-testid="services-packages-grant-adjust-error" tone="danger" icon="alert-circle-outline">${this.adjustError}</ok-inline-feedback>`
        : nothing}
      <ion-button class="ion-margin-top" expand="block" data-testid="services-packages-grant-adjust-submit" ?disabled=${this.adjusting || !amounts || !this.adjustReason.trim()} @click=${() => this.confirmAdjust()}>
        ${this.adjusting ? t('ui.btnSaving') : t('ui.actionAdjustGrant')}
      </ion-button>
      <ion-button expand="block" fill="outline" data-testid="services-packages-grant-adjust-cancel" ?disabled=${this.adjusting} @click=${() => this.cancelAdjust()}>${t('ui.btnCancel')}</ion-button>`;
  }

  private renderVoidConfirm(g: SoldGrant) {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    return html`<p>${t('ui.voidGrantHint', { customer: this.customerLabel(g.customer_id), amount: erplora().formatMoney(Number(g.amount_cents) || 0) })}</p>
      <ion-textarea data-testid="services-packages-grant-void-reason" fill="outline" mode="md" label-placement="floating" label=${t('ui.voidReasonLabel')} helper-text=${t('ui.voidReasonHelp')} auto-grow maxlength="500" .value=${this.voidReason} @ionInput=${(e: any) => (this.voidReason = String(e.target.value ?? ''))}></ion-textarea>
      ${this.voidError
        ? html`<ok-inline-feedback data-testid="services-packages-grant-void-error" tone="danger" icon="alert-circle-outline">${this.voidError}</ok-inline-feedback>`
        : nothing}
      <ion-button class="ion-margin-top" expand="block" data-testid="services-packages-grant-void-submit" style=${ionTone('solid', 'danger')} ?disabled=${this.voiding || !this.voidReason.trim()} @click=${() => this.confirmVoid()}>
        ${this.voiding ? t('ui.btnVoiding') : t('ui.actionVoidGrant')}
      </ion-button>
      <ion-button expand="block" fill="outline" data-testid="services-packages-grant-void-cancel" ?disabled=${this.voiding} @click=${() => this.cancelVoid()}>${t('ui.btnCancel')}</ion-button>`;
  }

  private renderGrants() {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const confirming = this.voidTarget;
    const adjusting = this.adjustTarget;
    return html`<ion-modal .isOpen=${!!this.grantsOf} @ionModalDidDismiss=${() => this.closeGrants()}>
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-title>${confirming ? t('ui.voidGrantTitle') : adjusting ? t('ui.adjustGrantTitle') : t('ui.grantsTitle')}</ion-title>
          <ion-buttons slot="end">
            <ion-button data-testid="services-packages-grants-close" @click=${() => this.closeGrants()}>${t('ui.btnClose')}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        ${confirming
          ? this.renderVoidConfirm(confirming)
          : adjusting
          ? this.renderAdjustForm(adjusting)
          : html`<p><b>${this.grantsOf?.name ?? ''}</b> — ${t('ui.grantsHint')}</p>
            ${this.grantsError
              ? html`<ok-inline-feedback data-testid="services-packages-grants-error" tone="danger" icon="alert-circle-outline">${this.grantsError}</ok-inline-feedback>`
              : nothing}
            ${this.grants.length === 0
              ? this.grantsLoading
                ? html`<ok-inline-feedback data-testid="services-packages-grants-loading" tone="neutral" icon="time-outline">${t('ui.loading')}</ok-inline-feedback>`
                : this.grantsError
                  ? nothing
                  : html`<ok-inline-feedback data-testid="services-packages-grants-empty" tone="neutral" icon="information-circle-outline">${t('ui.emptyGrants')}</ok-inline-feedback>`
              : html`<ion-list lines="full">${this.grants.map((g) => this.renderGrant(g))}</ion-list>
                  ${this.grants.length < this.grantsTotal
                    ? html`<p class="more">${t('ui.grantsCount', { shown: this.grants.length, total: this.grantsTotal })}</p>
                        <ion-button expand="block" fill="clear" data-testid="services-packages-grants-more" ?disabled=${this.grantsLoading} @click=${() => this.loadMoreGrants()}>
                          ${this.grantsLoading ? t('ui.loading') : t('ui.grantsMore')}
                        </ion-button>`
                    : nothing}`}`}
      </ion-content>
    </ion-modal>`;
  }

  private renderLines() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return html`<p class="lines-title">${t('ui.packageLinesTitle')}</p>
      ${this.items.map((line, i) => html`<div class="line">
        <ion-select data-testid=${`services-packages-line-service-${i}`} fill="outline" label-placement="floating" label=${t('ui.colService')} .value=${line.serviceId} @ionChange=${(e: any) => this.setItem(i, { serviceId: e.target.value })}>
          ${this.services.map((s) => html`<ion-select-option .value=${s.id}>${s.name} · ${erplora().formatMoney(Number(s.price) || 0)}</ion-select-option>`)}
        </ion-select>
        <ion-input data-testid=${`services-packages-line-sessions-${i}`} fill="outline" label-placement="floating" label=${t('ui.colSessions')} type="number" min="1" step="1" .value=${line.sessions} @ionInput=${(e: any) => this.setItem(i, { sessions: e.target.value })}></ion-input>
        <ion-button data-testid=${`services-packages-line-remove-${i}`} fill="clear" size="small" aria-label=${t('ui.removeLine')} @click=${() => this.removeItem(i)}><ion-icon slot="icon-only" name="close-outline"></ion-icon></ion-button>
      </div>`)}
      <ion-button data-testid="services-packages-add-line" fill="outline" size="small" @click=${() => this.addItem()}>${t('ui.addLine')}</ion-button>`;
  }

  /** pm#478: the refusal appears ABOVE the button that was pressed, at the foot of the form — on a
   *  phone that can leave it off the sheet. Bring it into view once it has painted itself: scrolled
   *  before, the banner still measures 0 px and ends up under the tab bar. */
  updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (changed.has('formError') && this.formError) void this.revealFormError();
  }

  private async revealFormError(): Promise<void> {
    const banner = this.renderRoot.querySelector('[data-testid="services-packages-form-error"]') as
      | (HTMLElement & { updateComplete?: Promise<unknown> })
      | null;
    await banner?.updateComplete;
    banner?.scrollIntoView?.({ block: 'center' });
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    const fixed = this.form.discountType === 'fixed';
    return html`<div class="page">
      ${this.pageError ? html`<ok-inline-feedback data-testid="services-packages-page-error" tone="danger" icon="alert-circle-outline">${this.pageError}</ok-inline-feedback>` : nothing}
      ${this.ctrl?.error ? html`<ok-inline-feedback data-testid="services-packages-load-error" tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : nothing}
      ${can('services.view_orphan_grant')
        ? html`<ion-button class="orphans-entry" data-testid="services-packages-open-orphans" size="small" fill="clear" @click=${() => this.openOrphans()}>
            <ion-icon slot="start" name="person-remove-outline"></ion-icon>${t('ui.openOrphans')}
          </ion-button>`
        : nothing}
      <ok-data-table testid="services-packages-table" .serverSide=${true} .fill=${true} .views=${true} .addable=${can('services.add_package')} .cardTitle=${(row: Record<string, unknown>) => String(row.name ?? '')} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? 'asc'} .searchable=${true} .searchPlaceholder=${t('ui.searchPackagePlaceholder')} .actions=${this.actions} .rowClickable=${true} .emptyMessage=${this.ctrl?.loading ? t('ui.loading') : t('ui.emptyPackages')} @rowAction=${(e: CustomEvent<{ actionId: string; row: Record<string, unknown> }>) => this.onRowAction(e)} @rowClick=${(e: CustomEvent<{ row: Record<string, unknown> }>) => this.onRowAction({ detail: { actionId: 'edit', row: e.detail.row } } as CustomEvent<{ actionId: string; row: Record<string, unknown> }>)}
 @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)} @pageSizeChange=${(e: CustomEvent<number>) => this.ctrl.setPageSize(e.detail)} @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)} @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)} @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.ctrl.setFilter(e.detail.col, e.detail.value)}>
        <form slot="create" class="form" data-testid="services-packages-form" @submit=${(e: Event) => this.save(e)}>
          ${this.editingId && !this.editTitleInHeader
            ? html`<ok-inline-feedback data-testid="services-packages-editing" tone="info" icon="create-outline">
                <b>${t('ui.editingPackageTitle')}</b> — ${this.form.name}
                <ion-button size="small" fill="clear" data-testid="services-packages-edit-cancel" @click=${() => this.cancelEdit()}>${t('ui.editingCancel')}</ion-button>
              </ok-inline-feedback>`
            : nothing}
          <ion-input data-testid="services-packages-name" fill="outline" label-placement="floating" label=${t('ui.colName')} .value=${this.form.name} @ionInput=${(e: any) => (this.form = { ...this.form, name: e.target.value })}></ion-input>
          <ion-select data-testid="services-packages-discount-type" fill="outline" label-placement="floating" label=${t('ui.colDiscountType')} .value=${this.form.discountType} @ionChange=${(e: any) => (this.form = { ...this.form, discountType: e.target.value })}>
            <ion-select-option value="percentage">${t('ui.discountType.percentage')}</ion-select-option>
            <ion-select-option value="fixed">${t('ui.discountType.fixed')}</ion-select-option>
          </ion-select>
          <ion-input data-testid="services-packages-discount-value" fill="outline" label-placement="floating" label=${fixed ? t('ui.colDiscountAmount') : t('ui.colDiscountPercent')} type="text" inputmode="decimal" .value=${this.form.discountValue} @ionInput=${(e: any) => (this.form = { ...this.form, discountValue: e.target.value })}></ion-input>
          <ion-input data-testid="services-packages-fixed-price" fill="outline" label-placement="floating" label=${t('ui.colFixedPrice')} helper-text=${t('ui.fixedPriceHelp')} type="text" inputmode="decimal" .value=${this.form.fixedPrice} @ionInput=${(e: any) => (this.form = { ...this.form, fixedPrice: e.target.value })}></ion-input>
          <ion-input data-testid="services-packages-validity-days" fill="outline" label-placement="floating" label=${t('ui.colValidityDays')} helper-text=${t('ui.validityHelp')} type="number" min="1" step="1" .value=${this.form.validityDays} @ionInput=${(e: any) => (this.form = { ...this.form, validityDays: e.target.value })}></ion-input>
          <ion-input data-testid="services-packages-max-uses" fill="outline" label-placement="floating" label=${t('ui.colMaxUses')} helper-text=${t('ui.maxUsesHelp')} type="number" min="1" step="1" .value=${this.form.maxUses} @ionInput=${(e: any) => (this.form = { ...this.form, maxUses: e.target.value })}></ion-input>
          ${this.editingId
            ? html`<ok-inline-feedback data-testid="services-packages-lines-fixed" tone="neutral" icon="information-circle-outline">${t('ui.packageLinesFixed')}</ok-inline-feedback>`
            : this.renderLines()}
          <!-- pm#478: the refusal travels WITH the form — on a phone the panel is a full-screen
               sheet and a banner on the page underneath it is never seen. -->
          ${this.formError ? html`<ok-inline-feedback data-testid="services-packages-form-error" tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : nothing}
          <ion-button type="submit" data-testid="services-packages-submit" ?disabled=${this.saving || !this.form.name}>${this.saving ? t('ui.btnSaving') : this.editingId ? t('ui.btnSave') : t('ui.btnAdd')}</ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
      ${this.renderMovements()}
      ${this.renderOrphans()}
      ${this.renderGrants()}
    </div>`;
  }
}

define('erp-services-packages', ErpServicesPackages);
