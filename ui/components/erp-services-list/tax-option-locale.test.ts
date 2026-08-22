// services#54 — the fiscal-category selector of the service form spoke in tongues.
//
// What the hairdresser saw when opening «Categoría fiscal»:
//
//     Service — generic (service.generic)
//     Product — reduced (food staples, pharmacy) (product.reduced)
//
// Two sins, two owners:
//   * the `(service.generic)` tail is THIS screen's: `taxes.categories.list` never returned it,
//     the option was composed as `${name} (${key})`;
//   * the English text is the seed's — and its translation already travels in the CONTRACT
//     (`display_name`, resolved to the hub's language by `taxes`, taxes#38/#40). Same fix as
//     inventory#64: read that column, order by it, and never show the technical key.
import { beforeEach, describe, expect, it } from 'vitest';

// Realistic row of `taxes.categories.list` on a Spanish hub: the seed's English `name` AND the
// translated `display_name` the query projects since taxes 2.3.8.
const CATALOGO_ES = [
  { id: 't1', key: 'service.generic', name: 'Service — generic', display_name: 'Servicio — general' },
  {
    id: 't2',
    key: 'product.reduced',
    name: 'Product — reduced (food staples, pharmacy)',
    display_name: 'Producto — tipo reducido (alimentación, farmacia)',
  },
];

const llamadas: { name: string; params?: Record<string, unknown> }[] = [];

beforeEach(() => {
  llamadas.length = 0;
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async () => ({ rows: [], total: 0 }),
    queryAll: async (name: string, params?: Record<string, unknown>) => {
      llamadas.push({ name, params });
      return name === 'taxes.categories.list'
        ? CATALOGO_ES
        : name === 'services.categories.list'
          ? []
          : [];
    },
    command: async () => ({}),
    on: () => () => {},
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
  };
});

async function montar() {
  await import('./erp-services-list');
  const el = document.createElement('erp-services-list');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el as HTMLElement & { shadowRoot: ShadowRoot };
}

/** The visible text of every option of the fiscal-category `<ion-select>`. */
function opcionesFiscales(el: HTMLElement & { shadowRoot: ShadowRoot }): string[] {
  const select = [...el.shadowRoot.querySelectorAll('ion-select')].find((s) =>
    /ui\.colTax/.test(s.getAttribute('label') ?? ''),
  );
  return [...(select?.querySelectorAll('ion-select-option') ?? [])].map((o) =>
    (o.textContent ?? '').trim(),
  );
}

describe('el selector de categoría fiscal habla el idioma del hub (services#54)', () => {
  it('pinta «Servicio — general», no el inglés del seed', async () => {
    const el = await montar();
    const texto = opcionesFiscales(el).join(' | ');
    expect(texto, 'la etiqueta traducida que `taxes` ya sirve en `display_name`').toContain(
      'Servicio — general',
    );
    expect(texto, 'el inglés del seed no se pinta teniendo la traducción delante').not.toContain(
      'Service — generic',
    );
  });

  it('ninguna opción lleva la clave técnica pegada', async () => {
    const el = await montar();
    // Acceptance criterion of the issue: `/\([a-z_]+\.[a-z_]+\)/` matches NO option.
    const conClave = opcionesFiscales(el).filter((t) => /\([a-z_]+\.[a-z_]+\)/.test(t));
    expect(conClave, `opciones con la clave técnica a la vista: ${conClave.join(' | ')}`).toEqual([]);
    // And the bare key is not there either: nobody in a salon knows what `service.generic` is.
    expect(opcionesFiscales(el).some((t) => t.includes('service.generic'))).toBe(false);
  });

  it('el VALUE sigue siendo la key canónica: lo que se guarda es lo que no cambia', async () => {
    const el = await montar();
    const select = [...el.shadowRoot.querySelectorAll('ion-select')].find((s) =>
      /ui\.colTax/.test(s.getAttribute('label') ?? ''),
    );
    const values = [...(select?.querySelectorAll('ion-select-option') ?? [])].map((o) =>
      (o as unknown as { value: unknown }).value,
    );
    expect(values).toContain('service.generic');
  });

  it('pide el catálogo ordenado por lo que se enseña (`display_name`), no por el inglés', async () => {
    await montar();
    const cat = llamadas.find((l) => l.name === 'taxes.categories.list');
    expect(cat, 'no se pidió el catálogo fiscal').toBeTruthy();
    expect(cat!.params?.sort, 'ordenar por `name` deja la lista alfabetizada en inglés y pintada en español').toBe(
      'display_name',
    );
  });

  it('un `taxes` viejo sin `display_name` cae a `name`: ninguna opción se queda muda', async () => {
    const sdk = (globalThis as Record<string, unknown>).erplora as {
      queryAll: (name: string, params?: Record<string, unknown>) => Promise<unknown[]>;
    };
    sdk.queryAll = async (name) =>
      name === 'taxes.categories.list'
        ? [{ id: 't1', key: 'service.generic', name: 'Service — generic' }]
        : [];
    const el = await montar();
    expect(opcionesFiscales(el).join(' | ')).toContain('Service — generic');
    // The fallback degrades to the old behaviour, never to the technical key.
    expect(opcionesFiscales(el).some((t) => t.includes('('))).toBe(false);
  });
});
