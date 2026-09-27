// pm#478 (out of staff#72) — on a phone, a refused save in Services showed NOTHING: the person
// pressed «Add» or «Save» and the screen stayed as it was.
//
// The refusal did arrive and was translated; it was painted in the wrong place. Every form of this
// module lives in the `create` panel of its `ok-data-table`, and under 834 px that panel is a
// FULL-SCREEN sheet (`position: fixed; inset: 0; z-index: 1000`, outfitkit#75). The error banner was
// a child of the PAGE, so on a phone it sat under the sheet, out of sight. On a desktop the panel
// sits beside the table and the banner happened to be visible, which is why only mobile saw it.
//
// The rule this file fixes, for the three screens (services, categories, vouchers) — the same one
// Personal (staff#75) and Customers (customers#97) follow:
//
//   · what goes wrong while SAVING the panel's form is painted INSIDE that form, next to the button
//     that was pressed, and scrolled into view — it travels with the panel whatever the width;
//   · what goes wrong in a ROW action (archive, restore, delete — confirmed on the page) stays on
//     the PAGE: no panel is open then, and a message inside a closed panel is just as invisible;
//   · a later save that works clears the page refusal too: it is the next thing the person did.
//
// It is what Square, Shopify and Odoo do in their side/sheet forms: the error of a submit lives in
// the form that was submitted.
import { beforeEach, describe, expect, it, vi } from 'vitest';

class DomainError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const SERVICE = { id: 's1', name: 'Corte', price: '1200', pricing_type: 'fixed', duration_minutes: 30, is_bookable: 1, category_id: '', category: '', tax_category_key: 'standard', status: 'active' };
const CATEGORY = { id: 'c1', name: 'Peluquería', parent_id: null, sort_order: 0, service_count: 0 };
const PACKAGE = { id: 'p1', name: 'Bono 5 cortes', discount_type: 'percentage', discount_percent_bp: 1000, discount_amount_cents: 0, fixed_price: null, validity_days: 90, max_uses: 5 };

let refusal: Error | null = null;
/** Every element the component scrolled into view AFTER it had painted itself, in order. Scrolling a
 *  banner that has not rendered yet measures a 0-px box: the sheet stops with the banner still half
 *  under the tab bar (seen in the staff#72 bench at 390 px). */
let revealed: Element[] = [];

beforeEach(() => {
  refusal = null;
  revealed = [];
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
    if ((this as HTMLElement & { hasUpdated?: boolean }).hasUpdated !== false) revealed.push(this);
  });
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      if (name === 'services.services.get') return [SERVICE];
      if (name === 'services.packages.get') return [PACKAGE];
      return [];
    },
    queryOptional: async () => undefined,
    queryAll: async () => [],
    queryPage: async () => ({ rows: [], total: 0 }),
    command: async () => {
      if (refusal) throw refusal;
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string) => key,
  };
});

type Wc = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> } & Record<string, any>;

async function mount(tag: string, path: string): Promise<Wc> {
  await import(path);
  const el = document.createElement(tag) as Wc;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

async function settle(el: Wc): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
}

const submitEvent = (): Event => new Event('submit', { cancelable: true });
const rowAction = (actionId: string, row: object): CustomEvent =>
  new CustomEvent('rowAction', { detail: { actionId, row } });

/** The error banner INSIDE the panel's form, or null. */
const inForm = (el: Wc, testid: string): Element | null =>
  el.shadowRoot.querySelector(`form[slot="create"] [data-testid="${testid}"]`);

/** The banner inside the form AND scrolled into view: pressing the button at the foot of a long
 *  form, the banner that appears above it is pushed half off a phone screen otherwise. */
const inFormAndRevealed = (el: Wc, testid: string): Element | null => {
  const banner = inForm(el, testid);
  return banner && revealed.includes(banner) ? banner : null;
};

/** The error banner on the PAGE (outside the panel), or null. */
const onPage = (el: Wc, testid: string): Element | null => {
  const banner = el.shadowRoot.querySelector(`[data-testid="${testid}"]`);
  return banner && !banner.closest('form[slot="create"]') ? banner : null;
};

