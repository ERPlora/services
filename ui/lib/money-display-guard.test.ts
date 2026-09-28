import { it, expect } from 'vitest';
import { checkMoneyDisplay } from '@erplora/module-toolkit/money-display-guard';

// GUARD (pm#289, shared since pm#505/pm#508): money on screen is never formatted by hand in this
// module, and OutfitKit comes in by entry point, never as a value from the barrel.
//
// The rules live in `@erplora/module-toolkit/money-display-guard` (one piece for every module,
// tested there against its own positives); this test only says what is specific to Servicios:
//
// * witnesses — the amounts this module paints go through the shell's formatter: the price column
//   of the service list, and in the packages screen the discount and fixed price columns, the
//   voucher movement amount and the price in the service picker. They count the CALL, not the
//   name: both screens also declare `formatMoney(minor: number, …)` in their `erplora()` interface,
//   and a scan over empty or over-stripped content must not stay green on that declaration
//   (rv-combos-22). Every call site counts (1 in the list, 4 in packages), so any one amount painted
//   raw turns this red; there is no local money helper whose call sites would escape the count
//   (rv-customers-103). The helpers of `lib/` are witnesses too: a shared money helper would land
//   there first, so the scan must provably read them (rv-taxes-78).
// * notDisplay — none: pm#289 found no hand formatting outside a screen amount in this module (the
//   price field's value uses a currency-less `Intl.NumberFormat`, which is not a hit). Add an entry
//   (`'file: exact code line'` → why; an Intl hit is keyed by its folded CALL, as the finding's
//   detail prints it) only with the reason it is not a screen amount.
// * outfitkitImporters — each of the five screens imports OutfitKit by entry point, so the barrel
//   scan provably read all five (rv-pricing-53).
it('money on screen goes through the shared formatter and OutfitKit by entry point (pm#289)', () => {
  expect(
    checkMoneyDisplay({
      from: import.meta.url,
      witnesses: {
        'components/erp-services-list/erp-services-list.ts': { text: 'erplora().formatMoney(', atLeast: 1 },
        'components/erp-services-packages/erp-services-packages.ts': { text: 'erplora().formatMoney(', atLeast: 4 },
        'lib/domain-error.ts': 'export function domainMessage(',
        'lib/ion-tone.ts': 'export function ionTone(',
      },
      notDisplay: {},
      outfitkitImporters: [
        'components/erp-services-list/erp-services-list.ts',
        'components/erp-services-packages/erp-services-packages.ts',
        'components/erp-services-categories/erp-services-categories.ts',
        'components/erp-services-session-refund/erp-services-session-refund.ts',
        'components/erp-services-voucher-tender/erp-services-voucher-tender.ts',
      ],
    }),
  ).toEqual([]);
});
