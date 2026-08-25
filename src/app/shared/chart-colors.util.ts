const CSS_VARIABLE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/;

export function chartCssColor(
  element: Element,
  value: string,
  fallback: string
): string {
  const match = CSS_VARIABLE.exec(value.trim());
  if (!match) return value;

  const view = element.ownerDocument?.defaultView;
  const resolved = view?.getComputedStyle(element).getPropertyValue(match[1]).trim();
  return resolved || match[2]?.trim() || fallback;
}

export function chartCssVariable(
  element: Element,
  name: string,
  fallback: string
): string {
  return chartCssColor(element, `var(${name})`, fallback);
}

export function colorWithAlpha(color: string, alphaHex: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? `${color}${alphaHex}` : color;
}