/** How each screen is driven: fill a valid new row, save it, and ask for / confirm the
 *  destructive row action (archive for services, delete for categories and vouchers). */
interface Screen {
  surface: string;
  tag: string;
  path: string;
  row: Record<string, unknown>;
  fill: (el: Wc) => void;
  save: (el: Wc) => Promise<void>;
  destroyAction: string;
  confirmDestroy: (el: Wc) => Promise<void>;
}

const SCREENS: Screen[] = [
  {
    surface: 'services-list',
    tag: 'erp-services-list',
    path: '../components/erp-services-list/erp-services-list',
    row: SERVICE,
    fill: (el) => { el.newName = 'Manicura'; el.newTaxRateId = 'standard'; },
    save: (el) => el.createService(submitEvent()),
    destroyAction: 'archive',
    confirmDestroy: (el) => el.confirmArchive(),
  },
  {
    surface: 'services-categories',
    tag: 'erp-services-categories',
    path: '../components/erp-services-categories/erp-services-categories',
    row: CATEGORY,
    fill: (el) => { el.newName = 'Estética'; },
    save: (el) => el.save(submitEvent()),
    destroyAction: 'delete',
    confirmDestroy: (el) => el.confirmDelete(),
  },
  {
    surface: 'services-packages',
    tag: 'erp-services-packages',
    path: '../components/erp-services-packages/erp-services-packages',
    row: PACKAGE,
    fill: (el) => {
      el.form = { ...el.form, name: 'Bono 10 cortes' };
      el.items = [{ serviceId: 's1', sessions: '10' }];
    },
    save: (el) => el.save(submitEvent()),
    destroyAction: 'delete',
    confirmDestroy: (el) => el.confirmDelete(),
  },
];

/** A row action the server refuses, confirmed on the page. */
async function refusedDestroy(el: Wc, s: Screen): Promise<void> {
  await el.onRowAction(rowAction(s.destroyAction, s.row));
  refusal = new DomainError('services.in_use', 'in use');
  await s.confirmDestroy(el);
  await settle(el);
}

describe.each(SCREENS)('pm#478 · $surface: save refusal in the form, row refusal on the page', (s) => {
  const formError = `${s.surface}-form-error`;
  const pageError = `${s.surface}-page-error`;

  it('a refused «Add» lands in the form, translated, and is scrolled into view', async () => {
    const el = await mount(s.tag, s.path);
    s.fill(el);
    refusal = new DomainError('services.rejected', 'rejected');
    await s.save(el);
    await settle(el);
    const banner = inForm(el, formError);
    expect(banner, 'on a phone the panel covers the page: the refusal has to travel with the form').not.toBeNull();
    expect(inFormAndRevealed(el, formError), 'and it is scrolled into view').not.toBeNull();
    expect(banner?.textContent?.trim()).toBe('rejected');
    expect(onPage(el, pageError), 'the page under the sheet shows nothing').toBeNull();
    expect(onPage(el, formError), 'the old page banner is gone').toBeNull();
  });

  it('a refused «Save» of an edited row lands in the form too', async () => {
    const el = await mount(s.tag, s.path);
    await el.onRowAction(rowAction('edit', s.row));
    await settle(el);
    refusal = new DomainError('services.rejected', 'rejected');
    await s.save(el);
    await settle(el);
    expect(inFormAndRevealed(el, formError)).not.toBeNull();
  });

  it('a new attempt clears the previous refusal of the form', async () => {
    const el = await mount(s.tag, s.path);
    s.fill(el);
    refusal = new DomainError('services.rejected', 'rejected');
    await s.save(el);
    refusal = null;
    s.fill(el);
    await s.save(el);
    await settle(el);
    expect(inForm(el, formError)).toBeNull();
  });

  it('opening a row to edit after a refused save does not carry that refusal into its form', async () => {
    const el = await mount(s.tag, s.path);
    s.fill(el);
    refusal = new DomainError('services.rejected', 'rejected');
    await s.save(el);
    await el.onRowAction(rowAction('edit', s.row));
    await settle(el);
    expect(inForm(el, formError)).toBeNull();
  });

  it('a refused row action (confirmed on the page, no panel open) is shown on the page', async () => {
    const el = await mount(s.tag, s.path);
    await refusedDestroy(el, s);
    const banner = onPage(el, pageError);
    expect(banner, 'no panel is open: inside the form it would be invisible').not.toBeNull();
    expect(banner?.textContent?.trim()).toBe('in use');
    expect(inForm(el, formError)).toBeNull();
  });

  it('the page error of a refused row action goes away once a later save succeeds', async () => {
    const el = await mount(s.tag, s.path);
    await refusedDestroy(el, s);
    refusal = null;
    s.fill(el);
    await s.save(el);
    await settle(el);
    expect(onPage(el, pageError), 'a stale refusal must not stay red after a save that worked').toBeNull();
  });

  it('the page error of a refused row action goes away once a later EDIT save succeeds', async () => {
    const el = await mount(s.tag, s.path);
    await refusedDestroy(el, s);
    refusal = null;
    await el.onRowAction(rowAction('edit', s.row));
    await settle(el);
    await s.save(el);
    await settle(el);
    expect(onPage(el, pageError), 'saving an edit is a save too: the stale refusal goes').toBeNull();
  });

  it('asking for the row action again hides the previous refusal until the new answer arrives', async () => {
    const el = await mount(s.tag, s.path);
    await refusedDestroy(el, s);
    refusal = null;
    await el.onRowAction(rowAction(s.destroyAction, s.row));
    await settle(el);
    expect(onPage(el, pageError)).toBeNull();
  });

  it('opening the panel after a refused row action does not carry that page error into the form', async () => {
    const el = await mount(s.tag, s.path);
    await refusedDestroy(el, s);
    await el.onRowAction(rowAction('edit', s.row));
    await settle(el);
    expect(inForm(el, formError)).toBeNull();
  });
});

