// pm#521 — the two MONEY fields of a voucher (the fixed discount and the closed price) read typed
// money with the shared toolkit piece (`@erplora/module-toolkit/money-input`, combos#9) instead of
// the local `toMinorOrNull` (`replace(',', '.')` + `majorToMinor`).
//
// Measured on origin/main@8f0de15 (a hub in euros, es):
//
//     closed price «1.250,50»      -> 0        the voucher sold for nothing
//     fixed discount «1.250,50»    -> 0        the discount silently dropped
//     «12abc»                      -> 1200     letters glued to the figure cleaned away
//     reopening 12345,50 €         -> «12345.5» a dot and one decimal in a Spanish hub
//
// What this module decides on top of the shared reading:
//   * an empty CLOSED PRICE is `null` — «no closed price, the lines minus the discount» — never 0,
//     which would sell the voucher free;
//   * an empty FIXED DISCOUNT is 0 (no discount);
//   * neither can be negative (`minimum: 0` in `package_create.json`/`package_update.json`): the
//     screen refuses it in words before the server answers with a raw schema detail;
//   * the PERCENTAGE discount is not money and keeps its own reading (basis points, services#55).
import { beforeEach, describe, expect, it } from 'vitest';

const ROWS = [
  { id: 'p1', name: 'Bono 5 cortes', slug: 'bono-5-cortes', discount_type: 'percentage', discount_percent_bp: 1000, discount_amount_cents: 0, fixed_price: null, is_active: 1, items: 1 },
];
const FULL = { ...ROWS[0], description: '', validity_days: 90, max_uses: 5, is_featured: 0 };
const SERVICES = [{ id: 's1', name: 'Corte', price: '1200' }];
type Cmd = { name: string; payload: Record<string, unknown> };
let commands: Cmd[] = [];
let full: Record<string, unknown> = FULL;

beforeEach(() => {
  commands = [];
  full = FULL;
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => (name === 'services.packages.get' ? [full] : []),
    queryPage: async () => ({ rows: ROWS, total: 1 }),
    queryAll: async (name: string) => (name === 'services.services.list' ? SERVICES : []),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'es',
    currency: 'EUR',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  };
});
const client = () => (globalThis as Record<string, any>).erplora;

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  editingId: string | null;
  formError: string;
  form: { name: string; discountType: string; discountValue: string; fixedPrice: string; validityDays: string; maxUses: string };
  items: { serviceId: string; sessions: string }[];
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  save(ev: Event): Promise<void>;
};

async function mount(): Promise<Mounted> {
  await import('./erp-services-packages');
  const el = document.createElement('erp-services-packages') as unknown as Mounted;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}
const settle = async (el: Mounted) => {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
};
const field = (el: Mounted, id: string) =>
  el.shadowRoot.querySelector(`[data-testid="services-packages-${id}"]`) as (HTMLElement & { value: string }) | null;

/** Creates a voucher (one line) with the typed money fields; returns the create payload, if any. */
async function createTyped(el: Mounted, form: { discountType?: string; discountValue?: string; fixedPrice?: string }) {
  el.form = { name: 'Bono', discountType: 'percentage', discountValue: '', fixedPrice: '', validityDays: '', maxUses: '', ...form };
  el.items = [{ serviceId: 's1', sessions: '5' }];
  commands = [];
  await el.save(new Event('submit'));
  return commands.find((c) => c.name === 'services.packages.create')?.payload;
}

/** Opens the edit panel of the voucher, then applies `form` and saves; returns the update payload. */
async function updateTyped(el: Mounted, form: Partial<Mounted['form']>) {
  await el.onRowAction(new CustomEvent('rowAction', { detail: { actionId: 'edit', row: ROWS[0] } }));
  await settle(el);
  el.form = { ...el.form, ...form };
  commands = [];
  await el.save(new Event('submit'));
  return commands.find((c) => c.name === 'services.packages.update')?.payload;
}

// HALLAZGO rv-395/rv-397: not guessed, and not this hub's money.
const GARBAGE = ['abc', '12abc', '12−', '(12)', '$12', '1.5k'];
// HALLAZGO rv-122: money-input KEEPS the sign; the minus may be ASCII or U+2212.
const NEGATIVE = ['-1.250,50', '−1.250,50', '-0,01'];

