import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import '@erplora/outfitkit/ok-data-table';
import type { DataTableColumn, DataTableAction } from '@erplora/outfitkit';
import { createListController } from '@erplora/module-sdk';
import type { ListController, ListClient, ListParams, ListPage } from '@erplora/module-sdk';
// Module i18n (ADR-0055): the `ui` catalogues are inlined at build time (esbuild).
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
import { domainMessage } from '../../lib/domain-error';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// «Categories» view of the services module (services#4): the CRUD of `services_category` that
// existed only as commands. Same pattern as inventory categories (inventory#8): everything inside
// `ok-data-table` — the «+» opens the create panel, «edit» pre-fills the SAME form, «delete»
// confirms and shows the impact.

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  queryAll<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T[]>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  on(event: string, cb: (payload: unknown) => void): () => void;
  hasPermission?(permission: string): boolean;
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

/** Row of `services.categories.list`. */
interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  parent_id: string | null;
  sort_order: number;
  service_count: number;
}

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

export class ErpServicesCategories extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .page { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
    .page > ok-data-table { flex: 1 1 auto; min-height: 0; }
    .form { display: flex; flex-direction: column; gap: 0.7rem; }
    .form ion-button[type='submit'] { align-self: flex-end; }
  `;

  @state() newName = '';
  @state() newParent = '';
  @state() newSortOrder = '';
  @state() saving = false;
  @state() formError = '';
  /** Category being edited; `null` = create mode. The submit decides create vs update. */
  @state() editingId: string | null = null;
  /** Category waiting for the delete confirmation. */
  @state() deleteTarget: Category | null = null;
  /** All categories of the hub, for the parent selector (`queryAll`: never a truncated page). */
  @state() allCategories: Category[] = [];

  private ctrl!: ListController<Category>;
  private unsub?: () => void;

  private get columns(): DataTableColumn[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    const nameOf = (id: unknown): string => this.allCategories.find((c) => c.id === id)?.name ?? '—';
    return [
      { key: 'name', header: t('ui.colName'), sortable: true, filterable: true, filterType: 'text' },
      { key: 'parent_id', header: t('ui.colParent'), sortable: true, format: (r) => nameOf(r.parent_id) },
      { key: 'sort_order', header: t('ui.colSortOrder'), align: 'right', sortable: true },
      { key: 'service_count', header: t('ui.colServiceCount'), align: 'right', sortable: true, filterable: true, filterType: 'range' },
    ];
  }

  get actions(): DataTableAction[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return [
      ...(can('services.change_category') ? [{ id: 'edit', label: t('ui.actionEdit'), icon: 'create-outline' }] : []),
      ...(can('services.delete_category') ? [{ id: 'delete', label: t('ui.actionDelete'), icon: 'trash-outline', color: 'danger' }] : []),
    ];
  }

  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    this.ctrl = createListController<Category>(erplora(), 'services.categories.list', () => this.requestUpdate(), {
      pageSize: 50,
      sort: 'name',
      dir: 'asc',
    });
    await Promise.all([this.ctrl.load(), this.loadAll()]);
    try {
      // The category commands emit no events today; the service ones change `service_count`.
      const off1 = erplora().on('services.service.created', () => this.ctrl.load());
      const off2 = erplora().on('services.service.updated', () => this.ctrl.load());
      const off3 = erplora().on('services.service.deleted', () => this.ctrl.load());
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

  private async loadAll() {
    try {
      this.allCategories = (await erplora().queryAll<Category>('services.categories.list', { sort: 'name', dir: 'asc' })) ?? [];
    } catch {
      this.allCategories = [];
    }
  }

  private dataTable(): { open(p?: 'filters' | 'create'): void; close(): void } | null {
    return this.renderRoot.querySelector('ok-data-table') as { open(p?: 'filters' | 'create'): void; close(): void } | null;
  }

  async onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void> {
    const { actionId, row } = ev.detail;
    const c = row as unknown as Category;
    if (actionId === 'edit' && can('services.change_category')) {
      this.editingId = c.id;
      this.newName = c.name ?? '';
      this.newParent = c.parent_id ?? '';
      this.newSortOrder = String(c.sort_order ?? 0);
      this.formError = '';
      this.dataTable()?.open('create');
    } else if (actionId === 'delete' && can('services.delete_category')) {
      // Never on the first tap: confirm and say the impact (services left without a category —
      // they keep existing, they just lose the grouping; the market's «unlink» policy).
      this.deleteTarget = c;
    }
  }

  /** Back to a clean CREATE form. */
  cancelEdit(): void {
    this.editingId = null;
    this.newName = '';
    this.newParent = '';
    this.newSortOrder = '';
    this.formError = '';
  }

  /** Submit: create OR update by `editingId`. The update goes through the PARTIAL door
   *  (`records.category.patch`, hub#632): id + edited fields; the runtime completes slug/is_active. */
  async save(ev: Event): Promise<void> {
    ev.preventDefault();
    const required = this.editingId ? 'services.change_category' : 'services.add_category';
    if (!can(required) || !this.newName.trim()) return;
    this.saving = true;
    this.formError = '';
    try {
      const fields = {
        name: this.newName.trim(),
        parent_id: this.newParent || null,
        sort_order: Number(this.newSortOrder) || 0,
      };
      if (this.editingId) {
        await erplora().command('services.categories.update', { category_id: this.editingId, ...fields });
      } else {
        await erplora().command('services.categories.create', fields);
      }
      this.cancelEdit();
      this.dataTable()?.close();
      await Promise.all([this.ctrl.load(), this.loadAll()]);
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorSaveCategory'));
    } finally {
      this.saving = false;
    }
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget;
    if (!target || !can('services.delete_category')) return;
    this.saving = true;
    try {
      await erplora().command('services.categories.delete', { category_id: target.id });
      this.deleteTarget = null;
      await Promise.all([this.ctrl.load(), this.loadAll()]);
    } catch (e) {
      this.formError = domainMessage(e, erplora().locale, erplora().t(CATALOG, 'ui.errorDeleteCategory'));
      this.deleteTarget = null;
    } finally {
      this.saving = false;
    }
  }

  private renderDeleteConfirm() {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const count = Number(this.deleteTarget?.service_count ?? 0) || 0;
    return html`<ion-modal .isOpen=${!!this.deleteTarget} @ionModalDidDismiss=${() => (this.deleteTarget = null)}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t('ui.deleteCategoryTitle')}</ion-title></ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap"><b>${this.deleteTarget?.name ?? ''}</b> — ${t('ui.deleteCategoryHint')}</ion-label>
          </ion-item>
          ${count > 0
            ? html`<ion-item>
                <ion-icon slot="start" name="alert-circle-outline" color="warning"></ion-icon>
                <ion-label class="ion-text-wrap">${t('ui.deleteCategoryImpact', { count })}</ion-label>
              </ion-item>`
            : nothing}
        </ion-list>
        <ion-button class="ion-margin-top" expand="block" color="danger" ?disabled=${this.saving} @click=${() => this.confirmDelete()}>${t('ui.actionDelete')}</ion-button>
        <ion-button expand="block" fill="outline" ?disabled=${this.saving} @click=${() => (this.deleteTarget = null)}>${t('ui.btnCancel')}</ion-button>
      </ion-content>
    </ion-modal>`;
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    // A category cannot be its own parent (the server refuses it: `category_update_rejected`).
    const parentOptions = this.allCategories.filter((c) => c.id !== this.editingId);
    return html`<div class="page">
      ${this.formError ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : nothing}
      ${this.ctrl?.error ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : nothing}
      <ok-data-table .serverSide=${true} .fill=${true} .views=${true} .addable=${can('services.add_category')} .cardTitle=${(row: Record<string, unknown>) => String(row.name ?? '')} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? 'asc'} .searchable=${true} .searchPlaceholder=${t('ui.searchCategoryPlaceholder')} .actions=${this.actions} .emptyMessage=${this.ctrl?.loading ? t('ui.loading') : t('ui.emptyCategories')} @rowAction=${(e: CustomEvent<{ actionId: string; row: Record<string, unknown> }>) => this.onRowAction(e)} @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)} @pageSizeChange=${(e: CustomEvent<number>) => this.ctrl.setPageSize(e.detail)} @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)} @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)} @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.ctrl.setFilter(e.detail.col, e.detail.value)}>
        <form slot="create" class="form" @submit=${(e: Event) => this.save(e)}>
          ${this.editingId
            ? html`<ok-inline-feedback tone="info" icon="create-outline">
                <b>${t('ui.editingCategoryTitle')}</b> — ${this.newName}
                <ion-button size="small" fill="clear" @click=${() => this.cancelEdit()}>${t('ui.editingCancel')}</ion-button>
              </ok-inline-feedback>`
            : nothing}
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colName')} .value=${this.newName} @ionInput=${(e: any) => (this.newName = e.target.value)}></ion-input>
          <ion-select fill="outline" label-placement="floating" label=${t('ui.colParent')} placeholder=${t('ui.placeholderParent')} .value=${this.newParent} @ionChange=${(e: any) => (this.newParent = e.target.value)}>
            <ion-select-option value="">${t('ui.optionNoParent')}</ion-select-option>
            ${parentOptions.map((c) => html`<ion-select-option .value=${c.id}>${c.name}</ion-select-option>`)}
          </ion-select>
          <ion-input fill="outline" label-placement="floating" label=${t('ui.colSortOrder')} type="number" step="1" .value=${this.newSortOrder} @ionInput=${(e: any) => (this.newSortOrder = e.target.value)}></ion-input>
          <ion-button type="submit" ?disabled=${this.saving || !this.newName}>${this.saving ? t('ui.btnSaving') : this.editingId ? t('ui.btnSave') : t('ui.btnAdd')}</ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
    </div>`;
  }
}

define('erp-services-categories', ErpServicesCategories);
