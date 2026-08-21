// The configured defaults have to reach a new service (services#13).
//
// Reproduced in the issue: with `default_duration = 90`, `default_buffer_time = 15` and
// `allow_online_booking = false` saved, creating a minimal service still stored 60, 0 and 1 —
// because `service_create.sql` carried those numbers hardcoded in its `COALESCE`. The settings
// screen therefore configures something that nothing reads: every service is born on the module's
// factory values and the business has to correct each one by hand.
//
// The fallback chain has three steps on purpose:
//   what the caller sent  →  what the hub configured  →  the module's own default.
// The last one stays because the settings row is a singleton that may not exist yet (a hub
// installed without a blueprint has none), and a `NULL` reaching a NOT NULL column is a write that
// fails at 3am instead of a service created with a sane duration.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The bind of an integer is written `CAST(:param AS BIGINT)`, not `:param` (services#50): the
// statement has to PIN the type or Postgres infers `int4` for whatever the payload omits, and the
// create stops accepting its own screen's payload. That is a change of spelling, not of the chain
// these tests are about, so the chain is matched around the cast instead of against a bare `:name`.
const bind = (param: string) => `(?:CAST\\(\\s*)?:${param}(?:\\s+AS\\s+\\w+\\s*\\))?`;

const ROOT = join(__dirname, '../../..');
const sql = readFileSync(join(ROOT, 'commands/service_create.sql'), 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('a new service is born on what the business configured', () => {
  it('reads the settings of this hub', () => {
    expect(sql, 'the create never looks at services_settings').toMatch(/services_settings/);
    expect(sql, 'the settings row must be this hub\'s').toMatch(/hub_id\s*=\s*:hub_id/);
  });

  it('joins them so a hub without a settings row can still create services', () => {
    // An inner join would make the create silently impossible on a hub that never saved settings.
    expect(sql, 'the settings must be optional: LEFT JOIN, not JOIN').toMatch(/LEFT\s+JOIN\s+services_settings/i);
  });

  it.each([
    ['duration_minutes', 'default_duration'],
    ['buffer_before', 'default_buffer_time'],
    ['buffer_after', 'default_buffer_time'],
    ['allow_online_booking', 'allow_online_booking'],
  ])('%s falls back to the configured %s before the module default', (param, setting) => {
    const chain = new RegExp(`COALESCE\\(\\s*${bind(param)}\\s*,\\s*[a-z]+\\.${setting}\\s*,`, 'i');
    expect(sql, `:${param} still ignores ${setting} and jumps straight to the hardcoded value`).toMatch(chain);
  });

  it('keeps a last resort, because the settings row may not exist', () => {
    // Three arguments in each of those COALESCE: caller, setting, module default.
    for (const param of ['duration_minutes', 'buffer_before', 'buffer_after', 'allow_online_booking']) {
      const m = sql.match(new RegExp(`COALESCE\\(\\s*${bind(param)}\\s*,([^)]*)\\)`, 'i'));
      expect(m, `no COALESCE for :${param}`).toBeTruthy();
      expect(m![1].split(',').length, `:${param} has no final fallback`).toBeGreaterThanOrEqual(2);
    }
  });
});
