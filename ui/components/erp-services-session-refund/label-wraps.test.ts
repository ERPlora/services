// The «Give the session back to <voucher>» tick wraps INSIDE its card (services#137, from sales#462).
//
// On a 390 px phone the sentence ran off the right edge of the card and the voucher it goes back to
// could not be read. Measured on hub:stable (ios and md, 390/820/1440): Ionic paints the checkbox
// label with `white-space: nowrap`, so the label part grew to the width of the sentence (621 px in
// a 334 px card) and the row's grid column followed it. A voucher name with no spaces (a code, a
// pasted reference) overflowed even with wrapping by words.
//
// happy-dom has no real `ion-checkbox` and lays nothing out, so what is pinned here is the
// component's OWN stylesheet: the last word on each property is the one the browser applies, and
// every rule is read — `@media` blocks included — so a later `nowrap` cannot sneak back in. The
// geometry itself is measured on the real bench (see the PR).
import { describe, expect, it } from 'vitest';
import { ErpServicesSessionRefund } from './erp-services-session-refund';

type Decl = { selector: string; prop: string; value: string };

/** Every declaration of the component's stylesheet, in source order, with its selector. */
function declarations(): Decl[] {
  const styles = ([] as unknown[]).concat(
    (ErpServicesSessionRefund as unknown as { styles: unknown }).styles,
  );
  const css = styles
    .map((s) => String((s as { cssText?: string }).cssText ?? ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Decl[] = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const raw of selectors.split(',')) {
      const selector = raw.trim().replace(/\s+/g, ' ');
      for (const decl of body.split(';')) {
        const at = decl.indexOf(':');
        if (at <= 0) continue;
        out.push({
          selector,
          prop: decl.slice(0, at).trim(),
          value: decl.slice(at + 1).replace(/!important/, '').trim(),
        });
      }
    }
  }
  return out;
}

/** The value the browser ends up with for `prop` on elements matched by `target`, or null. */
function last(target: RegExp, prop: string): string | null {
  const hits = declarations().filter((d) => target.test(d.selector) && d.prop === prop);
  return hits.length ? hits[hits.length - 1].value : null;
}

const CHECKBOX_LABEL = /(^|[\s>])ion-checkbox::part\(label\)$/;
const WRAPPING = ['normal', 'pre-wrap', 'pre-line', 'break-spaces'];

describe('erp-services-session-refund — the give-back label stays inside its card', () => {
  it('overrides Ionic nowrap on the checkbox label, so the sentence breaks into lines', () => {
    expect(WRAPPING).toContain(last(CHECKBOX_LABEL, 'white-space'));
  });

  it('breaks a voucher name with no spaces instead of letting it push the card wider', () => {
    expect(last(CHECKBOX_LABEL, 'overflow-wrap')).toBe('anywhere');
  });

  it('breaks the voucher name the same way where the session does NOT go back (no checkbox)', () => {
    // The non-refundable card paints the bare name in a flex header: same name, same overflow.
    expect(last(/(^|\s)\.name$/, 'overflow-wrap')).toBe('anywhere');
  });
});
