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
