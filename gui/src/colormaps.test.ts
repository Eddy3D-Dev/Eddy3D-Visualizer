import { describe, it, expect } from 'vitest';
import {
  getTurboColor,
  getJetColor,
  getViridisColor,
  getMagmaColor,
  getInfernoColor,
  getColormapLUT,
  getColormapLUTLinear,
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

// ── Viridis/Magma/Inferno reference values ──────────────────────────────────
// Entries of matplotlib's 256-entry tables at t = index / 255. Magma and inferno
// share their dark end but split above the middle: pink → salmon → cream versus
// red → orange → yellow.
const MPL_REFERENCE: [name: 'viridis' | 'magma' | 'inferno', index: number, hex: string][] = [
  ['viridis', 0, '#440154'], ['viridis', 64, '#3b528b'], ['viridis', 128, '#21918c'],
  ['viridis', 192, '#5ec962'], ['viridis', 255, '#fde725'],
  ['magma', 0, '#000004'], ['magma', 64, '#51127c'], ['magma', 128, '#b73779'],
  ['magma', 192, '#fc8961'], ['magma', 255, '#fcfdbf'],
  ['inferno', 0, '#000004'], ['inferno', 64, '#57106e'], ['inferno', 128, '#bc3754'],
  ['inferno', 192, '#f98e09'], ['inferno', 255, '#fcffa4'],
];
const MPL_FNS = { viridis: getViridisColor, magma: getMagmaColor, inferno: getInfernoColor };

describe("viridis/magma/inferno match matplotlib's tables", () => {
  it.each(MPL_REFERENCE)('%s(%i / 255) ≈ %s', (name, index, hex) => {
    expectColorNearHex(MPL_FNS[name](index / 255), hex);
  });

  it.each(MPL_REFERENCE)('%s via getColormapColor(%i / 255) ≈ %s', (name, index, hex) => {
    expectColorNearHex(getColormapColor(index / 255, name), hex);
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

// ── Linear LUT for GPU colour buffers ───────────────────────────────────────
// three treats vertex/instance colours as linear and sRGB-encodes them on output
// (colorspace_fragment). Encoding the linear LUT the same way must give back the sRGB
// colormap; the sRGB LUT written in raw is encoded twice and renders washed out.
describe('getColormapLUTLinear', () => {
  it.each(ALL_MAPS)('sRGB-encodes back to the %s LUT', (name) => {
    const srgb = getColormapLUT(name);
    const linear = getColormapLUTLinear(name);
    expect(linear).toBeInstanceOf(Float32Array);
    expect(linear.length).toBe(LUT_SIZE * 3);

    const c = new THREE.Color();
    const out = { r: 0, g: 0, b: 0 };
    let maxErr = 0;
    for (let i = 0; i < linear.length; i += 3) {
      c.setRGB(linear[i], linear[i + 1], linear[i + 2]).getRGB(out, THREE.SRGBColorSpace);
      maxErr = Math.max(maxErr, Math.abs(out.r - srgb[i]), Math.abs(out.g - srgb[i + 1]), Math.abs(out.b - srgb[i + 2]));
    }
    expect(maxErr).toBeLessThan(1e-5);
  });

  // getHexString() converts linear → sRGB and rounds to bytes, as the renderer does.
  it.each<[index: number, hex: string]>([
    [0, '30123b'],
    [LUT_SIZE - 1, '7a0403'],
  ])('turbo entry %i renders as #%s', (index, hex) => {
    const lut = getColormapLUTLinear('turbo');
    const i3 = index * 3;
    expect(new THREE.Color(lut[i3], lut[i3 + 1], lut[i3 + 2]).getHexString()).toBe(hex);
  });

  it.each(TURBO_REFERENCE)('turbo at %i / 255 renders within ~1/255 of %s', (index, hex) => {
    const lut = getColormapLUTLinear('turbo');
    const i3 = Math.floor((index / 255) * (LUT_SIZE - 1)) * 3;
    const displayed = new THREE.Color();
    new THREE.Color(lut[i3], lut[i3 + 1], lut[i3 + 2]).getRGB(displayed, THREE.SRGBColorSpace);
    expectColorNearHex(displayed, hex);
  });

  it('holds linear values, not the sRGB table', () => {
    // Turbo t=0 is #30123b: red 0.19 in sRGB, 0.030 linear.
    expect(getColormapLUT('turbo')[0]).toBeCloseTo(0.19, 2);
    expect(getColormapLUTLinear('turbo')[0]).toBeCloseTo(0.030, 3);
  });

  it('is cached per colormap and never aliases the sRGB LUT', () => {
    expect(getColormapLUTLinear('viridis')).toBe(getColormapLUTLinear('viridis'));
    expect(getColormapLUTLinear('viridis')).not.toBe(getColormapLUTLinear('magma'));
    expect(getColormapLUTLinear('turbo')).not.toBe(getColormapLUT('turbo'));
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
