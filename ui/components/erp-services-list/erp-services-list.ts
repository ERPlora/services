import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import '@erplora/outfitkit/ok-data-table';
import type { DataTableColumn, DataTableAction } from '@erplora/outfitkit';
import { createListController, majorToMinor, minorToMajor } from '@erplora/module-sdk';
import type { ListController, ListClient, ListParams, ListPage } from '@erplora/module-sdk';
// i18n del módulo (ADR-0055): los catálogos `ui` se inlinean en build (esbuild) y los textos
// internos se resuelven con `erplora.t(CATALOG, 'ui.clave')` (idioma activo, fallback locale→en→clave).
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
import { domainMessage } from '../../lib/domain-error';
import { ionTone } from '../../lib/ion-tone';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

/** Lo tecleado → UNIDADES MÍNIMAS (el dinero es INTEGER, ADR-0007/0123). «15,50» → 1550.
 *
 *  Dos supuestos que estaban aquí y eran falsos:
 *  - **la coma**: en es-ES se teclea «15,50» y `Number` da `NaN`, que caía a 0 → el servicio se
 *    creaba GRATIS (mismo bug que dejó sin cerrar la caja, cash_register#272);
 *  - **la escala**: era un `×100` clavado. La escala es la de LA MONEDA del hub —
 *    `majorToMinor` con `erplora.currencyDecimals`—; en JPY la unidad mínima ES el yen y un
 *    ×100 cobra 100 veces de más. Si el shell es viejo y no la inyecta, se cae a 2, nunca a
 *    `NaN`: un `NaN` en una columna INTEGER es corrupción silenciosa. */
function toMinorUnits(v: string | number): number {
  const decimals = erplora().currencyDecimals;
  return majorToMinor(String(v ?? '').replace(',', '.'), typeof decimals === 'number' ? decimals : 2);
}

/** MINOR units (what the row carries) → what a human types in the price field, in the HUB's
 *  locale (services#54): 2200 → «22,00» in es, «22.00» in en. Two fixed rules:
 *  - the decimals are the CURRENCY's (`erplora.currencyDecimals`), so the field never shows a
 *    different scale than the money it edits;
 *  - `useGrouping: false`: «1.250,50» would not survive the trip back through `toMinorUnits`
 *    (it reads `.` as a decimal dot), and a price field must round-trip through itself.
 *  Same figure, same screen, same notation as the table's «22,00 €» two centimetres away. */
function toMajorText(minor: unknown): string {
  const decimals = erplora().currencyDecimals;
  const d = typeof decimals === 'number' ? decimals : 2;
  const major = minorToMajor(Number(minor) || 0, d);
  return new Intl.NumberFormat(erplora().locale || 'en', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
    useGrouping: false,
  }).format(major);
}

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  /** TODAS las filas, sin tope (salvo que pases `limit`). Para lo que no es «una página»: la
   *  rejilla de productos del TPV, un `<ion-select>` de categorías fiscales, el mapa
   *  producto↔categoría. El viejo `page_size` NO era un parámetro del runtime: truncaba a 50. */
  queryAll<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T[]>;
  /** Query to an OPTIONAL integration (ADR-0127): `undefined` when the owner module is not
   *  installed/active in this hub; any other failure throws like `query()`. */
  queryOptional<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T | undefined>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  on(event: string, cb: (payload: unknown) => void): () => void;
  /** i18n del módulo (ADR-0055): idioma activo + traducción del catálogo `ui`. */
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
  /** Dinero (ADR-0123): recibe UNIDADES MÍNIMAS y divide por los decimales de la moneda. */
  formatMoney(minor: number, opts?: { currency?: string; locale?: string }): string;
  /** Decimales de la moneda del hub — la escala del dinero. 2 en EUR, 0 en JPY, 3 en KWD. */
  currencyDecimals: number;
  /** UI visibility only; the runtime re-checks the permission on every command. */
  hasPermission?(permission: string): boolean;
}

