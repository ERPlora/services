import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-data-table';
import type { DataTableColumn, DataTableAction } from '@erplora/outfitkit';
import { createListController } from '@erplora/module-sdk';
import type { ListController, ListClient, ListParams, ListPage } from '@erplora/module-sdk';
// i18n del módulo (ADR-0055): los catálogos `ui` se inlinean en build (esbuild) y los textos
// internos se resuelven con `erplora.t(CATALOG, 'ui.clave')` (idioma activo, fallback locale→en→clave).
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  on(event: string, cb: (payload: unknown) => void): () => void;
  /** i18n del módulo (ADR-0055): idioma activo + traducción del catálogo `ui`. */
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
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
  tax_rate_id: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  service_count: number;
}

// Fila de `taxes.rates.list` (subconjunto que usa el selector del formulario, ADR-0066/0069).
interface TaxRate {
  id: string;
  code: string;
  name: string;
  rate_pct: number;
  tax_type?: string;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

export class ErpServicesList extends LitElement {
  static styles = css`
    :host { display:block; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    header { display:flex; gap:.5rem; align-items:center; margin-bottom:.75rem; }
    h2 { margin:0; font-size:1.15rem; flex:1; }
    .form { display:flex; gap:.75rem; flex-wrap:wrap; align-items:end; margin:.5rem 0 1.25rem; }
    .form ion-input, .form ion-select { flex:1 1 11rem; min-width:9rem; }
    .err { color:#d9480f; font-weight:600; }
  `;

  @state() categories: Category[] = [];

  @state() taxRates: TaxRate[] = [];

  @state() formError = '';

  @state() newName = '';

  @state() newPrice = '';

  @state() newDuration = '';

  @state() newCategory = '';

  @state() newTaxRateId = ''; // '' = tipo por defecto del hub (se envía null)

  @state() saving = false;

  @state() tick = 0;

  private ctrl!: ListController<Service>;

  private unsub?: () => void;

  private get columns(): DataTableColumn[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return [
      { key: 'name', header: t('ui.colName'), sortable: true, filterable: true, filterType: 'text' },
      { key: 'category', header: t('ui.colCategory'), sortable: true, filterable: true, filterType: 'text', format: (r) => (r.category as string) ?? '—' },
      { key: 'pricing_type', header: t('ui.colPricingType'), sortable: true, filterable: true, filterType: 'text' },
      {
        key: 'price',
        header: t('ui.colPrice'),
        align: 'right',
        sortable: true,
        filterable: true,
        filterType: 'range',
        format: (r) => Number(r.price).toFixed(2),
      },
      { key: 'duration_minutes', header: t('ui.colDuration'), align: 'right', sortable: true, filterable: true, filterType: 'text' },
    ];
  }

  private get actions(): DataTableAction[] {
    return [{ id: 'delete', label: erplora().t(CATALOG, 'ui.actionDelete'), icon: 'trash', color: 'danger' }];
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
    try {
      this.categories = (await erplora().query<Category[]>('services.categories.list')) ?? [];
    } catch {
      /* categorías opcionales para el alta */
    }
    // Tipos de IVA/impuesto para el selector (ADR-0066/0069). Best-effort: si falla (módulo `taxes`
    // no instalado, sin permiso…) el select queda con solo "— (por defecto)" y el alta sigue.
    try {
      this.taxRates = (await erplora().query<TaxRate[]>('taxes.rates.list', { page_size: 200 })) ?? [];
    } catch {
      this.taxRates = [];
    }
  }

  // Opciones del ion-select del IVA: "— (por defecto)" (valor '') + un tipo por fila.
  // Etiqueta = "Nombre (21%)"; los grupos añaden " · grupo".
  private taxOptions() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return html`
      <ion-select-option value="">${t('ui.taxDefault')}</ion-select-option>
      ${this.taxRates.map(
        (r) => html`<ion-select-option .value=${r.id}
          >${r.name} (${r.rate_pct}%)${r.tax_type === 'group' ? ` · ${t('ui.taxGroup')}` : ''}</ion-select-option
        >`,
      )}
    `;
  }

  private async createService(ev: Event) {
    ev.preventDefault();
    if (!this.newName.trim()) return;
    this.saving = true;
    this.formError = '';
    try {
      await erplora().command('services.services.create', {
        name: this.newName.trim(),
        description: '',
        short_description: '',
        category_id: this.newCategory || null,
        pricing_type: 'fixed',
        price: Number(this.newPrice) || 0,
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
        tax_rate_id: this.newTaxRateId || null,
      });
      this.newName = '';
      this.newPrice = '';
      this.newDuration = '';
      this.newCategory = '';
      this.newTaxRateId = '';
      await this.ctrl.load(); // (además del evento; garantiza refresco inmediato)
    } catch (e) {
      this.formError = e instanceof Error ? e.message : erplora().t(CATALOG, 'ui.errorCreate');
    } finally {
      this.saving = false;
    }
  }

  private async onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>) {
    const { actionId, row } = ev.detail;
    if (actionId !== 'delete') return;
    this.formError = '';
    try {
      await erplora().command('services.services.delete', { service_id: row.id });
      await this.ctrl.load();
    } catch (e) {
      this.formError = e instanceof Error ? e.message : erplora().t(CATALOG, 'ui.errorDelete');
    }
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return html`<div>
        <header>
          <h2>${t('ui.title')}</h2>
        </header>
        <form class="form" @submit=${(e) => this.createService(e)}>
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colName')} .value=${this.newName} @ionInput=${(e: any) => (this.newName = e.target.value)}></ion-input>
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colPrice')} type="number" step="0.01" .value=${this.newPrice} @ionInput=${(e: any) => (this.newPrice = e.target.value)}></ion-input>
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colDuration')} type="number" step="1" .value=${this.newDuration} @ionInput=${(e: any) => (this.newDuration = e.target.value)}></ion-input>
          <ion-select fill="outline" label-placement="floating" label=${t('ui.colCategory')} placeholder=${t('ui.placeholderCategory')} .value=${this.newCategory} @ionChange=${(e: any) => (this.newCategory = e.target.value)}>
            <ion-select-option value="">${t('ui.optionNoCategory')}</ion-select-option>
            ${this.categories.map((c) => html`<ion-select-option .value=${c.id}>${c.name}</ion-select-option>`)}
          </ion-select>
          <ion-select fill="outline" label-placement="floating" label=${t('ui.colTax')} .value=${this.newTaxRateId} @ionChange=${(e: any) => (this.newTaxRateId = e.target.value)}>
            ${this.taxOptions()}
          </ion-select>
          <ion-button type="submit" size="small" ?disabled=${this.saving || !this.newName}>${this.saving ? t('ui.btnSaving') : t('ui.btnAdd')}</ion-button>
        </form>
        ${this.formError ? html`<p class="err">${this.formError}</p>` : nothing}
        ${this.ctrl?.error ? html`<p class="err">${this.ctrl.error}</p>` : nothing}
        <ok-data-table .serverSide=${true} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? 'asc'} .searchable=${true} .searchPlaceholder=${t('ui.searchPlaceholder')} .actions=${this.actions} .emptyMessage=${this.ctrl?.loading ? t('ui.loading') : t('ui.empty')} @rowAction=${(e: CustomEvent) => this.onRowAction(e)} @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)} @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)} @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)} @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.ctrl.setFilter(e.detail.col, e.detail.value)}></ok-data-table>
      </div>`;
  }
}

define('erp-services-list', ErpServicesList);
