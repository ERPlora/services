// No `ion-*` of this module takes its colour from `color=` (ERPlora/pm#392, module-toolkit#273).
//
// Ionic implements `color="danger"` with a GLOBAL rule of the document stylesheet
// (`.ion-color-danger { --ion-color-base: … }`), which does not reach inside a shadow root. The five
// uses of this module all live in confirmation `ion-modal`s (archive a service, delete a package,
// delete a category), which Ionic reparents to <body> when open — so today they happen to paint, and
// for that same reason the component's `static styles` would never reach them (inventory#45). The
// colour goes INLINE, as custom properties read from the theme token: the one form that paints the
// same in the shadow root and in a reparented modal, and that the publish gate accepts.
//
// happy-dom neither lays out nor loads Ionic's CSS, so what is pinned here is the CONTRACT (no
// `color=` in the source, and every coloured element carries its tone inline); the computed colours
// were measured in a real browser.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ionTone } from './lib/ion-tone';

// The `ui/` of THIS checkout, from the test's own URL: a fixed folder name (`modules/services`, a
// worktree) would scan a sibling checkout and let a `color=` added HERE through.
const UI = path.dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The attribute names of every `<ion-*>` opening tag. A Lit tag does not end at the first `>`
 * (`@click=${() => …}`), so `${…}` expressions and quoted values are skipped, not read.
 */
function ionTags(source: string): { line: number; attrs: string }[] {
  const found: { line: number; attrs: string }[] = [];
  const start = /<ion-[a-z-]+(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(source))) {
    let attrs = '';
    let depth = 0;
    let quote: string | null = null;
    for (let i = m.index + m[0].length; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (depth > 0) {
        if (ch === '"' || ch === "'" || ch === '`') quote = ch;
        else if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        continue;
      }
      if (ch === '$' && source[i + 1] === '{') { depth = 1; i += 1; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '>') break;
      attrs += ch;
    }
    found.push({ line: source.slice(0, m.index).split('\n').length, attrs: `${m[0]}${attrs}` });
  }
  return found;
}

const DECLARES_COLOR = /(?:^|\s)\.?color=/;

describe('pm#392: no ion-* delegates its colour to color=', () => {
  it('the source of ui/ carries no color= on an ion-* element', () => {
    const offenders = sources(UI).flatMap((file) =>
      ionTags(readFileSync(file, 'utf8'))
        .filter((t) => DECLARES_COLOR.test(t.attrs))
        .map((t) => `${path.relative(UI, file)}:${t.line}`),
    );
    expect(offenders, 'color= paints nothing inside a module shadow root').toEqual([]);
  });

  it('the reader sees a color= hidden behind an arrow function or on its own line (control of the control)', () => {
    expect(ionTags('<ion-button @click=${() => this.go()} color="danger">x</ion-button>').filter((t) => DECLARES_COLOR.test(t.attrs))).toHaveLength(1);
    expect(ionTags('<ion-icon\n  slot="start"\n  color=${x ? "a" : "b"}\n>').filter((t) => DECLARES_COLOR.test(t.attrs))).toHaveLength(1);
    expect(ionTags('<ion-button @click=${() => ({ color: 1 })}>x</ion-button>').filter((t) => DECLARES_COLOR.test(t.attrs))).toHaveLength(0);
  });
});

// ── Render: every place that used to say `color=` now carries its tone ───────────────────────────

beforeEach(() => {
  document.body.innerHTML = '';
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async () => [],
    queryPage: async () => ({ rows: [], total: 0, limit: 50, offset: 0 }),
    command: async () => ({}),
    hasPermission: () => true,
    on: () => () => {},
    locale: 'es',
    // The real client always exposes it (module-sdk getter): the list controller needs it for `moneyFilters`.
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
  };
});

type Wc = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> } & Record<string, unknown>;

async function mount(tag: string, load: () => Promise<unknown>): Promise<Wc> {
  await load();
  const el = document.createElement(tag) as Wc;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const byTestId = (el: Wc, id: string) => el.shadowRoot.querySelector(`[data-testid="${id}"]`);
const styleOf = (n: Element | null | undefined) => n?.getAttribute('style') ?? '';

describe('pm#392: the tone travels inline, so it paints in the reparented confirmation modal', () => {
  it('services: the archive button is solid danger and the «upcoming appointments» icon is amber', async () => {
    const el = await mount('erp-services-list', () => import('./components/erp-services-list/erp-services-list'));
    el.archiveTarget = { id: 's1', name: 'Corte' };
    el.archiveActive = { active_count: 2 };
    await el.updateComplete;
    const btn = byTestId(el, 'services-list-archive-submit');
    expect(btn, 'the archive confirmation renders').not.toBeNull();
    expect(styleOf(btn)).toContain(ionTone('solid', 'danger'));
    expect(btn!.hasAttribute('color')).toBe(false);
    const icon = byTestId(el, 'services-list-archive-warning-icon');
    expect(icon, 'the warning renders when the service has upcoming appointments').not.toBeNull();
    expect(styleOf(icon)).toContain(ionTone('text', 'warning'));
    expect(icon!.hasAttribute('color')).toBe(false);
  });

  it('packages: the delete confirmation is a solid danger button', async () => {
    const el = await mount('erp-services-packages', () => import('./components/erp-services-packages/erp-services-packages'));
    el.deleteTarget = { id: 'p1', name: 'Bono 5 cortes', items: 1 };
    await el.updateComplete;
    const btn = byTestId(el, 'services-packages-delete-submit');
    expect(btn, 'the delete confirmation renders').not.toBeNull();
    expect(styleOf(btn)).toContain(ionTone('solid', 'danger'));
    expect(btn!.hasAttribute('color')).toBe(false);
  });

  it('categories: the delete button is solid danger and the «services affected» icon is amber', async () => {
    const el = await mount('erp-services-categories', () => import('./components/erp-services-categories/erp-services-categories'));
    el.deleteTarget = { id: 'c1', name: 'Peluquería', service_count: 3 };
    await el.updateComplete;
    const btn = byTestId(el, 'services-categories-delete-submit');
    expect(btn, 'the delete confirmation renders').not.toBeNull();
    expect(styleOf(btn)).toContain(ionTone('solid', 'danger'));
    expect(btn!.hasAttribute('color')).toBe(false);
    const icon = byTestId(el, 'services-categories-delete-impact-icon');
    expect(icon, 'the impact line renders when the category has services').not.toBeNull();
    expect(styleOf(icon)).toContain(ionTone('text', 'warning'));
    expect(icon!.hasAttribute('color')).toBe(false);
  });
});