interface Service {
  id: string;
  name: string;
  price: string;
  pricing_type: string;
  duration_minutes: number;
  is_bookable: number;
  category_id: string | null;
  category: string | null;
  tax_category_key: string | null;
  /** `active` | `inactive` | `unconfigured` — lo calcula `queries/services_list.sql`. */
  status: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  service_count: number;
}

// Row of `taxes.categories.list` (the fiscal CATEGORY is the linkable thing, ADR-0085).
// `display_name` is the label `taxes` already resolves to the caller's language (taxes#38/#40,
// same contract inventory#64 reads): it is what gets PAINTED, while the canonical `key` is what
// gets SAVED — the label is translatable, the key is the stable identifier.
interface TaxCategory {
  id: string;
  key: string;
  name: string;
  /** Translated label, served by `taxes` since 2.3.8. Optional: an older hub still sends only
   *  the seed's English `name`, and the form must keep working there. */
  display_name?: string;
  is_system?: number;
}

/** The VISIBLE name of a fiscal category: `display_name` first, `name` as the reserve (services#54).
 *
 * The order is not interchangeable: `display_name` is the label already resolved to the hub's
 * language; `name` is the seed's English literal. Preferring `name` would show English exactly
 * when the translation exists. The reserve is needed against a hub with `taxes` < 2.3.8, where
 * the column does not travel — showing the English of before beats a mute option. A category the
 * hub owner created has no translation and does not want one: `taxes` returns their own text in
 * `display_name` (its SQL's `COALESCE(..., c.name)`), so it passes through untouched. */
function taxCategoryDisplayName(c: TaxCategory): string {
  return (c.display_name ?? '').trim() || (c.name ?? '').trim() || c.key;
}

// Dominio cerrado de la tarifa (migrations/*/001_init.sql: fixed|hourly|from|variable|free): se
// ELIGE, no se teclea, y el servidor lo declara `op: eq` → el filtro `select` es real.
const PRICING_TYPES = ['fixed', 'hourly', 'from', 'variable', 'free'];

// Los tres valores del vocabulario de `status` (`queries/services_list.sql`). `inactive` —los
// archivados— entró con services#44: el listado los trae solo si se piden, así que la opción del
// filtro es también el interruptor del alcance (ver `onFilterChange`). Va la última a propósito:
// el trabajo del día está en las otras dos.
const FILTERABLE_STATUSES = ['active', 'unconfigured', 'inactive'];

/** El valor de `status` que devuelve un servicio archivado (o desactivado). */
const ARCHIVED_STATUS = 'inactive';

/** El estado de la fila. Si el hub sirviera una proyección anterior (sin `status`), se deduce del
 *  dato que importa: un servicio sin categoría fiscal no puede cobrarse, y esa es exactamente la
 *  fila que no puede pasar desapercibida. */
function stateOf(row: Record<string, unknown>): string {
  const declared = String(row.status ?? '').trim();
  if (declared) return declared;
  return String(row.tax_category_key ?? '').trim() ? 'active' : 'unconfigured';
}

// El `render` de una celda se pinta DENTRO del shadow DOM de `ok-data-table`, así que las clases de
// ESTE componente no llegan (mismo motivo por el que `inventory` estila su toggle en línea). El
// color va en el atributo `style`, con las custom props de Ionic, que sí heredan.
const STATE_COLOR: Record<string, string> = {
  active: 'var(--ion-color-success, #2dd36f)',
  inactive: 'var(--ion-color-medium, #92949c)',
  unconfigured: 'var(--ion-color-danger, #eb445a)',
};

function badgeStyle(state: string): string {
  const tone = STATE_COLOR[state] ?? STATE_COLOR.inactive;
  return 'display:inline-block;padding:.1rem .45rem;border-radius:999px;font-size:.78rem;'
    + 'font-weight:600;white-space:nowrap;'
    + `background:color-mix(in srgb, ${tone} 18%, transparent);`
    + `color:color-mix(in srgb, ${tone} 70%, #000);`;
}

