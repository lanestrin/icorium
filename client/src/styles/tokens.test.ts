// Keeps the design tokens complete, accessible and pixel-identical to Tailwind while Tailwind remains.
// tokens.css and Tailwind's theme.css are read as raw text (vitest.config.ts lets these two through),
// parsed with a small regex and their colours converted to sRGB here, so the test needs no extra dependency.
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';
import tailwindThemeCss from 'tailwindcss/theme.css?raw';

/** Every `--name: value;` declaration in a stylesheet, comments removed and whitespace collapsed. */
function declarations(css: string) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Map<string, string>();
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1], match[2].replace(/\s+/g, ' ').trim());
  }
  return found;
}

const TOKENS = declarations(tokensCss);
const TAILWIND = declarations(tailwindThemeCss);

/** A token's final value, following var(--other) references. */
function resolve(name: string, seen: string[] = []): string {
  const value = TOKENS.get(name);
  if (value === undefined) throw new Error(`Missing token ${name}`);
  if (seen.includes(name)) throw new Error(`Circular token ${[...seen, name].join(' -> ')}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? resolve(reference[1], [...seen, name]) : value;
}

type Rgb = [number, number, number];

/** Converts one gamma-encoded sRGB channel (0-1) to linear light. */
const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** Linear-light sRGB channels (0-1) for a #rgb, #rrggbb or oklch() colour. */
function linearRgb(color: string): Rgb {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return [0, 2, 4].map((i) => toLinear(parseInt(digits.slice(i, i + 2), 16) / 255)) as Rgb;
  }
  const oklch = color.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/);
  if (!oklch) throw new Error(`Unsupported colour ${color}`);
  // OKLCH -> OKLab -> linear sRGB (Björn Ottosson's published matrices).
  const lightness = Number(oklch[1]) / 100;
  const chroma = Number(oklch[2]);
  const hue = (Number(oklch[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** WCAG 2.2 contrast ratio between two tokens' colours. */
function contrast(foreground: string, background: string) {
  const luminance = (token: string) => {
    const [r, g, b] = linearRgb(resolve(token));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const PALETTE: Record<string, (number | string)[]> = {
  slate: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  blue: [50, 100, 200, 300, 400, 500, 600, 700, 800],
  green: [50, 100, 200, 300, 400, 500, 600, 700, 800],
  red: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  amber: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  violet: [50, 700],
};
const PALETTE_TOKENS = [
  'white', 'black',
  ...Object.entries(PALETTE).flatMap(([hue, steps]) => steps.map((step) => `${hue}-${step}`)),
];

const SEMANTIC_COLORS = [
  'page', 'surface', 'surface-subtle', 'surface-hover', 'surface-strong', 'surface-frosted', 'surface-soft',
  'text', 'text-secondary', 'text-muted', 'icon', 'border', 'border-strong', 'border-subtle',
  'primary', 'primary-hover', 'on-primary', 'link', 'primary-surface', 'primary-text', 'primary-border', 'selection-surface',
  'success', 'success-hover', 'on-success', 'success-surface', 'success-border', 'success-text',
  'danger', 'danger-hover', 'on-danger', 'danger-surface', 'danger-border', 'danger-text',
  'warning-surface', 'warning-border', 'warning-text', 'warning-icon', 'processed-surface', 'processed-text',
  'generated-surface', 'generated-text', 'generated-cell', 'backdrop', 'focus', 'connector',
];

/** A palette step, or a palette step mixed with transparent (Tailwind's `/N` opacity form). */
const FROM_PALETTE = /^(var\(--app-color-[\w-]+\)|color-mix\(in oklab, var\(--app-color-[\w-]+\) \d+%, transparent\))$/;

const SIZES = ['xs', 'sm', 'base', 'lg', '2xl', '3xl', '4xl'];
const OTHER_TOKENS = [
  '--app-disabled-opacity', '--app-font-sans', '--app-font-mono',
  ...SIZES.flatMap((size) => [`--app-text-${size}`, `--app-leading-${size}`]), '--app-leading-tight',
  '--app-tracking-tight', '--app-tracking-wide',
  ...['normal', 'medium', 'semibold', 'bold'].map((weight) => `--app-weight-${weight}`),
  '--app-space-unit',
  ...['0-5', '1', '1-5', '2', '2-5', '3', '3-5', '4', '5', '6', '8', '10', '12'].map((step) => `--app-space-${step}`),
  ...['sm', 'md', 'lg', 'xl', '2xl', 'full'].map((radius) => `--app-radius-${radius}`), '--app-border-width',
  ...['sm', 'md', 'lg', '2xl'].map((shadow) => `--app-shadow-${shadow}`),
  '--app-duration-fast', '--app-duration-base', '--app-ease',
  ...['base', 'sticky', 'menu', 'toast', 'modal'].map((layer) => `--app-z-${layer}`),
];

describe('design tokens', () => {
  it('defines every required token', () => {
    const required = [
      ...PALETTE_TOKENS.map((name) => `--app-color-${name}`),
      ...SEMANTIC_COLORS.map((name) => `--app-color-${name}`),
      ...OTHER_TOKENS,
    ];
    expect(required.filter((name) => !TOKENS.has(name))).toEqual([]);
  });

  it('copies each palette step exactly from Tailwind', () => {
    for (const name of PALETTE_TOKENS) {
      expect(TOKENS.get(`--app-color-${name}`), name).toBe(TAILWIND.get(`--color-${name}`));
    }
  });

  it('copies type sizes, weights, radii, shadows and motion from Tailwind', () => {
    for (const size of SIZES) {
      expect(TOKENS.get(`--app-text-${size}`), size).toBe(TAILWIND.get(`--text-${size}`));
      expect(TOKENS.get(`--app-leading-${size}`), size).toBe(TAILWIND.get(`--text-${size}--line-height`));
    }
    for (const weight of ['normal', 'medium', 'semibold', 'bold']) {
      expect(TOKENS.get(`--app-weight-${weight}`), weight).toBe(TAILWIND.get(`--font-weight-${weight}`));
    }
    for (const name of ['radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-2xl', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-2xl']) {
      expect(TOKENS.get(`--app-${name}`), name).toBe(TAILWIND.get(`--${name}`));
    }
    expect(TOKENS.get('--app-leading-tight')).toBe(TAILWIND.get('--leading-tight'));
    expect(TOKENS.get('--app-tracking-tight')).toBe(TAILWIND.get('--tracking-tight'));
    expect(TOKENS.get('--app-tracking-wide')).toBe(TAILWIND.get('--tracking-wide'));
    expect(TOKENS.get('--app-space-unit')).toBe(TAILWIND.get('--spacing'));
    expect(TOKENS.get('--app-duration-fast')).toBe(TAILWIND.get('--default-transition-duration'));
    expect(TOKENS.get('--app-ease')).toBe(TAILWIND.get('--default-transition-timing-function'));
  });

  it('builds semantic colours from palette steps, so a theme can override only the aliases', () => {
    const literal = SEMANTIC_COLORS.filter((name) => name !== 'page' && !FROM_PALETTE.test(TOKENS.get(`--app-color-${name}`) ?? ''));
    expect(literal).toEqual([]);
  });

  it('stacks the layers in order: base, sticky, menu, toast, modal', () => {
    const layers = ['base', 'sticky', 'menu', 'toast', 'modal'].map((layer) => Number(resolve(`--app-z-${layer}`)));
    expect(layers).toEqual([...layers].sort((x, y) => x - y));
    expect(new Set(layers).size).toBe(layers.length);
  });

  describe('contrast (WCAG AA)', () => {
    const textPairs: [string, string][] = [
      ...['text', 'text-secondary', 'text-muted', 'link'].flatMap((text): [string, string][] => [[text, 'surface'], [text, 'page']]),
      ['on-primary', 'primary'],
      ['on-success', 'success'],
      ['on-danger', 'danger'],
      ['success-text', 'success-surface'],
      ['danger-text', 'danger-surface'],
      ['warning-text', 'warning-surface'],
      ['generated-text', 'generated-surface'],
      ['primary-text', 'primary-surface'],
      ['text-secondary', 'surface-hover'],
      ['text-secondary', 'surface-strong'],
      ['processed-text', 'processed-surface'],
      ['link', 'primary-surface'],
    ];
    const uiPairs: [string, string][] = [
      ['icon', 'surface'],
      ['icon', 'page'],
      ['focus', 'surface'],
      ['danger', 'surface'],
      ['warning-icon', 'surface'],
      ['connector', 'surface'],
      ['connector', 'page'],
    ];

    it.each(textPairs)('%s on %s is at least 4.5:1', (foreground, background) => {
      expect(contrast(`--app-color-${foreground}`, `--app-color-${background}`)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(uiPairs)('%s on %s is at least 3:1', (foreground, background) => {
      expect(contrast(`--app-color-${foreground}`, `--app-color-${background}`)).toBeGreaterThanOrEqual(3);
    });

    it('converts colours correctly (black on white is 21:1, Tailwind slate-500 on white about 4.76:1)', () => {
      expect(contrast('--app-color-black', '--app-color-white')).toBeCloseTo(21, 5);
      expect(contrast('--app-color-slate-500', '--app-color-white')).toBeCloseTo(4.76, 1);
    });
  });
});
