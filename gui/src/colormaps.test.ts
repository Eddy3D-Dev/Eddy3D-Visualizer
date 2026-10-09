import { describe, it, expect } from 'vitest';
import {
  getTurboColor,
  getJetColor,
  getViridisColor,
  getMagmaColor,
  getInfernoColor,
  getColormapLUT,
  getColormapColor,
  LUT_SIZE,
  type ColormapName,
} from './colormaps';
import * as THREE from 'three';

// ── helpers ──────────────────────────────────────────────────────────────────
function rgbIsFinite(c: THREE.Color) {
  expect(Number.isFinite(c.r)).toBe(true);
  expect(Number.isFinite(c.g)).toBe(true);
  expect(Number.isFinite(c.b)).toBe(true);
}

// '#rrggbb' → 0–1 components, bypassing three.js colour management. The colormaps
// write sRGB values with setRGB(), whose default colour space is the working space,
// so they are stored and read back (.r/.g/.b) unconverted. new THREE.Color('#30123b')
// would linearise the hex instead (0x30 → 0.03, not 0.19).
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

const ALL_MAPS: ColormapName[] = ['turbo', 'jet', 'viridis', 'magma', 'inferno'];

// ── Colormaps that clamp their input to [0, 1] ──────────────────────────────
// turbo/viridis/magma/inferno: stop-based, clamped to the first/last stop.
// jet: does NOT clamp input — tested separately.
describe.each([
  { name: 'turbo', fn: getTurboColor },
  { name: 'viridis', fn: getViridisColor },
  { name: 'magma', fn: getMagmaColor },
  { name: 'inferno', fn: getInfernoColor },
])('$name colormap (clamped)', ({ fn }) => {
  it('returns valid RGB at t=0', () => rgbIsFinite(fn(0)));
  it('returns valid RGB at t=0.5', () => rgbIsFinite(fn(0.5)));
  it('returns valid RGB at t=1', () => rgbIsFinite(fn(1)));

  it('clamps values below 0 to t=0', () => {
    const c = fn(-1);
    const c0 = fn(0);
    expect(c.r).toBeCloseTo(c0.r, 2);
    expect(c.g).toBeCloseTo(c0.g, 2);
    expect(c.b).toBeCloseTo(c0.b, 2);
  });

  it('clamps values above 1 to t=1', () => {
    const c = fn(2);
    const c1 = fn(1);
    expect(c.r).toBeCloseTo(c1.r, 2);
    expect(c.g).toBeCloseTo(c1.g, 2);
    expect(c.b).toBeCloseTo(c1.b, 2);
  });

  it('reuses a provided target color', () => {
    const target = new THREE.Color();
    const result = fn(0.5, target);
    expect(result).toBe(target);
  });

  it('creates a new color when no target given', () => {
    const result = fn(0.5);
    expect(result).toBeInstanceOf(THREE.Color);
  });
});

// ── Turbo reference values ──────────────────────────────────────────────────
// Entries of Google's official 256-entry Turbo LUT (turbo_srgb_bytes) at
// t = index / 255: dark blue → light blue → green → orange → dark red.
const TURBO_REFERENCE: [index: number, hex: string][] = [
  [0, '#30123b'],
  [64, '#28bceb'],
  [128, '#a4fc3c'],
  [192, '#fb7e21'],
  [255, '#7a0403'],
];

// Within 0.005 (~1/255) per channel.
function expectColorNearHex(c: THREE.Color, hex: string) {
  const e = hexToRgb(hex);
  expect(c.r).toBeCloseTo(e.r, 2);
  expect(c.g).toBeCloseTo(e.g, 2);
  expect(c.b).toBeCloseTo(e.b, 2);
}

describe('turbo colormap matches the official Turbo LUT', () => {
  it.each(TURBO_REFERENCE)('getTurboColor(%i / 255) ≈ %s', (index, hex) => {
    expectColorNearHex(getTurboColor(index / 255), hex);
  });

  it.each(TURBO_REFERENCE)("getColormapColor(%i / 255, 'turbo') ≈ %s", (index, hex) => {
    expectColorNearHex(getColormapColor(index / 255, 'turbo'), hex);
  });
});

