// What the shop owner reads when the server refuses an operation (services#50).
//
// The screens used to paint `e.message` verbatim, which is how this reached a salon owner's
// screen when a bind slot had the wrong type:
//
//     db: sqlx: error returned from database: incorrect binary data format in bind parameter 12
//     at line 1942
//
// Nobody can act on that, and it publishes the engine, its driver and an internal line number.
// The runtime serializing the raw `Display` of any error is hub#1074 and is not this module's to
// fix; what this module PAINTS is, and it has to hold whatever the server sends.
//
// Three rungs, the same ladder `staff` (staff#1) and `pricing` (pricing#29) already climbed:
//
//   1. A code this module OWNS — the `expect_rows` errors of its manifest — is shown as its
//      TRANSLATED sentence. The code is the module's public ABI, so its wording lives with the
//      module (`locales/<lang>.json → errors`), English as the source and Spanish next to it
//      (ADR-0055): the English of the manifest is the fallback, not the thing users read.
//   2. Any other code (a shell one such as `hub.elevation.*`) keeps the server's own sentence —
//      it is the only description that exists, and it is written for a person.
//   3. Unless it is not written for a person. A message carrying driver marks is dropped for the
//      module's generic text. That is the last net, and it is what makes the rule hold for a
//      failure that does not have a domain code YET: the driver never reaches the screen.
import enLocale from '../../locales/en.json';
import esLocale from '../../locales/es.json';

const ERRORS: Record<string, Record<string, string>> = {
  es: (esLocale as { errors?: Record<string, string> }).errors ?? {},
  en: (enLocale as { errors?: Record<string, string> }).errors ?? {},
};

/** Marks of a text that comes from the plumbing and is not presentable to a user. */
const INTERNALS = ['sqlx', 'db:', 'bind parameter', 'constraint', 'at line ', 'panicked'];

/** Is this text showable, or is it the server's insides? */
function presentable(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length > 0 && !INTERNALS.some((mark) => t.includes(mark));
}

/**
 * The message to show for `e`, in `lang`.
 *
 * @param e        whatever the `catch` caught — an `Error` carrying the server's `code`, a bare
 *                 `Error`, or anything at all: a `catch` guarantees no type.
 * @param lang     the hub's active language (`erplora().locale`).
 * @param fallback the module's own generic sentence, already translated. Never empty.
 */
export function domainMessage(e: unknown, lang: string, fallback: string): string {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === 'string') {
    const translated = ERRORS[lang]?.[code] ?? ERRORS.en[code];
    if (translated) return translated;
  }
  const message = e instanceof Error ? e.message : '';
  return presentable(message) ? message : fallback;
}
