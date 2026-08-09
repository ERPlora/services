// A service cannot exist without knowing how it is taxed (parity with `inventory`).
//
// A service is sold exactly like a product: one sale line, with its VAT. So an empty
// `tax_category_key` has the same consequence here — nobody finds out until the hairdresser tries
// to charge, and the sale is rejected with the client standing at the counter. The industry pattern
// is unanimous (Square, Fresha, Odoo): the tax is a MANDATORY attribute of the service, validated
// when it is SAVED, not when it is sold.
//
// Two halves, and both have to hold:
//
//   1. THE CONTRACT. `services.services.create` refuses a service with no fiscal category and
//      `services.services.update` refuses to empty it — server-side, in the manifest, because
//      `services.services.create` is `expose_api: true` and the browser is not a guard. Until now
//      the command declared no `schema` at all: every payload was accepted, and the `validates`
//      block next to it said `optional: true`.
//
//   2. WHAT ALREADY EXISTS. No migration invents a category for the services created before the
//      rule — assigning a default would be making fiscal data up, and a wrong VAT that nobody
//      questions is worse than a missing one. They keep no category and they are SEEN: a third
//      state in the listing, next to active/inactive, with the reason.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

interface CommandDef {
  schema?: string;
  validates?: { field: string; query: string; param: string; optional?: boolean }[];
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8')) as {
  commands: Record<string, CommandDef>;
  queries: Record<string, { list?: { sort?: string[]; filters?: Record<string, { op: string }> } }>;
  migrations: { postgres: string[] };
};

/** A `.sql` file without its `--` comments — a rule written in a comment enforces nothing. */
const sqlOf = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, { type?: string | string[]; minLength?: number }>;
}

const schemaOf = (command: string): JsonSchema | null => {
  const rel = manifest.commands[command]?.schema;
  return rel ? (JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as JsonSchema) : null;
};

/** Every `:param` a statement binds, minus the ones the runtime injects itself (§2.5). */
const INJECTED = new Set(['hub_id', 'current_user_id', 'now', 'new_id']);
const boundParams = (rel: string): string[] => [
  ...new Set([...sqlOf(rel).matchAll(/:([a-z_][a-z0-9_]*)/gi)].map((m) => m[1])),
].filter((p) => !INJECTED.has(p));

// ── 1. The contract: mandatory on create, un-emptiable on update ───────────────────────────

describe('a service is not created without knowing how it taxes', () => {
  it('the create declares a payload schema at all', () => {
    expect(
      manifest.commands['services.services.create'].schema,
      'the command is expose_api: true and validates nothing — any payload reaches the INSERT',
    ).toBeTruthy();
  });

  it('the fiscal category is required', () => {
    expect(schemaOf('services.services.create')?.required ?? []).toContain('tax_category_key');
  });

  it('an empty string does not pass as a category either', () => {
    const prop = schemaOf('services.services.create')?.properties?.tax_category_key;
    expect(prop?.type, 'null would go straight into the column').toBe('string');
    expect(prop?.minLength ?? 0, '`required` alone accepts "" — and "" is exactly no category').toBeGreaterThanOrEqual(1);
  });

  it('the schema covers every field the statement binds, so it is not a half-truth', () => {
    const declared = Object.keys(schemaOf('services.services.create')?.properties ?? {});
    const missing = boundParams('commands/service_create.sql').filter((p) => !declared.includes(p));
    expect(missing, 'fields the create writes but the schema never mentions').toEqual([]);
  });
});

