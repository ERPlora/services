// services#50 — what the shop owner reads when an operation is refused is a SENTENCE, never sqlx.
//
// The screen used to paint `e.message` verbatim, so the bind bug of this issue reached the user as:
//
//     db: sqlx: error returned from database: incorrect binary data format in bind parameter 12
//     at line 1942
//
// Two things wrong with that, and the bind fix only removes one of them. The owner cannot act on
// that text, and it publishes the engine, its driver and an internal line number. The runtime
// serializing the raw `Display` of any error is hub#1074 and is not ours to fix — but WHAT THIS
// MODULE PAINTS is, and it must hold whatever the server sends.
//
// The contract fixed here, same one `pricing` reached in pricing#29 and `staff` in staff#1:
//   * a code this module OWNS (its `expect_rows` errors) is shown as its translated sentence,
//     out of `locales/<lang>.json → errors`, which is where the module's public ABI is spelled;
//   * another code — a shell one such as `hub.elevation.*` — keeps the server's sentence, which is
//     the only description that exists and is written for a person;
//   * a message carrying driver marks, or nothing thrown that is an Error at all, collapses to the
//     module's own generic text. The driver NEVER reaches the screen, with or without a code.
import { beforeEach, describe, expect, it } from 'vitest';

import esLocale from '../../../locales/es.json';

const RAW_SQLX =
  'db: sqlx: error returned from database: incorrect binary data format in bind parameter 12 at line 1942';

let failWith: unknown = null;

beforeEach(() => {
  failWith = null;
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async () => ({ rows: [], total: 0 }),
    queryAll: async (name: string) =>
      name === 'taxes.categories.list' ? [{ id: 't1', key: 'standard', name: 'IVA general' }] : [],
    command: async () => {
      if (failWith) throw failWith;
      return {};
    },
    on: () => () => {},
    locale: 'es',
    // The real client always exposes it (module-sdk getter): the list controller needs it for `moneyFilters`.
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
  };
});

async function mount() {
  await import('./erp-services-list');
  const el = document.createElement('erp-services-list');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el as unknown as {
    newName: string;
    newPrice: string;
    newDuration: string;
    newCategory: string;
    newTaxRateId: string;
    formError: string;
    createService: (ev: Event) => Promise<void>;
  };
}

async function createWith(error: unknown) {
  const wc = await mount();
  failWith = error;
  wc.newName = 'Manicura';
  wc.newPrice = '18,50';
  wc.newDuration = '45';
  wc.newTaxRateId = 'standard';
  await wc.createService(new Event('submit'));
  return wc.formError;
}

/** The shape the SDK throws: an `Error` carrying the server's stable `code`. */
function serverError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('the create panel never shows the database talking', () => {
  it('a raw sqlx rejection becomes the module generic message', async () => {
    const shown = await createWith(serverError('error', RAW_SQLX));
    expect(shown.toLowerCase()).not.toContain('sqlx');
    expect(shown.toLowerCase()).not.toContain('bind parameter');
    expect(shown, 'the generic message of the module is what is left').toBe('ui.errorCreate');
  });

  it('a domain code of this module is shown TRANSLATED, not as the English of the manifest', async () => {
    const shown = await createWith(
      serverError('services.category_unavailable', 'That category is not available: it does not exist…'),
    );
    expect(shown).toBe(esLocale.errors['services.category_unavailable']);
  });

  it('a driver message under ANOTHER code is dropped just the same', async () => {
    const shown = await createWith(
      serverError('hub.something_new', 'db: sqlx: duplicate key value violates constraint at line 4'),
    );
    expect(shown).toBe('ui.errorCreate');
  });

  it("a shell code the module does not own keeps its own sentence — it is written for a person", async () => {
    const shown = await createWith(
      serverError('hub.elevation.required', 'A manager has to approve this before it can be saved.'),
    );
    expect(shown).toBe('A manager has to approve this before it can be saved.');
  });

  it('something that is not an Error still leaves a message', async () => {
    const shown = await createWith('boom');
    expect(shown).toBe('ui.errorCreate');
  });
});
