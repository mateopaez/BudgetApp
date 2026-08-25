import { chartCssColor, chartCssVariable, colorWithAlpha } from './chart-colors.util';

describe('chart color utilities', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    element.style.setProperty('--chart-test', '#0f766e');
    document.body.appendChild(element);
  });

  afterEach(() => element.remove());

  it('resolves a CSS custom property at runtime', () => {
    expect(chartCssVariable(element, '--chart-test', '#000000')).toBe('#0f766e');
  });

  it('uses a safe fallback when a custom property is absent', () => {
    expect(chartCssColor(element, 'var(--missing)', '#66736f')).toBe('#66736f');
  });

  it('adds alpha to six-digit hex colors only', () => {
    expect(colorWithAlpha('#0f766e', '22')).toBe('#0f766e22');
    expect(colorWithAlpha('rgb(15 118 110)', '22')).toBe('rgb(15 118 110)');
  });
});
