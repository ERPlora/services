// pm#521 — the service PRICE field reads typed money with the shared toolkit piece
// (`@erplora/module-toolkit/money-input`, combos#9) instead of its own `replace(',', '.')`.
//
// Measured on origin/main@8f0de15 with the local `toMinorUnits` (a hub in euros, es):
//
//     «1.250,50»   -> 0        the price the table prints two centimetres away, saved FREE
//     «1,250.50»   -> 0        the same amount written the English way
//     «12abc»      -> 1200     letters glued to the figure cleaned away
//     «1.250»      -> 125      1250 or 1,25? guessed as 1,25 without a word
//
// What this module decides on top of the shared reading: an EMPTY price is 0 (the column is
// `NOT NULL DEFAULT 0`, a free service is legitimate), and a NEGATIVE price is refused in words on
// the screen — `minimum: 0` in `service_create.json`/`service_update.json` would refuse it too, but
// with the raw schema detail instead of a sentence.
import { beforeEach, describe, expect, it } from 'vitest';

type Cmd = { name: string; payload: Record<string, unknown> };
let commands: Cmd[] = [];

function sdk(over: Record<string, unknown> = {}) {
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async () => ({ rows: [], total: 0 }),
    queryAll: async () => [],
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    locale: 'es',
    currency: 'EUR',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    ...over,
  };
}
const client = () => (globalThis as Record<string, any>).erplora;

beforeEach(() => {
  commands = [];
  sdk();
});

type Form = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  newName: string;
  newPrice: string;
  newTaxRateId: string;
  formError: string;
  onRowAction(ev: { detail: { actionId: string; row: Record<string, unknown> } }): Promise<void>;
  createService(ev: Event): Promise<void>;
};

async function mount(): Promise<Form> {
  await import('./erp-services-list');
  const el = document.createElement('erp-services-list') as Form;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}
const settle = async (el: Form) => {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
};
const priceField = (el: Form) => el.shadowRoot.querySelector('[data-testid="services-list-price"]') as (HTMLElement & { value: string; type: string; inputmode?: string }) | null;

/** Creates a service with `typed` in the price field; returns the price sent, or undefined. */
async function createTyped(el: Form, typed: string): Promise<unknown> {
  el.newName = 'Corte';
  el.newTaxRateId = 'service.generic';
  el.newPrice = typed;
  commands = [];
  await el.createService(new Event('submit'));
  const sent = commands.find((c) => c.name === 'services.services.create');
  return sent ? sent.payload.price : undefined;
}

const ROW = { id: 's1', name: 'Corte', price: '1800', duration_minutes: 30, tax_category_key: 'service.generic' };

/** Opens the edit panel, types `typed` and saves; returns the price the update sent, or undefined. */
async function updateTyped(el: Form, typed: string): Promise<unknown> {
  await el.onRowAction({ detail: { actionId: 'edit', row: ROW } });
  await settle(el);
  el.newPrice = typed;
  commands = [];
  await el.createService(new Event('submit'));
  const sent = commands.find((c) => c.name === 'services.services.update');
  return sent ? sent.payload.price : undefined;
}

// HALLAZGO rv-395/rv-397: not guessed, and not this hub's money.
const GARBAGE = ['abc', '12abc', '12−', '(12)', '$12', '1.5k'];
// HALLAZGO rv-122: money-input KEEPS the sign; the minus may be ASCII or U+2212.
const NEGATIVE = ['-1.250,50', '−1.250,50', '-0,01'];