const REASON_STYLE = 'display:block;margin-top:.15rem;font-size:.72rem;line-height:1.2;'
  + `color:color-mix(in srgb, ${STATE_COLOR.unconfigured} 70%, #000);`;

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

/** Row of `appointments.appointments.count_active_for_service` (public query of `appointments`). */
interface ActiveAppointments {
  active_count: number | string;
  next_start_datetime: string | null;
}

export class ErpServicesList extends LitElement {
  static styles = css`
    :host { display:flex; flex-direction:column; height:100%; min-height:0; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    /* La vista llena el alto: el data-table ocupa todo (scroll interno, pie fijo). */
    .page { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; }
    .page > ok-data-table { flex:1 1 auto; min-height:0; }
    /* El alta vive en el panel lateral de la tabla (estrecho): los campos van APILADOS. */
    .form { display:flex; flex-direction:column; gap:.7rem; }
    .form ion-button { align-self:flex-end; }
    .err { color:#d9480f; font-weight:600; }
  `;

  @state() categories: Category[] = [];

  @state() taxRates: TaxCategory[] = [];

  @state() formError = '';

  @state() newName = '';

  @state() newPrice = '';

  @state() newDuration = '';

  @state() newCategory = '';

  @state() newTaxRateId = ''; // '' = tipo por defecto del hub (se envía null)

  @state() saving = false;

  @state() tick = 0;

  /** The list is scoped to the ARCHIVED services (services#44). It drives what the row offers, and
   *  it is set from the status filter — never on its own. */
  @state() showingArchived = false;

  /** Service being edited (services#4): the create panel becomes the edit form and the submit
   *  sends `services.services.update` instead of `create`. `null` = create mode. Same pattern as
   *  inventory products (inventory#8). */
  @state() editingId: string | null = null;

  /** pm#450: whether the table's panel HEADER already carries the editing title (OutfitKit
   *  ≥ 0.1.94, outfitkit#150). Set only after checking the rendered dialog — never assumed — so
   *  an older shell (hub:stable ships 0.1.73, which ignores the `title` and keeps «New») still
   *  gets the fallback line in the form body. */
  @state() editTitleInHeader = false;

  /** Service waiting for the archive confirmation (services#2). `null` = no dialog. */
  @state() archiveTarget: Service | null = null;

  /** Upcoming appointments of `archiveTarget`, from `appointments`; `null` = unknown (module not
   *  installed / no permission) — the warning is advisory, never a dependency. */
  @state() archiveActive: ActiveAppointments | null = null;

  private ctrl!: ListController<Service>;

  private unsub?: () => void;

  private get columns(): DataTableColumn[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return [
      { key: 'name', header: t('ui.colName'), sortable: true, filterable: true, filterType: 'text' },
      {
        key: 'category',
        header: t('ui.colCategory'),
        sortable: true,
        filterable: true,
        // Dominio cerrado (las categorías del hub). El servidor filtra por el NOMBRE de la
        // categoría (`category`, `op: eq`), no por su id: el `value` de la opción es el nombre.
        filterType: 'select',
        options: this.categories.map((c) => ({ value: c.name, label: c.name })),
        format: (r) => (r.category as string) ?? '—',
      },
      {
        key: 'pricing_type',
        header: t('ui.colPricingType'),
        sortable: true,
        filterable: true,
        filterType: 'select',
        options: PRICING_TYPES.map((v) => ({ value: v, label: t(`ui.pricingType.${v}`) })),
        format: (r) => t(`ui.pricingType.${String(r.pricing_type)}`),
      },
      {
        key: 'price',
        header: t('ui.colPrice'),
        align: 'right',
        sortable: true,
        filterable: true,
        filterType: 'range',
        // El precio se guarda en CÉNTIMOS (INTEGER, ADR-0007): 1500 = 15,00 €. El helper canónico
        // `formatMoney` divide por 10^decimales (no /100 a ciegas: en JPY/KWD sería distinto).
        format: (r) => erplora().formatMoney(Number(r.price) || 0),
      },
      { key: 'duration_minutes', header: t('ui.colDuration'), align: 'right', sortable: true, filterable: true, filterType: 'text' },
      {
        key: 'status',
        header: t('ui.colStatus'),
        sortable: true,
        filterable: true,
        // Dominio cerrado (el servidor lo declara `op: eq`) → el filtro `select` aísla de verdad
        // los servicios que no se pueden cobrar, que es para lo que existe la columna.
        filterType: 'select',
        options: FILTERABLE_STATUSES.map((v) => ({ value: v, label: t(`ui.status.${v}`) })),
        // Marcar sin decir POR QUÉ es una etiqueta sobre la que nadie puede actuar: el motivo se
        // pinta al lado, no solo en un `title` que en una tablet no existe. `render` vale para las
        // dos vistas de la tabla (lista y tarjeta), así que el motivo viaja también al móvil.
        render: (r) => {
          const state = stateOf(r);
          const reason = state === 'unconfigured' ? t('ui.statusReason.unconfigured') : '';
          return html`<span style=${badgeStyle(state)} title=${reason || nothing}>${t(`ui.status.${state}`)}</span>
            ${reason ? html`<small style=${REASON_STYLE}>${reason}</small>` : nothing}`;
        },
      },
    ];
  }

