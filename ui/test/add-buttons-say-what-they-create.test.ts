// services#141 — the three Services tabs (Services, Categories, Packages) create with an
// `ok-data-table` whose bar button, «New» drawer and form submit all fell back to OutfitKit's bare
// «Add» / «Añadir» / «New» / «Nuevo»: a person on «Bonos y paquetes» could not tell what the
// button creates until they pressed it, and with the panel open two buttons were both «Add».
//
// Same fix as reservations#75 / kitchen#121 (the pattern OutfitKit anchored in outfitkit#220):
// every table is named with `.labels=${{ add, newRecord }}` — the bar button and the drawer title
// say WHAT they create — and every submit says what it DOES («Create …»). Checked against the REAL
// module catalogs, in `en` (the source) and `es` (every app is translated, ADR-0055/0199), on
// desktop and on a phone, with the create panel open (the moment all the buttons coexist).
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import es from '../../locales/es.json';

const CATALOGS: Record<string, unknown> = { en, es };

/** Resolves `ui.x` against the REAL module catalog, so the test hears the words a person hears. */
function translate(lang: string, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], CATALOGS[lang]);
  return typeof value === 'string' ? value : key;
}

/** happy-dom has no matchMedia: the viewport is whatever this stub says. */
function viewport(mobile: boolean): void {
  (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    media: q, matches: mobile, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

function sdk(lang: string): void {
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryOptional: async () => [],
    queryAll: async () => [],
    queryPage: async () => ({ rows: [], total: 0 }),
    command: async () => ({}),
    hasPermission: () => true,
    on: () => () => {},
    locale: lang,
    t: (_catalog: unknown, key: string) => translate(lang, key),
    currency: 'EUR',
    currencyDecimals: 2,
    formatMoney: (cents: number) => `${(cents / 100).toFixed(2)} €`,
  };
}

type Table = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown>; addable?: boolean; open(p?: 'filters' | 'create'): void };
type Wc = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };

async function settle(el: { updateComplete: Promise<unknown> }): Promise<void> {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

/** An ion-button is named by its text (the icon is decorative) unless an aria-label overrides it. */
const accessibleName = (btn: HTMLElement): string => (btn.getAttribute('aria-label') ?? btn.textContent ?? '').trim();

/** Mounts a screen and opens the «New» panel of its table: the moment all the buttons coexist. */
async function mountWithPanelOpen(tag: string, load: () => Promise<unknown>, testid: string): Promise<{ el: Wc; table: Table }> {
  await load();
  const el = document.createElement(tag) as Wc;
  document.body.appendChild(el);
  await settle(el);
  const table = el.shadowRoot.querySelector(`ok-data-table[testid="${testid}"]`) as Table;
  expect(table, testid).toBeTruthy();
  expect(table.addable, `${testid} is addable`).toBe(true);
  table.open('create');
  await settle(table);
  await settle(el);
  return { el, table };
}

function button(root: ParentNode, testid: string): HTMLElement {
  const btn = root.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
  expect(btn, testid).toBeTruthy();
  return btn!;
}

/** The title painted in the create drawer's header — what the person reads above the form. */
function drawerTitle(table: Table): string {
  const title = table.shadowRoot.querySelector('[role="dialog"] header strong');
  expect(title, 'create drawer title').toBeTruthy();
  return (title!.textContent ?? '').trim();
}

interface Screen {
  name: string;
  tag: string;
  table: string;
  load: () => Promise<unknown>;
  expected: Record<'en' | 'es', { bar: string; drawer: string; submit: string }>;
}

const SCREENS: Screen[] = [
  {
    name: 'Services',
    tag: 'erp-services-list',
    table: 'services-list-table',
    load: () => import('../components/erp-services-list/erp-services-list'),
    expected: {
      en: { bar: 'New service', drawer: 'New service', submit: 'Create service' },
      es: { bar: 'Nuevo servicio', drawer: 'Nuevo servicio', submit: 'Crear servicio' },
    },
  },
  {
    name: 'Categories',
    tag: 'erp-services-categories',
    table: 'services-categories-table',
    load: () => import('../components/erp-services-categories/erp-services-categories'),
    expected: {
      en: { bar: 'New category', drawer: 'New category', submit: 'Create category' },
      es: { bar: 'Nueva categoría', drawer: 'Nueva categoría', submit: 'Crear categoría' },
    },
  },
  {
    name: 'Packages',
    tag: 'erp-services-packages',
    table: 'services-packages-table',
    load: () => import('../components/erp-services-packages/erp-services-packages'),
    expected: {
      en: { bar: 'New package', drawer: 'New package', submit: 'Create package' },
      es: { bar: 'Nuevo paquete', drawer: 'Nuevo paquete', submit: 'Crear paquete' },
    },
  },
];

const GENERIC = { en: ['Add', 'New'], es: ['Añadir', 'Nuevo'] } as const;

/** The submit's testid is the table's with `-submit` in place of `-table`. */
const submitId = (table: string): string => table.replace(/-table$/, '-submit');

describe('every create button says what it creates, and no two share a name (services#141)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  for (const screen of SCREENS) {
    for (const lang of ['en', 'es'] as const) {
      for (const mobile of [false, true]) {
        const vp = mobile ? 'phone' : 'desktop';

        it(`${screen.name} · ${lang} · ${vp}: bar button, drawer and submit say what they create`, async () => {
          viewport(mobile);
          sdk(lang);
          document.documentElement.lang = lang;
          const { el, table } = await mountWithPanelOpen(screen.tag, screen.load, screen.table);
          const seen = {
            bar: accessibleName(button(table.shadowRoot, `${screen.table}-add`)),
            drawer: drawerTitle(table),
            submit: accessibleName(button(el.shadowRoot, submitId(screen.table))),
          };
          expect(seen).toEqual(screen.expected[lang]);
        });

        it(`${screen.name} · ${lang} · ${vp}: the two buttons differ, and neither is a bare «${GENERIC[lang][0]}»`, async () => {
          viewport(mobile);
          sdk(lang);
          document.documentElement.lang = lang;
          const { el, table } = await mountWithPanelOpen(screen.tag, screen.load, screen.table);
          const names = [
            accessibleName(button(table.shadowRoot, `${screen.table}-add`)),
            accessibleName(button(el.shadowRoot, submitId(screen.table))),
          ];
          expect(new Set(names).size, names.join(' | ')).toBe(names.length);
          for (const generic of GENERIC[lang]) expect(names).not.toContain(generic);
        });
      }
    }
  }

  // The words live in the catalogs, not in the test: a key missing from `es`, or left in English,
  // would pass the screen checks above only if the fallback happened to match (rv-verifactu-159).
  it('each new key has a non-empty, translated text in en and es', () => {
    const KEYS = ['btnNewService', 'btnCreateService', 'btnNewCategory', 'btnCreateCategory', 'btnNewPackage', 'btnCreatePackage'];
    for (const key of KEYS) {
      const enText = translate('en', `ui.${key}`);
      const esText = translate('es', `ui.${key}`);
      expect(enText, `en ui.${key}`).not.toBe(`ui.${key}`);
      expect(esText, `es ui.${key}`).not.toBe(`ui.${key}`);
      expect(enText.trim(), `en ui.${key}`).not.toBe('');
      expect(esText.trim(), `es ui.${key}`).not.toBe('');
      expect(esText, `es ui.${key} is translated`).not.toBe(enText);
    }
  });
});
