import { chartCssColor, chartCssVariable, colorWithAlpha } from './chart-colors.util';

describe('chart color utilities', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    element.style.setProperty('--chart-test', '#1b4d3e');
    document.body.appendChild(element);
  });

  afterEach(() => element.remove());

  it('resolves a CSS custom property at runtime', () => {
    expect(chartCssVariable(element, '--chart-test', '#000000')).toBe('#1b4d3e');
  });

  it('uses a safe fallback when a custom property is absent', () => {
    expect(chartCssColor(element, 'var(--missing)', '#5c6570')).toBe('#5c6570');
  });

  it('adds alpha to six-digit hex colors only', () => {
    expect(colorWithAlpha('#1b4d3e', '22')).toBe('#1b4d3e22');
    expect(colorWithAlpha('rgb(27 77 62)', '22')).toBe('rgb(27 77 62)');
  });
});
