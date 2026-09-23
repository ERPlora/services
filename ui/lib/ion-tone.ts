// The colour of an `ion-*` element as INLINE custom properties, read from the theme token
// (ERPlora/pm#392). `color="…"` cannot be used in a module: Ionic resolves it through a global
// `.ion-color-*` rule that does not reach inside a shadow root. A `static styles` rule does not work
// either for this module, because its coloured elements live in confirmation `ion-modal`s that Ionic
// reparents to <body> (inventory#45). Custom properties set on the element itself paint the same in
// the component's shadow root and in a reparented modal.

export type IonToneKind = 'solid' | 'text';
export type IonTone = 'danger' | 'warning';

/** Ionic 8's default palette: the fallback when the theme does not define the token. */
const PALETTE: Record<IonTone, { base: string; contrast: string; shade: string; tint: string }> = {
  danger: { base: '#c5000f', contrast: '#fff', shade: '#ad000d', tint: '#cb1a27' },
  warning: { base: '#ffc409', contrast: '#000', shade: '#e0ac08', tint: '#ffca22' },
};

/**
 * The `style` value that paints an element in `tone`:
 * - `solid`: a filled `ion-button` (background, its pressed/focused/hover states and its text);
 * - `text`: an `ion-icon` (`color`) or an `ion-note` (`--color`).
 */
export function ionTone(kind: IonToneKind, tone: IonTone): string {
  const p = PALETTE[tone];
  const token = (suffix: string, fallback: string) => `var(--ion-color-${tone}${suffix}, ${fallback})`;
  switch (kind) {
    case 'solid':
      return [
        `--background: ${token('', p.base)}`,
        `--background-activated: ${token('-shade', p.shade)}`,
        `--background-focused: ${token('-shade', p.shade)}`,
        `--background-hover: ${token('-tint', p.tint)}`,
        `--color: ${token('-contrast', p.contrast)};`,
      ].join('; ');
    case 'text':
      return `--color: ${token('', p.base)}; color: ${token('', p.base)};`;
  }
}