describe('pm#478 · refusals the screen itself raises before calling the server', () => {
  it('services: «tax category required» is said inside the form, scrolled into view', async () => {
    const el = await mount('erp-services-list', '../components/erp-services-list/erp-services-list');
    el.newName = 'Manicura';
    el.newTaxRateId = '';
    await el.createService(submitEvent());
    await settle(el);
    expect(inFormAndRevealed(el, 'services-list-form-error')?.textContent?.trim()).toBe('ui.errorTaxRequired');
  });

  it('services: clearing the tax category of an edited service is said inside the form too', async () => {
    const el = await mount('erp-services-list', '../components/erp-services-list/erp-services-list');
    await el.onRowAction(rowAction('edit', SERVICE));
    await settle(el);
    el.newTaxRateId = '';
    await el.createService(submitEvent());
    await settle(el);
    expect(inFormAndRevealed(el, 'services-list-form-error')?.textContent?.trim()).toBe('ui.errorTaxRequired');
  });

  it('vouchers: «a voucher needs at least one service» is said inside the form, scrolled into view', async () => {
    const el = await mount('erp-services-packages', '../components/erp-services-packages/erp-services-packages');
    el.form = { ...el.form, name: 'Bono vacío' };
    el.items = [{ serviceId: '', sessions: '1' }];
    await el.save(submitEvent());
    await settle(el);
    expect(inFormAndRevealed(el, 'services-packages-form-error')?.textContent?.trim()).toBe('ui.errorPackageNoLines');
  });
});

describe('pm#478 · services: a refused «Restore» of an archived service', () => {
  const path = '../components/erp-services-list/erp-services-list';

  it('is shown on the page, not in the (closed) form', async () => {
    const el = await mount('erp-services-list', path);
    refusal = new DomainError('services.service_unavailable', 'unavailable');
    await el.onRowAction(rowAction('restore', SERVICE));
    await settle(el);
    expect(onPage(el, 'services-list-page-error')?.textContent?.trim()).toBe('unavailable');
    expect(inForm(el, 'services-list-form-error')).toBeNull();
  });

  it('goes away when the next restore works', async () => {
    const el = await mount('erp-services-list', path);
    refusal = new DomainError('services.service_unavailable', 'unavailable');
    await el.onRowAction(rowAction('restore', SERVICE));
    refusal = null;
    await el.onRowAction(rowAction('restore', SERVICE));
    await settle(el);
    expect(onPage(el, 'services-list-page-error')).toBeNull();
  });
});
