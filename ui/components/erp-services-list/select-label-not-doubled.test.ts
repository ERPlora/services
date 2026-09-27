// services#57 — a floating label and a placeholder that repeats it are painted AT THE SAME TIME.
//
// `ion-select` with `label-placement="floating"` puts the label inside the field while it is empty
// and lifts it into the outline notch as soon as it is focused. The placeholder appears exactly
// THEN, inside the field. So a placeholder that only restates the label gives the user two nearly
// identical texts a few pixels apart — which is what "Categoría fiscal" over "Categoría fiscal…"
// looked like, on the one field that blocks the whole form (the fiscal category is mandatory,
// services#33): the field you stare at hardest when you cannot save is the one that reads broken.
//
// Verified against real Ionic in Chrome, not deduced: with the placeholder, the focused field
// paints «Categoría fiscal» in the notch AND «Categoría fiscal…» inside; without it, the notch
// keeps the label and the field is clean. It is also the rule Material states — a placeholder is a
// supplementary hint (a format, an example), never a second copy of the label.
//
// The guard is on the TEXT THE USER READS, resolved through `locales/es.json`, because that is
// where the duplication lives: in English the keys differ, in the catalogue they do not.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const ES = JSON.parse(readFileSync(join(ROOT, 'locales/es.json'), 'utf8')) as Record<string, unknown>;

/** `ui.colTax` → the Spanish string, the way the shell resolves it. */
const translate = (key: string): string => {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], ES);
  return typeof value === 'string' ? value : key;
};

/** Same text for the eye: case, spaces and the trailing ellipsis of a placeholder do not count. */
const reads = (s: string): string =>
  s.trim().toLowerCase().replace(/(\.\.\.|…)\s*$/, '').replace(/\s+/g, ' ');

beforeEach(() => {
  document.body.innerHTML = '';
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async () => ({ rows: [], total: 0 }),
    queryAll: async (name: string) =>
      name === 'taxes.categories.list'
        ? [{ id: 't1', key: 'service.generic', name: 'Servicio — general' }]
        : name === 'services.categories.list'
          ? [{ id: 'c1', name: 'Peluquería', slug: 'peluqueria', service_count: 1 }]
          : [],
    command: async () => ({}),
    on: () => () => {},
    locale: 'es',
    // The real client always exposes it (module-sdk getter): the list controller needs it for `moneyFilters`.
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => translate(key),
  };
});

async function mount() {
  await import('./erp-services-list');
  const el = document.createElement('erp-services-list');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el as HTMLElement & { shadowRoot: ShadowRoot };
}

describe('no field says its own name twice', () => {
  it('no `ion-select` of the form pairs a floating label with a placeholder that repeats it', async () => {
    const el = await mount();
    const selects = [...el.shadowRoot.querySelectorAll('ion-select')];
    expect(selects.length, 'the create form has no selects — the guard would pass for free').toBeGreaterThan(0);

    const doubled = selects
      .filter((s) => s.getAttribute('label-placement') === 'floating')
      .map((s) => ({ label: s.getAttribute('label') ?? '', placeholder: s.getAttribute('placeholder') ?? '' }))
      .filter((s) => s.placeholder && reads(s.placeholder) === reads(s.label))
      .map((s) => `${s.label} / ${s.placeholder}`);

    expect(
      doubled,
      'while the field is focused Ionic paints BOTH: the label in the notch and the placeholder inside',
    ).toEqual([]);
  });
});
