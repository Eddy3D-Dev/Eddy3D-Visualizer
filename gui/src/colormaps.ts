import * as THREE from 'three';

export type ColormapName = 'jet' | 'viridis' | 'magma' | 'inferno' | 'turbo';

// Turbo Colormap implementation
export function getTurboColor(v: number, target?: THREE.Color): THREE.Color {
  const color = target || new THREE.Color();
  v = Math.max(0, Math.min(1, v));
  const r = 34.61 + v * (198.21 + v * (-564.48 + v * (3302.08 + v * (-9526.58 + v * (13728.54 + v * (-9312.39 + v * 2399.13))))));
  const g = -1.37 + v * (233.19 + v * (757.44 + v * (-2346.73 + v * (3410.83 + v * (-2368.12 + v * (486.63 + v * 153.22))))));
  const b = 27.2 + v * (370.19 + v * (3167.31 + v * (-28166.37 + v * (88786.17 + v * (-141662.1 + v * (116488.0 + v * (-36818.27)))))));
  color.setRGB(r / 255, g / 255, b / 255);
  return color;
}

export function getColormapLUT(mapName: ColormapName): Float32Array {
  let lut: Float32Array;
  if (mapName === lastMapName && lastLut) {
    lut = lastLut;
  } else {
    lut = colormapCache.get(mapName)!;
    if (!lut) {
      lut = generateLUT(mapName);
      colormapCache.set(mapName, lut);
    }
    lastMapName = mapName;
    lastLut = lut;
  }
  return lut;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface ColorStop {
  t: number;
  r: number;
  g: number;
  b: number;
}

function lerpColor(t: number, stops: ColorStop[], target?: THREE.Color) {
  const color = target || new THREE.Color();
  if (t <= stops[0].t) {
    color.setRGB(stops[0].r, stops[0].g, stops[0].b);
    return color;
  }
  if (t >= stops[stops.length - 1].t) {
    color.setRGB(stops[stops.length - 1].r, stops[stops.length - 1].g, stops[stops.length - 1].b);
    return color;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      const localT = (t - stops[i].t) / (stops[i + 1].t - stops[i].t);
      color.setRGB(
        lerp(stops[i].r, stops[i + 1].r, localT),
        lerp(stops[i].g, stops[i + 1].g, localT),
        lerp(stops[i].b, stops[i + 1].b, localT)
      );
      return color;
    }
  }
  color.setRGB(0, 0, 0);
  return color;
}

export function getJetColor(t: number, target?: THREE.Color) {
  const color = target || new THREE.Color();
  // Simple Jet approximation
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 1)));
  color.setRGB(r, g, b);
  return color;
}

// Approximations for Viridis/Magma/Inferno using stops
const viridisStops: ColorStop[] = [
  { t: 0.0, r: 0.267, g: 0.004, b: 0.329 },
  { t: 0.25, r: 0.229, g: 0.322, b: 0.545 },
  { t: 0.5, r: 0.128, g: 0.567, b: 0.551 },
  { t: 0.75, r: 0.369, g: 0.787, b: 0.383 },
  { t: 1.0, r: 0.993, g: 0.906, b: 0.144 }
];
export function getViridisColor(t: number, target?: THREE.Color) { return lerpColor(t, viridisStops, target); }

const magmaStops: ColorStop[] = [
  { t: 0.0, r: 0.001, g: 0.000, b: 0.013 },
  { t: 0.25, r: 0.316, g: 0.092, b: 0.418 },
  { t: 0.5, r: 0.716, g: 0.211, b: 0.368 },
  { t: 0.75, r: 0.986, g: 0.549, b: 0.296 },
  { t: 1.0, r: 0.988, g: 0.998, b: 0.749 }
];
export function getMagmaColor(t: number, target?: THREE.Color) { return lerpColor(t, magmaStops, target); }

const infernoStops: ColorStop[] = [
  { t: 0.0, r: 0.001, g: 0.000, b: 0.013 },
  { t: 0.25, r: 0.347, g: 0.057, b: 0.406 },
  { t: 0.5, r: 0.730, g: 0.193, b: 0.279 },
  { t: 0.75, r: 0.963, g: 0.575, b: 0.116 },
  { t: 1.0, r: 0.988, g: 0.998, b: 0.643 }
];
export function getInfernoColor(t: number, target?: THREE.Color) { return lerpColor(t, infernoStops, target); }

// ⚡ Bolt Optimization: Cache colormaps in a Look-Up Table (LUT)
// This avoids expensive polynomial evaluations and linear interpolation on every pixel/point.
export const LUT_SIZE = 1024;
const colormapCache = new Map<ColormapName, Float32Array>();
let lastMapName: ColormapName | null = null;
let lastLut: Float32Array | null = null;

function generateLUT(mapName: ColormapName): Float32Array {
  const lut = new Float32Array(LUT_SIZE * 3);
  const color = new THREE.Color();
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    let c: THREE.Color;
    switch (mapName) {
      case 'jet': c = getJetColor(t, color); break;
      case 'viridis': c = getViridisColor(t, color); break;
      case 'magma': c = getMagmaColor(t, color); break;
      case 'inferno': c = getInfernoColor(t, color); break;
      case 'turbo': default: c = getTurboColor(t, color); break;
    }
    lut[i * 3] = c.r;
    lut[i * 3 + 1] = c.g;
    lut[i * 3 + 2] = c.b;
  }
  return lut;
}

export function getColormapColor(t: number, mapName: ColormapName, target?: THREE.Color): THREE.Color {
  const lut = getColormapLUT(mapName);

  const color = target || new THREE.Color();
  const index = Math.floor(Math.max(0, Math.min(1, t)) * (LUT_SIZE - 1));
  const i3 = index * 3;

  color.setRGB(lut[i3], lut[i3 + 1], lut[i3 + 2]);
  return color;
}