describe('the closed price of a voucher is read by the shared money-input piece (pm#521)', () => {
  it.each([
    { typed: '1.250,50', minor: 125050 },
    { typed: '1,250.50', minor: 125050 },
    { typed: '40', minor: 4000 },
    { typed: '0', minor: 0 },
  ])('«$typed» is saved as $minor', async ({ typed, minor }) => {
    const el = await mount();
    expect((await createTyped(el, { fixedPrice: typed }))?.fixed_price).toBe(minor);
    expect(el.formError).toBe('');
  });

  it('an empty closed price is null (the lines minus the discount), never 0', async () => {
    const el = await mount();
    const sent = await createTyped(el, { fixedPrice: '  ' });
    expect(sent, 'an empty closed price blocked the save').toBeTruthy();
    expect(sent!.fixed_price).toBeNull();
  });

  it.each(GARBAGE)('«%s» is refused as not an amount, and nothing is created', async (typed) => {
    const el = await mount();
    expect(await createTyped(el, { fixedPrice: typed }), `«${typed}» was guessed and saved`).toBeUndefined();
    expect(el.formError).toContain('ui.errNotAnAmount');
    expect(el.formError, 'the refusal does not say WHICH field').toContain('ui.colFixedPrice');
  });

  it('«1.250» is refused as ambiguous, quoting what was typed and both readings in the hub locale', async () => {
    const el = await mount();
    expect(await createTyped(el, { fixedPrice: ' 1.250 ' })).toBeUndefined();
    expect(el.formError).toContain('ui.errAmbiguousAmount');
    expect(el.formError).toContain('"typed":"1.250"');
    expect(el.formError).toContain('"grouped":"1250,00"');
    expect(el.formError).toContain('"decimal":"1,25"');
  });

  it.each(NEGATIVE)('a negative closed price «%s» is refused in words, never saved nor turned positive', async (typed) => {
    const el = await mount();
    expect(await createTyped(el, { fixedPrice: typed })).toBeUndefined();
    expect(el.formError).toContain('ui.errNegativeAmount');
    expect(el.formError).not.toContain('ui.errNotAnAmount');
  });

  // HALLAZGO rv-43: HALF_UP on the typed DIGITS, never on a float.
  it('decimals beyond the currency are rounded HALF_UP on the typed digits', async () => {
    const el = await mount();
    expect((await createTyped(el, { fixedPrice: '1.250,505' }))?.fixed_price).toBe(125051);
    expect((await createTyped(el, { fixedPrice: '12,5549' }))?.fixed_price).toBe(1255);
  });

  // HALLAZGO rv-397: the no-break spaces Intl prints. Written as escapes on purpose.
  it.each([
    { label: 'NBSP', typed: '1\u00a0250,50' },
    { label: 'NNBSP + NBSP before the symbol', typed: '1\u202f250,50\u00a0€' },
    { label: 'thin space', typed: '1\u2009250,50' },
  ])('a closed price pasted with a $label as its grouping is read (125050)', async ({ typed }) => {
    const el = await mount();
    expect((await createTyped(el, { fixedPrice: typed }))?.fixed_price).toBe(125050);
  });

  it('the hub currency written by its code is cleaned («EUR 40» → 4000)', async () => {
    const el = await mount();
    expect((await createTyped(el, { fixedPrice: 'EUR 40' }))?.fixed_price).toBe(4000);
  });

  it('the edit door reads the same way, and refuses the same way', async () => {
    const el = await mount();
    expect((await updateTyped(el, { fixedPrice: '1.250,50' }))?.fixed_price).toBe(125050);
    expect(await updateTyped(el, { fixedPrice: '12abc' })).toBeUndefined();
    expect(el.formError).toContain('ui.errNotAnAmount');
    expect(await updateTyped(el, { fixedPrice: '-5' })).toBeUndefined();
    expect(el.formError).toContain('ui.errNegativeAmount');
  });
});

describe('the FIXED discount of a voucher is read by the shared money-input piece (pm#521)', () => {
  it.each([
    { typed: '1.250,50', minor: 125050 },
    { typed: '1,250.50', minor: 125050 },
    { typed: '5', minor: 500 },
  ])('«$typed» is saved as $minor', async ({ typed, minor }) => {
    const el = await mount();
    const sent = await createTyped(el, { discountType: 'fixed', discountValue: typed });
    expect(sent?.discount_amount_cents).toBe(minor);
    expect(sent?.discount_percent_bp).toBeNull();
  });

  it('an empty fixed discount is 0 (no discount), not a refusal', async () => {
    const el = await mount();
    expect((await createTyped(el, { discountType: 'fixed', discountValue: '' }))?.discount_amount_cents).toBe(0);
  });

  it.each(GARBAGE)('«%s» is refused as not an amount, and nothing is created', async (typed) => {
    const el = await mount();
    expect(await createTyped(el, { discountType: 'fixed', discountValue: typed })).toBeUndefined();
    expect(el.formError).toContain('ui.errNotAnAmount');
    expect(el.formError, 'the refusal does not say WHICH field').toContain('ui.colDiscountAmount');
  });

  it('«1.250» is refused as ambiguous', async () => {
    const el = await mount();
    expect(await createTyped(el, { discountType: 'fixed', discountValue: '1.250' })).toBeUndefined();
    expect(el.formError).toContain('ui.errAmbiguousAmount');
  });

  it.each(NEGATIVE)('a negative fixed discount «%s» is refused in words', async (typed) => {
    const el = await mount();
    expect(await createTyped(el, { discountType: 'fixed', discountValue: typed })).toBeUndefined();
    expect(el.formError).toContain('ui.errNegativeAmount');
  });

  it('the percentage discount keeps its own reading: «10,5» is 1050 basis points, not money', async () => {
    const el = await mount();
    const sent = await createTyped(el, { discountType: 'percentage', discountValue: '10,5' });
    expect(sent?.discount_percent_bp).toBe(1050);
    expect(sent?.discount_amount_cents).toBeNull();
  });

  it('the edit door sends the fixed discount read the same way', async () => {
    const el = await mount();
    expect((await updateTyped(el, { discountType: 'fixed', discountValue: '1.250,50' }))?.discount_amount_cents).toBe(125050);
  });
});