describe('the service price is read by the shared money-input piece (pm#521)', () => {
  it.each([
    { typed: '1.250,50', minor: 125050 },
    { typed: '1,250.50', minor: 125050 },
    { typed: '1250,5', minor: 125050 },
    { typed: '12', minor: 1200 },
    { typed: '1.250.000', minor: 125000000 },
  ])('«$typed» is saved as $minor on create', async ({ typed, minor }) => {
    const el = await mount();
    expect(await createTyped(el, typed)).toBe(minor);
    expect(el.formError).toBe('');
  });

  it('the edit door reads the same way: «1.250,50» updates the price to 125050', async () => {
    const el = await mount();
    expect(await updateTyped(el, '1.250,50')).toBe(125050);
  });

  it.each(GARBAGE)('«%s» is refused as not an amount, and nothing is created', async (typed) => {
    const el = await mount();
    expect(await createTyped(el, typed), `«${typed}» was guessed and saved`).toBeUndefined();
    expect(el.formError).toContain('ui.errNotAnAmount');
  });

  it('an unreadable price is refused on the EDIT door too, and nothing is updated', async () => {
    const el = await mount();
    expect(await updateTyped(el, '12abc')).toBeUndefined();
    expect(el.formError).toContain('ui.errNotAnAmount');
  });

  it('«1.250» is refused as ambiguous, quoting what was typed and both readings in the hub locale', async () => {
    const el = await mount();
    expect(await createTyped(el, '1.250')).toBeUndefined();
    expect(el.formError).toContain('ui.errAmbiguousAmount');
    expect(el.formError).toContain('"typed":"1.250"');
    expect(el.formError).toContain('"grouped":"1250,00"');
    expect(el.formError).toContain('"decimal":"1,25"');
  });

  it('the ambiguous refusal quotes a paste without the spaces around it', async () => {
    const el = await mount();
    expect(await createTyped(el, ' 1.250 ')).toBeUndefined();
    expect(el.formError).toContain('"typed":"1.250"');
  });

  it.each(NEGATIVE)('a negative price «%s» is refused in words, never saved nor turned positive', async (typed) => {
    const el = await mount();
    expect(await createTyped(el, typed), 'a negative price reached the command').toBeUndefined();
    expect(el.formError).toContain('ui.errNegativeAmount');
    expect(el.formError, 'a negative is read, then refused: it is not "not an amount"').not.toContain('ui.errNotAnAmount');
  });

  it('a negative price is refused on the EDIT door too', async () => {
    const el = await mount();
    expect(await updateTyped(el, '-5')).toBeUndefined();
    expect(el.formError).toContain('ui.errNegativeAmount');
  });

  it('zero is a price (a free service), not a refusal', async () => {
    const el = await mount();
    expect(await createTyped(el, '0,00')).toBe(0);
    expect(el.formError).toBe('');
  });

  it('an empty price is 0 (the column is NOT NULL DEFAULT 0), not a refusal', async () => {
    const el = await mount();
    expect(await createTyped(el, '   ')).toBe(0);
    expect(el.formError).toBe('');
  });

  // HALLAZGO rv-43: HALF_UP on the typed DIGITS, never on a float (1250.505 * 100 = 125050.4999…).
  it('decimals beyond the currency are rounded HALF_UP on the typed digits', async () => {
    const el = await mount();
    expect(await createTyped(el, '1.250,505'), 'rounded on a float, a cent lost').toBe(125051);
    expect(await createTyped(el, '12,5549'), 'rounded up below the half').toBe(1255);
  });

  // HALLAZGO rv-397: the no-break spaces Intl prints. Written as escapes on purpose.
  it.each([
    { label: 'NBSP', typed: '1\u00a0250,50' },
    { label: 'NNBSP + NBSP before the symbol', typed: '1\u202f250,50\u00a0€' },
    { label: 'thin space', typed: '1\u2009250,50' },
  ])('a price pasted with a $label as its grouping is read (125050)', async ({ typed }) => {
    const el = await mount();
    expect(await createTyped(el, typed)).toBe(125050);
  });

  it('the hub currency written by its code is cleaned («EUR 12» → 1200)', async () => {
    const el = await mount();
    expect(await createTyped(el, 'EUR 12')).toBe(1200);
  });

  it('the hub currency as the hub prints it: JPY in ja «1,250￥» is 1250, not ambiguous', async () => {
    Object.assign(client(), { currency: 'JPY', currencyDecimals: 0, locale: 'ja' });
    const el = await mount();
    expect(await createTyped(el, '1,250￥')).toBe(1250);
  });

  // es does not group four digits: 12345,50 is what proves the field is filled WITHOUT grouping.
  it('reopening a service fills «12345,50» (no grouping) and it saves back as the same amount', async () => {
    const el = await mount();
    await el.onRowAction({ detail: { actionId: 'edit', row: { ...ROW, price: '1234550' } } });
    await settle(el);
    expect(el.newPrice).toBe('12345,50');
    commands = [];
    await el.createService(new Event('submit'));
    expect(commands.find((c) => c.name === 'services.services.update')?.payload.price).toBe(1234550);
  });

  it('leaving the field rewrites a pasted «1\u202f250,50» as «1250,50»', async () => {
    const el = await mount();
    const field = priceField(el)!;
    field.value = '1\u202f250,50';
    field.dispatchEvent(new CustomEvent('ionInput'));
    await settle(el);
    field.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.newPrice).toBe('1250,50');
  });

  it('leaving the field leaves an unreadable amount EXACTLY as typed', async () => {
    const el = await mount();
    const field = priceField(el)!;
    field.value = '1.250';
    field.dispatchEvent(new CustomEvent('ionInput'));
    await settle(el);
    field.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.newPrice).toBe('1.250');
  });

  it('a KWD hub rewrites the price to its three decimals on blur', async () => {
    Object.assign(client(), { currency: 'KWD', currencyDecimals: 3, locale: 'en' });
    const el = await mount();
    const field = priceField(el)!;
    field.value = 'KWD 12.5';
    field.dispatchEvent(new CustomEvent('ionInput'));
    await settle(el);
    field.dispatchEvent(new CustomEvent('ionBlur'));
    await settle(el);
    expect(el.newPrice).toBe('12.500');
  });

  // inventory-wt-521: `type="number"` DROPS a pasted «1.250,50» in a real browser before any reader
  // sees it. The field must stay text with the decimal keyboard.
  it('the price field is a text field with the decimal keyboard, never type=number', async () => {
    const el = await mount();
    const field = priceField(el)!;
    expect(field.getAttribute('type')).toBe('text');
    expect(field.getAttribute('inputmode')).toBe('decimal');
  });

  // cash_register-wt-521: a helper that detaches `t` from the client loses `this`, and the SDK's
  // `t` reads `this.locale` — a TypeError on every refusal and a mute screen. This `t` is a METHOD.
  it('the refusal is written with the client `t` called as a METHOD (it reads `this`)', async () => {
    const c = client();
    const arrow = c.t;
    c.t = function t(this: { locale?: string } | undefined, catalog: unknown, key: string, params?: Record<string, unknown>) {
      if (!this || this.locale !== 'es') throw new TypeError('t() called without its client');
      return arrow(catalog, key, params);
    };
    const el = await mount();
    expect(await createTyped(el, '12abc')).toBeUndefined();
    expect(el.formError).toContain('ui.errNotAnAmount');
    expect(await createTyped(el, '1.250')).toBeUndefined();
    expect(el.formError).toContain('ui.errAmbiguousAmount');
  });
});
