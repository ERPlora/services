// services#54 (second half) — the SAME figure written two ways on one screen.
//
// The table said «22,00 €» while the edit panel's Precio field said `22.0`: `String()` on the
// number, so a dot decimal and no fixed decimals, whatever the hub's language. The field is
// filled by `toMajorText` (minor units → what a human types); this file pins it to the hub's
// locale (`es` → «22,00»), with the currency's decimals and WITHOUT grouping — «1.250,50» would
// not survive the round trip back through `toMinorUnits`.
import { beforeEach, describe, expect, it } from 'vitest';

const comandos: { name: string; payload: Record<string, unknown> }[] = [];

function sdk(over: Record<string, unknown> = {}) {
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async () => ({ rows: [], total: 0 }),
    queryAll: async () => [],
    command: async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return {};
    },
    on: () => () => {},
    locale: 'es',
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    ...over,
  };
}

beforeEach(() => {
  comandos.length = 0;
  sdk();
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

type Editable = {
  onRowAction: (ev: { detail: { actionId: string; row: Record<string, unknown> } }) => Promise<void>;
  createService: (ev: Event) => Promise<void>;
  newPrice: string;
  editingId: string | null;
};

/** Opens the edit panel for a row (the prefill under test) and returns the component. */
async function editar(row: Record<string, unknown>) {
  const el = await montar();
  await (el as unknown as Editable).onRowAction({ detail: { actionId: 'edit', row } });
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el as unknown as Editable;
}

describe('el campo Precio del panel de edición usa el formato de la locale (services#54)', () => {
  it('2200 céntimos → «22,00» en es (la tabla dice «22,00 €» al lado)', async () => {
    const wc = await editar({ id: 's1', name: 'Corte', price: '2200', duration_minutes: 30 });
    expect(wc.newPrice).toBe('22,00');
  });

  it('la misma cifra en en sale con punto: «22.00»', async () => {
    sdk({ locale: 'en' });
    const wc = await editar({ id: 's1', name: 'Cut', price: '2200', duration_minutes: 30 });
    expect(wc.newPrice).toBe('22.00');
  });

  it('dos decimales aunque la cifra sea redonda: 2000 → «20,00», no «20»', async () => {
    const wc = await editar({ id: 's1', name: 'Corte', price: '2000', duration_minutes: 30 });
    expect(wc.newPrice).toBe('20,00');
  });

  it('SIN separador de miles: «1250,50», no «1.250,50» — el punto rompería el round-trip', async () => {
    const wc = await editar({ id: 's1', name: 'Corte', price: '125050', duration_minutes: 30, tax_category_key: 'service.generic' });
    expect(wc.newPrice).toBe('1250,50');
    // The proof that grouping would corrupt: re-saving the prefilled field keeps the price.
    await wc.createService(new Event('submit'));
    const upd = comandos.find((c) => c.name === 'services.services.update');
    expect(upd, 'el guardado de la edición no se mandó').toBeTruthy();
    expect(upd!.payload.price, '«1250,50» re-guardado tiene que seguir siendo 125050 céntimos').toBe(125050);
  });

  it('la escala sigue siendo la de la MONEDA: JPY (0 decimales) → «1999»', async () => {
    sdk({ currencyDecimals: 0 });
    const wc = await editar({ id: 's1', name: 'Cut', price: '1999', duration_minutes: 30 });
    expect(wc.newPrice).toBe('1999');
  });
});

describe('round-trip: crear con «18,50» → editar → «18,50» → guardar sin tocar (services#54)', () => {
  it('el campo muestra lo que se tecleó, y re-guardar no cambia el precio', async () => {
    const wc = await editar({ id: 's1', name: 'Corte', price: '1850', duration_minutes: 30, tax_category_key: 'service.generic' });
    expect(wc.editingId).toBe('s1');
    expect(wc.newPrice).toBe('18,50');
    await wc.createService(new Event('submit'));
    const upd = comandos.find((c) => c.name === 'services.services.update');
    expect(upd, 'el guardado de la edición no se mandó').toBeTruthy();
    expect(upd!.payload.price, '18,50 € guardado sin tocar = 1850 céntimos').toBe(1850);
  });
});