  // «Archive», not «delete»: `services.services.delete` is a soft-delete + `is_active = 0` — the
  // service stops being offered and its history (and the appointments already booked, which keep
  // their own snapshot) stays. That is what Fresha/Square/Vagaro/Odoo do; none of them deletes a
  // service with future bookings. Only who holds the permission sees the action (services#2).
  //
  // While the ARCHIVED ones are on screen the row offers the way back instead (services#44), which
  // is how Square (`Unarchive`) and Fresha/Treatwell (the row's `⋯`) do it: the action lives on the
  // row, never inside the record — Shopify's «open it, scroll to the bottom, unarchive, then change
  // the state again» is six taps and two screens for one decision. Offering «archive» on something
  // already archived would be an offer to do nothing, so it goes.
  private get actions(): DataTableAction[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    if (this.showingArchived) {
      return can('services.change_service')
        ? [{ id: 'restore', label: t('ui.actionRestore'), icon: 'arrow-undo-outline', color: 'success' }]
        : [];
    }
    return [
      ...(can('services.change_service') ? [{ id: 'edit', label: t('ui.actionEdit'), icon: 'create-outline' }] : []),
      ...(can('services.delete_service')
        ? [{ id: 'archive', label: t('ui.actionArchive'), icon: 'archive-outline', color: 'danger' }]
        : []),
    ];
  }

  /** Filter change of the table. `status = inactive` is not one filter more: the archived services
   *  are NOT in the default answer of `services.services.list` at all (the diary consumes that very
   *  query as its selector of bookable services), so picking it has to widen the SCOPE too —
   *  otherwise the filter would only ever paint an empty table.
   *
   *  The scope is written straight into the controller's context and the reload is left to
   *  `setFilter`: `setContext` would reload on its own and the same tap would cost two round trips
   *  to the hub. */
  onFilterChange(col: string, value: unknown): void {
    if (col === 'status') {
      this.showingArchived = String(value ?? '') === ARCHIVED_STATUS;
      this.ctrl.state.context = this.showingArchived ? { include_archived: 1 } : {};
    }
    this.ctrl.setFilter(col, value);
  }

  /** Puts an archived service back (`services.services.restore`). No confirmation: restoring is not
   *  destructive —it undoes one— and the market does not ask for one either. */
  private async restoreService(row: Record<string, unknown>) {
    if (!can('services.change_service')) return;
    this.formError = '';
    this.saving = true;
    try {
      await erplora().command('services.services.restore', { service_id: String(row.id) });
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorRestore'));
    } finally {
      this.saving = false;
    }
  }