describe('reopening and leaving the money fields (pm#521)', () => {
  // es does not group four digits: 12345,50 is what proves the field is filled WITHOUT grouping.
  it('reopening fills «12345,50» in both money fields and saves back the same amounts', async () => {
    full = { ...FULL, discount_type: 'fixed', discount_percent_bp: null, discount_amount_cents: 1234550, fixed_price: 1234550 };
    const el = await mount();
    await el.onRowAction(new CustomEvent('rowAction', { detail: { actionId: 'edit', row: ROWS[0] } }));
    await settle(el);
    expect(el.form.discountValue).toBe('12345,50');
    expect(el.form.fixedPrice).toBe('12345,50');
    commands = [];
    await el.save(new Event('submit'));
    const sent = commands.find((c) => c.name === 'services.packages.update')?.payload;
    expect(sent?.discount_amount_cents).toBe(1234550);
    expect(sent?.fixed_price).toBe(1234550);
  });

  it('leaving the closed price rewrites a pasted «1\u202f250,50» as «1250,50»', async () => {
    const el = await mount();
    const f = field(el, 'fixed-price')!;
    f.value = '1\u202f250,50';
    f.dispatchEvent(new CustomEvent('ionInput'));
    await settle(el);
    f.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.form.fixedPrice).toBe('1250,50');
  });

  it('leaving an EMPTY closed price keeps it empty (no closed price), not «0,00»', async () => {
    const el = await mount();
    const f = field(el, 'fixed-price')!;
    f.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.form.fixedPrice).toBe('');
  });

  it('leaving a FIXED discount rewrites it; a PERCENTAGE is left exactly as typed', async () => {
    const el = await mount();
    el.form = { ...el.form, discountType: 'fixed' };
    await settle(el);
    const f = field(el, 'discount-value')!;
    f.value = '1.250,5';
    f.dispatchEvent(new CustomEvent('ionInput'));
    await settle(el);
    f.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.form.discountValue).toBe('1250,50');

    el.form = { ...el.form, discountType: 'percentage', discountValue: '' };
    await settle(el);
    f.value = '10,5';
    f.dispatchEvent(new CustomEvent('ionInput'));
    await settle(el);
    f.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.form.discountValue, 'a percentage was rewritten as money').toBe('10,5');
  });

  it('a KWD hub rewrites the closed price to its three decimals on blur', async () => {
    Object.assign(client(), { currency: 'KWD', currencyDecimals: 3, locale: 'en' });
    const el = await mount();
    const f = field(el, 'fixed-price')!;
    f.value = 'KWD 12.5';
    f.dispatchEvent(new CustomEvent('ionInput'));
    await settle(el);
    f.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.form.fixedPrice).toBe('12.500');
  });

  it('both money fields are text fields with the decimal keyboard, never type=number', async () => {
    const el = await mount();
    for (const id of ['fixed-price', 'discount-value']) {
      expect(field(el, id)!.getAttribute('type'), id).toBe('text');
      expect(field(el, id)!.getAttribute('inputmode'), id).toBe('decimal');
    }
  });

  // cash_register-wt-521: the SDK's `t` reads `this.locale`; a detached `t` mutes every refusal.
  it('the refusal is written with the client `t` called as a METHOD (it reads `this`)', async () => {
    const c = client();
    const arrow = c.t;
    c.t = function t(this: { locale?: string } | undefined, catalog: unknown, key: string, params?: Record<string, unknown>) {
      if (!this || this.locale !== 'es') throw new TypeError('t() called without its client');
      return arrow(catalog, key, params);
    };
    const el = await mount();
    expect(await createTyped(el, { fixedPrice: '1.250' })).toBeUndefined();
    expect(el.formError).toContain('ui.errAmbiguousAmount');
  });
});