describe('an existing service cannot have its fiscal category emptied', () => {
  it('the update declares a payload schema', () => {
    expect(manifest.commands['services.services.update'].schema).toBeTruthy();
  });

  it('the fiscal category is required, and not as an empty string', () => {
    const schema = schemaOf('services.services.update');
    expect(schema?.required ?? []).toContain('tax_category_key');
    const prop = schema?.properties?.tax_category_key;
    expect(prop?.type).toBe('string');
    expect(prop?.minLength ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('the schema covers every field the statement binds', () => {
    const declared = Object.keys(schemaOf('services.services.update')?.properties ?? {});
    const missing = boundParams('commands/service_update.sql').filter((p) => !declared.includes(p));
    expect(missing).toEqual([]);
  });
});

describe('the manifest stops calling the fiscal category optional', () => {
  it.each(['services.services.create', 'services.services.update'])(
    '%s declares its tax_category_key check as NOT optional',
    (name) => {
      const check = manifest.commands[name].validates?.find((v) => v.field === 'tax_category_key');
      expect(check, 'the cross-module check disappeared').toBeTruthy();
      expect(check!.optional, 'the manifest still reads as if a service could ship without a category').toBe(false);
    },
  );
});

// ── 2. What already exists: it is MARKED, not migrated ─────────────────────────────────────

describe('the services created before the rule are seen, not silently fixed', () => {
  it('no migration back-fills a category — that would be inventing fiscal data', () => {
    const guilty = manifest.migrations.postgres.filter((rel) =>
      /UPDATE\s+services_service[\s\S]*?tax_category_key\s*=/i.test(sqlOf(rel)),
    );
    expect(guilty, 'a migration assigns a default fiscal category to existing services').toEqual([]);
  });

  it('the listing projects a third state next to active/inactive', () => {
    const sql = sqlOf('queries/services_list.sql');
    expect(sql, 'the listing says nothing about the state of a service').toMatch(/\bAS\s+status\b/i);
    for (const state of ['unconfigured', 'active', 'inactive']) {
      expect(sql, `the state \`${state}\` is not part of the vocabulary`).toContain(`'${state}'`);
    }
  });

  it('what makes a service `unconfigured` is its empty fiscal category', () => {
    expect(sqlOf('queries/services_list.sql')).toMatch(/tax_category_key[\s\S]{0,120}'unconfigured'/i);
  });

  it('the state can be filtered and sorted, so the unconfigured ones can be pulled out', () => {
    const list = manifest.queries['services.services.list'].list!;
    // `eq` and not `like`: `status LIKE '%active%'` would also match «inactive» (cross-module guard).
    expect(list.filters?.status, 'a state nobody can filter by is a state nobody finds').toEqual({ op: 'eq' });
    expect(list.sort ?? []).toContain('status');
  });
});

// ── The screen ─────────────────────────────────────────────────────────────────────────────

const TAX_CATEGORIES = [
  { id: 't1', key: 'standard', name: 'IVA general' },
  { id: 't2', key: 'reduced', name: 'IVA reducido' },
];

const CATEGORIES = [{ id: 'c1', name: 'Peluquería', slug: 'peluqueria', service_count: 2 }];

const commands: { name: string; payload: Record<string, unknown> }[] = [];

function stubSdk(taxCategories: typeof TAX_CATEGORIES) {
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => (name === 'services.categories.list' ? CATEGORIES : []),
    queryPage: async () => ({ rows: [], total: 0 }),
    queryAll: async (name: string) => (name === 'taxes.categories.list' ? taxCategories : []),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    locale: 'es',
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    currencyDecimals: 2,
    t: (_catalog: unknown, key: string) => key,
  };
}

beforeEach(() => {
  commands.length = 0;
  stubSdk(TAX_CATEGORIES);
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

interface ServicesForm {
  newName: string;
  newPrice: string;
  newDuration: string;
  newTaxRateId: string;
  formError: string;
  createService: (ev: Event) => Promise<void>;
}

describe('the form does not let a service be born without a fiscal category', () => {
  it('the select offers real categories only — no «default», no blank', async () => {
    const el = await mount();
    const options = [...el.shadowRoot.querySelectorAll('ion-select-option')].filter(
      (o) => o.closest('ion-select')?.getAttribute('label') === 'ui.colTax',
    );
    expect(options.length, 'the fiscal category select was not rendered').toBe(TAX_CATEGORIES.length);
    const values = options.map((o) => (o as unknown as { value: string }).value);
    expect(values, 'an empty option means «no category» — exactly what must stop being possible').toEqual([
      'standard',
      'reduced',
    ]);
  });

  it('submitting without one sends NOTHING and says why', async () => {
    const el = await mount();
    const form = el as unknown as ServicesForm;
    form.newName = 'Corte';
    form.newPrice = '12';
    form.newTaxRateId = '';
    await form.createService(new Event('submit'));

    expect(commands, 'the create left for the server with no fiscal category').toEqual([]);
    expect(form.formError, 'it failed silently: the user has no idea what is missing').toBeTruthy();
  });

  it('the «add» button stays disabled until one is picked', async () => {
    const el = await mount();
    const form = el as unknown as ServicesForm;
    form.newName = 'Corte';
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const button = el.shadowRoot.querySelector('ion-button[type="submit"]');
    expect(button?.hasAttribute('disabled'), 'the button invites a submit that will be rejected').toBe(true);
  });

  it('with one picked it travels as a string, never as null', async () => {
    const el = await mount();
    const form = el as unknown as ServicesForm;
    form.newName = 'Corte';
    form.newPrice = '12';
    form.newTaxRateId = 'reduced';
    await form.createService(new Event('submit'));

    const create = commands.find((c) => c.name === 'services.services.create');
    expect(create, 'the create never left').toBeTruthy();
    expect(create!.payload.tax_category_key).toBe('reduced');
  });

  it('with no fiscal categories at all it says so instead of showing an empty select', async () => {
    stubSdk([]);
    const el = await mount();
    const text = el.shadowRoot.textContent ?? '';
    expect(text, 'an empty select is a dead end with no explanation').toContain('ui.taxCategoriesMissing');
  });
});

describe('the listing marks the service that does not know how it taxes', () => {
  const statusColumn = (el: HTMLElement) =>
    (el as unknown as { columns: { key: string; format?: (r: Record<string, unknown>) => string; render?: (r: Record<string, unknown>) => unknown }[] }).columns.find(
      (c) => c.key === 'status',
    );

  const cellText = (cell: unknown) => {
    const host = document.createElement('div');
    litRender(cell, host);
    return host.textContent ?? '';
  };

  it('the state has its own column', async () => {
    const el = await mount();
    expect(statusColumn(el), 'the listing shows no state at all').toBeTruthy();
  });

  it('an unconfigured service says so, and says WHY', async () => {
    const el = await mount();
    const column = statusColumn(el)!;
    const painted = column.render
      ? cellText(column.render({ status: 'unconfigured', tax_category_key: null }))
      : column.format!({ status: 'unconfigured', tax_category_key: null });
    expect(painted).toContain('ui.status.unconfigured');
    expect(painted, 'marked without a reason is a badge nobody can act on').toContain('ui.statusReason.unconfigured');
  });

  it('a service with its category does not carry the warning', async () => {
    const el = await mount();
    const column = statusColumn(el)!;
    const painted = column.render
      ? cellText(column.render({ status: 'active', tax_category_key: 'standard' }))
      : column.format!({ status: 'active', tax_category_key: 'standard' });
    expect(painted).toContain('ui.status.active');
    expect(painted).not.toContain('ui.statusReason.unconfigured');
  });
});

describe('both catalogues carry the new wording', () => {
  it.each(['en', 'es'])('%s', (locale) => {
    const catalog = JSON.parse(readFileSync(join(ROOT, `locales/${locale}.json`), 'utf8')) as {
      ui?: Record<string, unknown>;
    };
    const ui = catalog.ui ?? {};
    const status = (ui.status ?? {}) as Record<string, string>;
    const reason = (ui.statusReason ?? {}) as Record<string, string>;
    for (const state of ['active', 'inactive', 'unconfigured']) {
      expect(status[state], `ui.status.${state} missing in ${locale}`).toBeTruthy();
    }
    expect(reason.unconfigured, `ui.statusReason.unconfigured missing in ${locale}`).toBeTruthy();
    expect(ui.colStatus, `ui.colStatus missing in ${locale}`).toBeTruthy();
    expect(ui.errorTaxRequired, `ui.errorTaxRequired missing in ${locale}`).toBeTruthy();
    expect(ui.taxCategoriesMissing, `ui.taxCategoriesMissing missing in ${locale}`).toBeTruthy();
    expect(ui.taxDefault, 'the «— (default)» option must disappear with the field becoming mandatory').toBeUndefined();
  });
});