  // TODO-LIT: componentWillLoad → connectedCallback. Recuerda: connectedCallback se dispara
  // en CADA reconexión al DOM (no solo en el primer montaje). Si la init debe correr una
  // sola vez tras el primer render, considera firstUpdated() en su lugar.
  // Re-render al cambiar el idioma del shell (ADR-0055): los getters `columns`/`actions` y el
  // texto del template se re-evalúan con el nuevo `erplora.locale`.
  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    this.ctrl = createListController<Service>(erplora(), 'services.services.list', () => this.requestUpdate(), {
      pageSize: 50,
      sort: 'name',
      dir: 'asc',
    });
    await Promise.all([this.ctrl.load(), this.loadAux()]);
    // Reactividad: el runtime emite eventos de dominio vía SDK/WS; recargamos.
    try {
      const off1 = erplora().on('services.service.created', () => this.ctrl.load());
      const off2 = erplora().on('services.service.updated', () => this.ctrl.load());
      const off3 = erplora().on('services.service.deleted', () => this.ctrl.load());
      this.unsub = () => {
        off1();
        off2();
        off3();
      };
    } catch {
      /* sin SDK (preview) → sin reactividad en vivo */
    }
  }

  disconnectedCallback() {
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    super.disconnectedCallback();
    this.unsub?.();
  }

  private async loadAux() {
    // `queryAll`, not `query`: `services.categories.list` is a paginated list and a plain `query`
    // truncated it to the first page — a hub with more than 50 categories could not pick the rest.
    try {
      this.categories = (await erplora().queryAll<Category>('services.categories.list', { sort: 'name', dir: 'asc' })) ?? [];
    } catch {
      /* categories are optional for the form */
    }
    // Categorías fiscales para el selector (ADR-0085). Ya NO es best-effort de adorno: la categoría
    // es obligatoria, así que una lista vacía (módulo `taxes` sin configurar, sin permiso…) no deja
    // un select vacío sin explicación — el formulario lo dice (`ui.taxCategoriesMissing`).
    try {
      // Sorted by `display_name` — what the user READS in the dropdown (services#54). Sorting by
      // `name` left the list alphabetized in English while painted in Spanish; `taxes` accepts
      // `display_name` in its sort whitelist, and if it ever stops doing so the query fails, this
      // catch leaves the catalogue empty — the same degradation as always.
      const res = await erplora().queryAll<TaxCategory>('taxes.categories.list', { sort: 'display_name', dir: 'asc' });
      // `Array.isArray`, not `?? []`: a non-list answer would make `.map()` throw IN THE RENDER
      // and take the whole services page down — for an IVA dropdown. The form must not depend on
      // `taxes` answering well (same hardening as inventory).
      this.taxRates = Array.isArray(res) ? res : [];
    } catch {
      this.taxRates = [];
    }
  }

  // Fiscal-category options for the ion-select: one category per row (value = canonical key).
  // There is NO empty option on purpose: «— (default)» was the door through which a service
  // nobody could charge was created. The label is the TRANSLATED `display_name`, without the
  // technical key glued to it (services#54): nobody giving a service high has to choose between
  // two taxonomies, they choose by name — the key still travels as the `value`, silent, because
  // it is the identifier that does not change. The % is resolved by `taxes` per country+category
  // (ADR-0085).
  private taxOptions() {
    return this.taxRates.map(
      (c) => html`<ion-select-option .value=${c.key}>${taxCategoryDisplayName(c)}</ion-select-option>`,
    );
  }

  // Referencia al ok-data-table para abrir/cerrar su panel lateral (el alta se proyecta dentro).
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
    if (!this.editingId) return;
    const addId = 'services-list-table-add';
    if (e.composedPath().some((n) => n instanceof HTMLElement && n.dataset.testid === addId)) this.cancelEdit();
  }

  /** Wired natively, not with a Lit `@click` on the tag: `<ok-data-table>` carries `testid`, not
   *  `data-testid` (outfitkit#143), and a template binding would read as an action element that
   *  demands one. */
  firstUpdated(): void {
    this.renderRoot.querySelector('ok-data-table')?.addEventListener('click', (e) => this.onTableClick(e));
  }

  /** Back to a clean CREATE form (services#4). */
  cancelEdit(): void {
    this.editingId = null;
    this.newName = '';
    this.newPrice = '';
    this.newDuration = '';
    this.newCategory = '';
    this.newTaxRateId = '';
    this.formError = '';
  }

  /** Submit of the panel form: create OR update, decided by `editingId` (services#4). */
  async createService(ev: Event) {
    ev.preventDefault();
    if (!this.newName.trim()) return;
    if (this.editingId) return this.saveEdit();
    if (!can('services.add_service')) return;
    // La categoría fiscal no es un campo más del formulario: sin ella el servicio no se puede
    // cobrar y la venta se rechaza con la clienta delante. El servidor también lo rechaza
    // (`schemas/service_create.json`); esto solo evita el viaje y NOMBRA lo que falta, en vez de
    // devolver el error crudo del validador.
    if (!this.newTaxRateId) {
      this.formError = erplora().t(CATALOG, 'ui.errorTaxRequired');
      return;
    }
    this.saving = true;
    this.formError = '';
    try {
      await erplora().command('services.services.create', {
        name: this.newName.trim(),
        description: '',
        short_description: '',
        category_id: this.newCategory || null,
        pricing_type: 'fixed',
        // El input recoge EUROS (step 0.01) pero la columna es céntimos (ADR-0007): 15 € → 1500.
        price: toMinorUnits(this.newPrice),
        cost: 0,
        duration_minutes: Number(this.newDuration) || 60,
        buffer_before: 0,
        buffer_after: 0,
        max_capacity: 1,
        is_bookable: 1,
        requires_confirmation: 0,
        allow_online_booking: 1,
        sort_order: 0,
        is_featured: 0,
        sku: '',
        barcode: '',
        notes: '',
        tax_category_key: this.newTaxRateId,
      });
      this.cancelEdit();
      this.dataTable()?.close(); // el panel de alta se cierra solo tras crear
      await this.ctrl.load(); // (además del evento; garantiza refresco inmediato)
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorCreate'));
    } finally {
      this.saving = false;
    }
  }

  /** `services.services.update` through the PARTIAL door (`records.service.patch`, hub#632): only
   *  the id + what the form edits travel; the runtime completes the rest from the row, so the
   *  fields this form does not show (buffers, capacity, sku…) are never wiped by an edit. */
  private async saveEdit() {
    if (!this.editingId || !can('services.change_service')) return;
    if (!this.newTaxRateId) {
      this.formError = erplora().t(CATALOG, 'ui.errorTaxRequired');
      return;
    }
    this.saving = true;
    this.formError = '';
    try {
      await erplora().command('services.services.update', {
        service_id: this.editingId,
        name: this.newName.trim(),
        category_id: this.newCategory || null,
        price: toMinorUnits(this.newPrice),
        duration_minutes: Number(this.newDuration) || 60,
        tax_category_key: this.newTaxRateId,
      });
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorUpdate'));
    } finally {
      this.saving = false;
    }
  }

  async onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>) {
    const { actionId, row } = ev.detail;
    if (actionId === 'restore') return this.restoreService(row);
    if (actionId === 'edit' && can('services.change_service')) {
      // Edit = the create panel, pre-filled from the FULL row (the list projects a subset).
      this.formError = '';
      let full: Record<string, unknown> = row;
      try {
        const rows = await erplora().query<Record<string, unknown>[]>('services.services.get', { service_id: String(row.id) });
        if (Array.isArray(rows) && rows[0]) full = rows[0];
      } catch {
        /* the row of the list is enough to pre-fill what this form edits */
      }
      this.editingId = String(row.id);
      this.newName = String(full.name ?? '');
      this.newPrice = toMajorText(full.price);
      this.newDuration = String(full.duration_minutes ?? '');
      this.newCategory = String(full.category_id ?? '');
      this.newTaxRateId = String(full.tax_category_key ?? '');
      const title = `${erplora().t(CATALOG, 'ui.editingTitle')} — ${this.newName}`;
      const table = this.dataTable();
      table?.open('edit', { title });
      await table?.updateComplete;
      // OutfitKit < 0.1.94 ignores the title and keeps «New»: only drop the in-form line when the
      // header REALLY carries it (the dialog is labelled with it).
      this.editTitleInHeader = table?.shadowRoot?.querySelector('[role="dialog"]')?.getAttribute('aria-label') === title;
      return;
    }
    if (actionId !== 'archive' || !can('services.delete_service')) return;
    this.formError = '';
    // Never on the first tap: confirm, and say what it touches. The count comes from a PUBLIC
    // query of `appointments` (services cannot look at its table, and cannot `reads` it either:
    // appointments depends on services, so the reverse dependency would be a cycle). It is an
    // OPTIONAL integration (ADR-0127, `queryOptional`): a hub without appointments gets the dialog
    // without the line. Any other failure is logged, not swallowed — but it never blocks
    // archiving: the line is advice about what the archive touches, not a precondition.
    this.archiveTarget = row as unknown as Service;
    this.archiveActive = null;
    try {
      const rows = await erplora().queryOptional<ActiveAppointments[]>(
        'appointments.appointments.count_active_for_service',
        { service_id: String(row.id) },
      );
      const first = Array.isArray(rows) ? rows[0] : null;
      if (first && this.archiveTarget?.id === row.id) this.archiveActive = first;
    } catch (e) {
      console.warn('[services] appointments.appointments.count_active_for_service failed; archiving without the warning line', e);
      this.archiveActive = null;
    }
  }

  /** Runs the confirmed archive (`services.services.delete`). */
  async confirmArchive(): Promise<void> {
    const target = this.archiveTarget;
    if (!target || !can('services.delete_service')) return;
    this.saving = true;
    this.formError = '';
    try {
      await erplora().command('services.services.delete', { service_id: target.id });
      this.archiveTarget = null;
      this.archiveActive = null;
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorArchive'));
      this.archiveTarget = null;
    } finally {
      this.saving = false;
    }
  }

  private renderArchiveConfirm() {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const count = Number(this.archiveActive?.active_count ?? 0) || 0;
    return html`<ion-modal .isOpen=${!!this.archiveTarget} @ionModalDidDismiss=${() => (this.archiveTarget = null)}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t('ui.archiveTitle')}</ion-title></ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, so this component's CSS does not reach it. -->
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap">
              <b>${this.archiveTarget?.name ?? ''}</b> — ${t('ui.archiveHint')}
            </ion-label>
          </ion-item>
          ${count > 0
            ? html`<ion-item>
                <ion-icon slot="start" name="calendar-outline" data-testid="services-list-archive-warning-icon" style=${ionTone('text', 'warning')}></ion-icon>
                <ion-label class="ion-text-wrap">${t('ui.archiveWarnAppointments', { count })}</ion-label>
              </ion-item>`
            : nothing}
        </ion-list>
        <ion-button class="ion-margin-top" expand="block" data-testid="services-list-archive-submit" style=${ionTone('solid', 'danger')} ?disabled=${this.saving} @click=${() => this.confirmArchive()}>
          ${this.saving ? t('ui.btnSaving') : t('ui.archiveConfirm')}
        </ion-button>
        <ion-button expand="block" fill="outline" data-testid="services-list-archive-cancel" ?disabled=${this.saving} @click=${() => (this.archiveTarget = null)}>
          ${t('ui.btnCancel')}
        </ion-button>
      </ion-content>
    </ion-modal>`;
  }

  // The view title is painted by the shell topbar: repeating it here showed it twice on screen.
  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return html`<div class="page">
        ${this.formError ? html`<ok-inline-feedback data-testid="services-list-form-error" tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : nothing}
        ${this.ctrl?.error ? html`<ok-inline-feedback data-testid="services-list-load-error" tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : nothing}
        <ok-data-table testid="services-list-table" .serverSide=${true} .fill=${true} .addable=${true} .views=${true} .cardTitle=${(row: Record<string, unknown>) => String(row.name ?? '')} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? 'asc'} .searchable=${true} .searchPlaceholder=${t('ui.searchPlaceholder')} .actions=${this.actions} .rowClickable=${true} .emptyMessage=${this.ctrl?.loading ? t('ui.loading') : t('ui.empty')} @rowAction=${(e: CustomEvent) => this.onRowAction(e)} @rowClick=${(e: CustomEvent<{ row: Record<string, unknown> }>) => this.onRowAction({ detail: { actionId: 'edit', row: e.detail.row } } as CustomEvent<{ actionId: string; row: Record<string, unknown> }>)}
 @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)} @pageSizeChange=${(e: CustomEvent<number>) => this.ctrl.setPageSize(e.detail)} @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)} @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)} @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.onFilterChange(e.detail.col, e.detail.value)}>
          <!-- Create form: ALWAYS projected (even with the panel shut); painted only on open, the
               toolbar «+» would slide out an empty panel. -->
          <form slot="create" class="form" data-testid="services-list-form" @submit=${(e: Event) => this.createService(e)}>
            ${this.editingId && !this.editTitleInHeader
              ? html`<ok-inline-feedback data-testid="services-list-editing" tone="info" icon="create-outline">
                  <b>${t('ui.editingTitle')}</b> — ${this.newName}
                  <ion-button size="small" fill="clear" data-testid="services-list-edit-cancel" @click=${() => this.cancelEdit()}>${t('ui.editingCancel')}</ion-button>
                </ok-inline-feedback>`
              : nothing}
            <ion-input data-testid="services-list-name" fill="outline" label-placement="floating" label=${t('ui.colName')} .value=${this.newName} @ionInput=${(e: any) => (this.newName = e.target.value)}></ion-input>
            <ion-input data-testid="services-list-price" fill="outline" label-placement="floating" label=${t('ui.colPrice')} type="text" inputmode="decimal" .value=${this.newPrice} @ionInput=${(e: any) => (this.newPrice = e.target.value)}></ion-input>
            <ion-input data-testid="services-list-duration" fill="outline" label-placement="floating" label=${t('ui.colDuration')} type="number" step="1" .value=${this.newDuration} @ionInput=${(e: any) => (this.newDuration = e.target.value)}></ion-input>
            <!-- Both selects go WITHOUT a placeholder, on purpose (services#57): with a floating
                 label, Ionic lifts the label into the border gap as soon as the field has focus and
                 paints the placeholder INSIDE — two near-identical texts a few pixels apart. The
                 label alone says what the field is; a placeholder only fits if it adds something
                 (a format, an example), not if it repeats the name. -->
            <ion-select data-testid="services-list-category" fill="outline" label-placement="floating" label=${t('ui.colCategory')} .value=${this.newCategory} @ionChange=${(e: any) => (this.newCategory = e.target.value)}>
              <ion-select-option value="">${t('ui.optionNoCategory')}</ion-select-option>
              ${this.categories.map((c) => html`<ion-select-option .value=${c.id}>${c.name}</ion-select-option>`)}
            </ion-select>
            <ion-select data-testid="services-list-tax" fill="outline" label-placement="floating" label=${t('ui.colTax')} .value=${this.newTaxRateId} @ionChange=${(e: any) => (this.newTaxRateId = e.target.value)}>
              ${this.taxOptions()}
            </ion-select>
            <!-- Without tax categories creating is impossible (the category is required): say where
                 to fix it, instead of leaving an empty dropdown with no explanation. -->
            ${this.taxRates.length === 0
              ? html`<ok-inline-feedback data-testid="services-list-tax-missing" tone="warning" icon="alert-circle-outline">${t('ui.taxCategoriesMissing')}</ok-inline-feedback>`
              : nothing}
            <ion-button type="submit" data-testid="services-list-submit" ?disabled=${this.saving || !this.newName || !this.newTaxRateId}>${this.saving ? t('ui.btnSaving') : this.editingId ? t('ui.btnSave') : t('ui.btnAdd')}</ion-button>
          </form>
        </ok-data-table>
        ${this.renderArchiveConfirm()}
      </div>`;
  }
}

define('erp-services-list', ErpServicesList);
