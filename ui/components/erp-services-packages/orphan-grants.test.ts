// services#81 — the vouchers whose owner was deleted have a screen, because without one the money
// stays invisible.
//
// The SQL half of this fix (`tests/orphan_grants.postgres.test.py`) proves the module now HEARS
// `customer.deleted` and can LIST what it orphaned. That is worth nothing on its own: every door
// into a voucher starts by choosing a customer, and the customer is precisely what no longer
// exists. So the packages screen grows the one door that needs no customer — the rescue drawer —
// and this is where it is asserted that the door actually opens, asks the right question, and
// paints the three states a real screen has.
//
// It also pins the two things that break silently: the permission (a cashier must not browse the
// paid-for vouchers of deleted people — that is `manager` work, per the manifest) and the
// TRANSLATION, mounted in both languages, because a hardcoded English literal passes an
// English-only test exactly as well as a translated one does.
import { beforeEach, describe, expect, it } from 'vitest';

import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';

const CATALOGS: Record<string, unknown> = { en: enLocale, es: esLocale };

/** The shell's `t()`, for real: walks the dotted key into the ACTIVE catalogue. */
function translate(locale: string, key: string, params?: Record<string, unknown>): string {
  let node: unknown = CATALOGS[locale];
  for (const part of key.split('.')) {
    node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  let out = typeof node === 'string' ? node : key;
  for (const [k, v] of Object.entries(params ?? {})) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

const ROWS = [
  {
    id: 'p1',
    name: 'Bono 5 cortes',
    slug: 'bono-5-cortes',
    discount_type: 'percentage',
    discount_percent_bp: 1000,
    discount_amount_cents: 0,
    fixed_price: null,
    is_active: 1,
    items: 1,
  },
];

/** Three sessions still owed to somebody whose sheet is gone. */
const ORPHANS = [
  {
    grant_id: 'g1',
    package_id: 'p1',
    package_name: 'Bono 5 cortes',
    customer_id: 'cus-gone',
    customer_deleted_at: '2026-09-01T09:00:00Z',
    granted_at: '2026-08-01T09:00:00Z',
    source: 'sale',
    sale_id: 'sale-9',
    amount_cents: 15000,
    max_uses: 5,
    used: 2,
    remaining: 3,
    has_value: 1,
    validity_days: 365,
    expires_at: '2027-08-01T09:00:00Z',
    is_expired: 0,
  },
  {
    grant_id: 'g2',
    package_id: 'p1',
    package_name: 'Bono 5 cortes',
    customer_id: 'cus-spent',
    customer_deleted_at: '2026-08-20T09:00:00Z',
    granted_at: '2026-06-01T09:00:00Z',
    source: 'manual',
    sale_id: null,
    amount_cents: 5000,
    max_uses: 5,
    used: 5,
    remaining: 0,
    has_value: 0,
    validity_days: 365,
    expires_at: '2027-06-01T09:00:00Z',
    is_expired: 0,
  },
];

const asked: { name: string; params: Record<string, unknown> }[] = [];
let answer: () => Promise<{ rows: unknown[]; total: number }>;
let permission: (p: string) => boolean;
let locale: string;

const page = (rows: unknown[], total = rows.length) => async () => ({ rows, total });

beforeEach(() => {
  asked.length = 0;
  answer = page(ORPHANS);
  permission = () => true;
  locale = 'es';
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryPage: async (name: string, params?: Record<string, unknown>) => {
      if (name === 'services.packages.orphans') {
        asked.push({ name, params: params ?? {} });
        return answer();
      }
      return { rows: ROWS, total: 1 };
    },
    queryAll: async () => [],
    command: async () => ({}),
    on: () => () => {},
    hasPermission: (p: string) => permission(p),
    get locale() {
      return locale;
    },
    currencyDecimals: 2,
    formatMoney: (minor: number) => `${(Number(minor || 0) / 100).toFixed(2)} €`,
    t: (_c: unknown, key: string, params?: Record<string, unknown>) => translate(locale, key, params),
  };
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  orphansOpen: boolean;
  orphans: Record<string, unknown>[];
  orphansTotal: number;
  orphansLoading: boolean;
  orphansError: string;
  openOrphans(): Promise<void>;
  loadMoreOrphans(): Promise<void>;
};

async function mount(): Promise<Mounted> {
  await import('./erp-services-packages');
  const el = document.createElement('erp-services-packages') as unknown as Mounted;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

describe('the rescue drawer is the only door that needs no customer', () => {
  it('is offered to whoever holds the permission', async () => {
    const el = await mount();
    expect(el.shadowRoot.querySelector('[data-testid="services-packages-open-orphans"]')).not.toBeNull();
  });

  it('is hidden from someone who does not', async () => {
    permission = (p: string) => p !== 'services.view_orphan_grant';
    const el = await mount();
    expect(el.shadowRoot.querySelector('[data-testid="services-packages-open-orphans"]')).toBeNull();
  });

  it('asks for the orphans WITHOUT a customer id — that is the whole point', async () => {
    const el = await mount();
    await el.openOrphans();
    const call = asked.find((a) => a.name === 'services.packages.orphans');
    expect(call).toBeDefined();
    expect(JSON.stringify(call?.params ?? {})).not.toContain('customer_id');
    expect(el.orphans).toHaveLength(2);
    expect(el.orphansTotal).toBe(2);
  });

  it('asks for ONE page, and «load more» ADDS instead of replacing', async () => {
    answer = page([ORPHANS[0]], 2);
    const el = await mount();
    await el.openOrphans();
    expect(el.orphans).toHaveLength(1);
    expect(asked.at(-1)?.params.offset).toBe(0);
    answer = page([ORPHANS[1]], 2);
    await el.loadMoreOrphans();
    expect(asked.at(-1)?.params.offset).toBe(1);
    expect(el.orphans.map((r) => r.grant_id)).toEqual(['g1', 'g2']);
  });

  it('does not ask again once everything is on screen', async () => {
    const el = await mount();
    await el.openOrphans();
    const calls = asked.length;
    await el.loadMoreOrphans();
    expect(asked).toHaveLength(calls);
  });

  it('spells out what is still owed, and what is not', async () => {
    const el = await mount();
    await el.openOrphans();
    await el.updateComplete;
    const text = el.shadowRoot.textContent ?? '';
    expect(text).toContain('150.00 €'); // the amount charged, the refund conversation
    expect(text).toContain('cus-gone'); // the opaque id: the only handle support has
    expect(text).toContain(translate('es', 'ui.orphanRemaining', { remaining: 3 }));
    // A spent voucher is LISTED but must not look like money owed (query lists it on purpose).
    expect(text).toContain(translate('es', 'ui.orphanNoValue'));
  });

  it('paints loading, empty and error — not only the happy path', async () => {
    answer = page([]);
    const el = await mount();
    await el.openOrphans();
    await el.updateComplete;
    expect(el.shadowRoot.textContent ?? '').toContain(translate('es', 'ui.emptyOrphans'));

    answer = async () => {
      throw new Error('boom');
    };
    await el.openOrphans();
    await el.updateComplete;
    expect(el.orphansError).not.toBe('');
    expect(el.shadowRoot.querySelector('ok-inline-feedback[tone="danger"]')).not.toBeNull();
  });

  it('keeps what is on screen when a further page fails', async () => {
    answer = page([ORPHANS[0]], 2);
    const el = await mount();
    await el.openOrphans();
    answer = async () => {
      throw new Error('boom');
    };
    await el.loadMoreOrphans();
    await el.updateComplete;
    expect(el.orphans).toHaveLength(1);
    expect(el.orphansError).not.toBe('');
  });
});

describe('the drawer is translated, not hardcoded', () => {
  // Mounting only in `en` would pass with an English literal welded into the template. The proof is
  // that the SPANISH string is on screen and the ENGLISH one is not.
  it('speaks Spanish when the hub does', async () => {
    locale = 'es';
    const el = await mount();
    await el.openOrphans();
    await el.updateComplete;
    const text = el.shadowRoot.textContent ?? '';
    expect(text).toContain(translate('es', 'ui.orphansTitle'));
    expect(text).not.toContain(translate('en', 'ui.orphansTitle'));
  });

  it('speaks English when the hub does', async () => {
    locale = 'en';
    const el = await mount();
    await el.openOrphans();
    await el.updateComplete;
    expect(el.shadowRoot.textContent ?? '').toContain(translate('en', 'ui.orphansTitle'));
  });

  it('carries every string it paints in BOTH catalogues', () => {
    const keys = [
      'ui.orphansTitle',
      'ui.orphansHint',
      'ui.openOrphans',
      'ui.emptyOrphans',
      'ui.errorOrphans',
      'ui.orphanRemaining',
      'ui.orphanNoValue',
      'ui.orphanDeletedAt',
      'ui.orphanExpired',
      'ui.orphansCount',
      'ui.orphansMore',
    ];
    for (const key of keys) {
      expect(translate('en', key), `${key} missing from en.json`).not.toBe(key);
      expect(translate('es', key), `${key} missing from es.json`).not.toBe(key);
      // A Spanish catalogue that merely copied the English string is not a translation.
      if (key !== 'ui.orphansCount') expect(translate('es', key)).not.toBe(translate('en', key));
    }
  });
});
