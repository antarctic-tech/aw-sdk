const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** #rgb | #rrggbb → нижний регистр #rrggbb; всё остальное → null */
export function normalizeHexColor(value: string): string | null {
  const color = value.trim().toLowerCase();
  if (!HEX_COLOR_RE.test(color)) return null;
  if (color.length === 7) return color;
  const [, r, g, b] = color;
  return `#${r}${r}${g}${g}${b}${b}`;
}
