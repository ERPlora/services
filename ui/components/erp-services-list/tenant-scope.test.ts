// Nothing of another hub may leak in through a relation (services#7).
//
// The FKs of this module point at global ids, so `hub_id` alone does not protect a JOIN: two rows
// can belong to different hubs and still join by id. Reproduced with the real runtime in the
// issue:
//
//   1. a category created in hub B, a service of hub A pointing at it → `services.services.list`
//      of A returned B's private category NAME;
//   2. a service created in B, a package of A whose line references it → `services.package_items.list`
//      of A returned B's service name AND price.
//
// Two doors, and both have to be shut: the READ (every JOIN carries the hub) and the WRITE (a
// relation is only created against a parent of the same hub, and if it is not, it FAILS instead of
// writing a row nobody can explain).
//
// The end-to-end proof — two hubs, the neighbour ALIVE, through the dispatcher — is the hub's e2e.
// This file pins the module's half: the SQL it ships and the guard it declares.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8')) as {
  id: string;
  commands: Record<string, { sql?: string[]; expect_rows?: { op: string; n: number; error: string; message?: string } }>;
};

/** A .sql file without its `--` comments — a JOIN named in a comment joins nothing. */
const sqlOf = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const sqlFiles = (dir: string) =>
  readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.sql')).map((f) => `${dir}/${f}`);

/** Every `JOIN <table> <alias> ON …` of a statement, with the ON clause up to the next keyword. */
function joinsOf(sql: string): { table: string; on: string }[] {
  const out: { table: string; on: string }[] = [];
  const re = /\bJOIN\s+([a-z_]+)\s+([a-z]\w*)\s+ON\b([\s\S]*?)(?=\b(?:LEFT|RIGHT|INNER|JOIN|WHERE|GROUP|ORDER|LIMIT|UNION|\)|;)|$)/gi;
  for (const m of sql.matchAll(re)) out.push({ table: m[1], on: m[3] });
  return out;
}

describe('every JOIN carries the hub — an id alone is not ownership', () => {
  const files = [...sqlFiles('queries'), ...sqlFiles('commands')];

  it.each(files)('%s', (file) => {
    const unscoped = joinsOf(sqlOf(file))
      .filter(({ on }) => !/\bhub_id\s*=\s*(:hub_id|[a-z]\w*\.hub_id)/i.test(on))
      .map(({ table }) => table);
    expect(
      unscoped,
      `${file} joins ${unscoped.join(', ')} by id alone: a row of another hub matches`,
    ).toEqual([]);
  });
});

describe('a relation is only written against a parent of the same hub', () => {
  const guarded = (name: string) => {
    const sql = (manifest.commands[name].sql ?? []).map(sqlOf).join('\n');
    return { sql, gate: manifest.commands[name].expect_rows };
  };

  it('creating a service checks that the category is this hub\'s (or that there is none)', () => {
    const { sql } = guarded('services.services.create');
    expect(sql, 'the insert takes any category_id, including another hub\'s').toMatch(/services_category/);
    expect(sql).toMatch(/hub_id\s*=\s*:hub_id/);
  });

  it('updating a service checks the same thing', () => {
    const { sql } = guarded('services.services.update');
    expect(sql).toMatch(/services_category/);
    expect(sql).toMatch(/hub_id\s*=\s*:hub_id/);
  });

  it.each(['services.services.create', 'services.services.update'])(
    '%s fails instead of writing nothing and reporting success',
    (name) => {
      const gate = guarded(name).gate;
      expect(gate, 'a conditional insert without expect_rows is a silent no-op that still emits').toBeTruthy();
      expect(gate!.op).toBe('min');
      expect(gate!.n).toBeGreaterThanOrEqual(1);
      expect(gate!.error.split('.')[0], 'the installer demands the module namespace').toBe(manifest.id);
      expect(gate!.message, 'no shell translates these codes yet — it needs a human fallback').toBeTruthy();
    },
  );

  it('a package line only points at a service of this hub', () => {
    const sql = (manifest.commands['services._insert_package_item'].sql ?? []).map(sqlOf).join('\n');
    expect(sql, 'the line takes any service_id, including another hub\'s').toMatch(/services_service/);
    expect(sql).toMatch(/hub_id\s*=\s*:hub_id/);
  });
});
