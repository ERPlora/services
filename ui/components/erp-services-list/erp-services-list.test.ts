// Contrato de la BARRA de la lista de servicios.
//
// El alta de un servicio se hacía con un `<form>` suelto ENCIMA de la tabla (nombre, precio,
// duración, categoría y un botón «Añadir»). El resto del Hub —/employees en el core, el CRUD de
// productos de `inventory`— no lo hace así: el alta vive DENTRO de `ok-data-table`, detrás del «+»
// de su barra de herramientas, que despliega el panel `slot="create"`. Los filtros, igual: dentro,
// detrás del embudo, y los campos de dominio cerrado (categoría, tipo de precio) se filtran con un
// `select`, no tecleando el texto a pelo.
//
// Aquí se fija esa paridad, que es lo que se rompía: el «+» y el formulario dentro de la tabla, y
// nada de controles de alta sueltos por fuera.
import { beforeEach, describe, expect, it } from 'vitest';

const CATEGORIAS = [
  { id: 'c1', name: 'Peluquería', slug: 'peluqueria', service_count: 2 },
  { id: 'c2', name: 'Estética', slug: 'estetica', service_count: 1 },
];

const comandos: { name: string; payload: Record<string, unknown> }[] = [];

beforeEach(() => {
  comandos.length = 0;
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => (name === 'services.categories.list' ? CATEGORIAS : []),
    queryPage: async () => ({
      rows: [{ id: 's1', name: 'Corte', price: '12.00', pricing_type: 'fixed', duration_minutes: 30, is_bookable: 1, category_id: 'c1', category: 'Peluquería' }],
      total: 1,
    }),
    command: async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return {};
    },
    on: () => () => {},
    locale: 'es',
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

const tabla = (el: HTMLElement & { shadowRoot: ShadowRoot }) =>
  el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { addable: boolean }) | null;

describe('el alta vive DENTRO de la tabla (paridad con /employees e inventory)', () => {
  it('la tabla declara `addable` → pinta el «+» en su barra', async () => {
    const el = await montar();
    expect(tabla(el)?.addable, 'sin `addable` no hay «+» en la barra de la tabla').toBe(true);
  });

  it('el formulario de alta se proyecta en el panel `create` de la tabla', async () => {
    const el = await montar();
    const form = el.shadowRoot.querySelector('form[slot="create"]');
    expect(form, 'el formulario de alta no está en el slot `create`').toBeTruthy();
    expect(form?.closest('ok-data-table'), 'el formulario de alta cuelga fuera de la tabla').toBeTruthy();
  });

  it('no queda NINGÚN control de alta suelto fuera de la tabla', async () => {
    const el = await montar();
    const sueltos = [...el.shadowRoot.querySelectorAll('form, ion-input, ion-select, ion-button')].filter(
      (n) => !n.closest('ok-data-table'),
    );
    expect(sueltos.map((n) => n.tagName.toLowerCase()), 'hay controles de alta fuera de la tabla').toEqual([]);
  });
});

describe('los filtros van en la tabla, y los de dominio cerrado son `select`', () => {
  it('categoría se filtra con un select poblado con las categorías reales', async () => {
    const el = await montar();
    const cols = (el as unknown as { columns: { key: string; filterType?: string; options?: { value: string; label: string }[] }[] }).columns;
    const cat = cols.find((c) => c.key === 'category');
    expect(cat?.filterType, 'la categoría se filtra tecleando texto libre').toBe('select');
    expect(cat?.options?.map((o) => o.label)).toEqual(['Peluquería', 'Estética']);
  });

  it('el tipo de precio se filtra con un select (dominio cerrado), no con texto', async () => {
    const el = await montar();
    const cols = (el as unknown as { columns: { key: string; filterType?: string; options?: unknown[] }[] }).columns;
    const tipo = cols.find((c) => c.key === 'pricing_type');
    expect(tipo?.filterType).toBe('select');
    expect(tipo?.options?.length, 'el select de tipo de precio no ofrece opciones').toBeGreaterThan(0);
  });
});

describe('el alta sigue funcionando desde el panel', () => {
  it('crear un servicio manda services.services.create con los datos del panel', async () => {
    const el = await montar();
    const wc = el as unknown as { newName: string; newPrice: string; newDuration: string; newCategory: string;
                                  createService: (ev: Event) => Promise<void> };
    wc.newName = 'Corte';
    wc.newPrice = '12';
    wc.newDuration = '30';
    wc.newCategory = 'c1';
    await wc.createService(new Event('submit'));

    const alta = comandos.find((c) => c.name === 'services.services.create');
    expect(alta, 'no se mandó el alta del servicio').toBeTruthy();
    expect(alta!.payload.name).toBe('Corte');
    expect(alta!.payload.category_id).toBe('c1');
    expect(alta!.payload.duration_minutes).toBe(30);
  });
});