// ── Jet colormap (no internal clamping) ─────────────────────────────────────
describe('jet colormap (unclamped)', () => {
  it('returns valid RGB at t=0', () => rgbIsFinite(getJetColor(0)));
  it('returns valid RGB at t=0.5', () => rgbIsFinite(getJetColor(0.5)));
  it('returns valid RGB at t=1', () => rgbIsFinite(getJetColor(1)));

  it('returns a THREE.Color for out-of-range input', () => {
    expect(getJetColor(-1)).toBeInstanceOf(THREE.Color);
    expect(getJetColor(2)).toBeInstanceOf(THREE.Color);
  });

  it('reuses a provided target color', () => {
    const target = new THREE.Color();
    expect(getJetColor(0.5, target)).toBe(target);
  });

  it('produces distinct colours at 0, 0.5, 1', () => {
    const c0 = getJetColor(0);
    const c5 = getJetColor(0.5);
    const c1 = getJetColor(1);
    // At least one channel should differ significantly
    const diffA = Math.abs(c0.r - c5.r) + Math.abs(c0.g - c5.g) + Math.abs(c0.b - c5.b);
    const diffB = Math.abs(c5.r - c1.r) + Math.abs(c5.g - c1.g) + Math.abs(c5.b - c1.b);
    expect(diffA).toBeGreaterThan(0.1);
    expect(diffB).toBeGreaterThan(0.1);
  });
});

// ── LUT generation ──────────────────────────────────────────────────────────
describe('getColormapLUT', () => {
  it.each(ALL_MAPS)('generates a Float32Array of length LUT_SIZE*3 for %s', (name) => {
    const lut = getColormapLUT(name);
    expect(lut).toBeInstanceOf(Float32Array);
    expect(lut.length).toBe(LUT_SIZE * 3);
  });

  it('returns the same cached LUT on repeated calls', () => {
    const a = getColormapLUT('jet');
    const b = getColormapLUT('jet');
    expect(a).toBe(b);
  });

  it('returns different LUTs for different colormaps', () => {
    const jet = getColormapLUT('jet');
    const viridis = getColormapLUT('viridis');
    expect(jet).not.toBe(viridis);
  });

  it('LUT values are all finite numbers', () => {
    for (const name of ALL_MAPS) {
      const lut = getColormapLUT(name);
      for (let i = 0; i < lut.length; i++) {
        expect(Number.isFinite(lut[i])).toBe(true);
      }
    }
  });

  it('stop-based LUT values (turbo/viridis/magma/inferno) are in [0, 1]', () => {
    for (const name of ['turbo', 'viridis', 'magma', 'inferno'] as ColormapName[]) {
      const lut = getColormapLUT(name);
      for (let i = 0; i < lut.length; i++) {
        expect(lut[i]).toBeGreaterThanOrEqual(0);
        expect(lut[i]).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ── getColormapColor (LUT lookup) ────────────────────────────────────────────
describe('getColormapColor', () => {
  it('returns valid color for mid-range value', () => {
    const c = getColormapColor(0.5, 'jet');
    rgbIsFinite(c);
  });

  it('clamps t to [0, 1] for LUT lookup', () => {
    const cLow = getColormapColor(-5, 'turbo');
    const c0 = getColormapColor(0, 'turbo');
    expect(cLow.r).toBeCloseTo(c0.r, 4);

    const cHigh = getColormapColor(99, 'turbo');
    const c1 = getColormapColor(1, 'turbo');
    expect(cHigh.r).toBeCloseTo(c1.r, 4);
  });

  it('reuses target color', () => {
    const target = new THREE.Color();
    const result = getColormapColor(0.5, 'viridis', target);
    expect(result).toBe(target);
  });
});

// ── LUT_SIZE constant ────────────────────────────────────────────────────────
describe('LUT_SIZE', () => {
  it('is 1024', () => {
    expect(LUT_SIZE).toBe(1024);
  });
});
