import * as THREE from 'three';

export type ColormapName = 'jet' | 'viridis' | 'magma' | 'inferno' | 'turbo';

/**
 * The colormap as display-referred sRGB: the colours as they should appear on screen.
 * Not for GPU colour buffers — use getColormapLUTLinear for those.
 */
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

// Turbo (Anton Mikhailov, Copyright 2019 Google LLC, Apache-2.0): every 5th entry of the official
// 256-entry sRGB LUT (https://gist.github.com/mikhailov-work/6a308c20e494d9e0ccc29036b28faa7a),
// at t = index / 255. Interpolating between them stays within 0.0026 (< 1/255) of the full table.
const turboStops: ColorStop[] = [
  { t: 0 / 255, r: 0.18995, g: 0.07176, b: 0.23217 },
  { t: 5 / 255, r: 0.21291, g: 0.12947, b: 0.37314 },
  { t: 10 / 255, r: 0.23236, g: 0.18603, b: 0.50004 },
  { t: 15 / 255, r: 0.24830, g: 0.24143, b: 0.61286 },
  { t: 20 / 255, r: 0.26074, g: 0.29568, b: 0.71162 },
  { t: 25 / 255, r: 0.26967, g: 0.34878, b: 0.79631 },
  { t: 30 / 255, r: 0.27509, g: 0.40072, b: 0.86692 },
  { t: 35 / 255, r: 0.27701, g: 0.45152, b: 0.92347 },
  { t: 40 / 255, r: 0.27543, g: 0.50115, b: 0.96594 },
  { t: 45 / 255, r: 0.26878, g: 0.54995, b: 0.99303 },
  { t: 50 / 255, r: 0.24946, g: 0.59943, b: 0.99835 },
  { t: 55 / 255, r: 0.22039, g: 0.64901, b: 0.98436 },
  { t: 60 / 255, r: 0.18625, g: 0.69775, b: 0.95498 },
  { t: 65 / 255, r: 0.15173, g: 0.74472, b: 0.91416 },
  { t: 70 / 255, r: 0.12151, g: 0.78896, b: 0.86581 },
  { t: 75 / 255, r: 0.10026, g: 0.82955, b: 0.81389 },
  { t: 80 / 255, r: 0.09267, g: 0.86554, b: 0.76230 },
  { t: 85 / 255, r: 0.10342, g: 0.89600, b: 0.71500 },
  { t: 90 / 255, r: 0.13526, g: 0.92197, b: 0.66556 },
  { t: 95 / 255, r: 0.18491, g: 0.94484, b: 0.60713 },
  { t: 100 / 255, r: 0.24797, g: 0.96423, b: 0.54303 },
  { t: 105 / 255, r: 0.32006, g: 0.97974, b: 0.47654 },
  { t: 110 / 255, r: 0.39678, g: 0.99098, b: 0.41098 },
  { t: 115 / 255, r: 0.47375, g: 0.99755, b: 0.34963 },
  { t: 120 / 255, r: 0.54658, g: 0.99907, b: 0.29581 },
  { t: 125 / 255, r: 0.61088, g: 0.99514, b: 0.25280 },
  { t: 130 / 255, r: 0.66428, g: 0.98524, b: 0.22370 },
  { t: 135 / 255, r: 0.71577, g: 0.96875, b: 0.20815 },
  { t: 140 / 255, r: 0.76608, g: 0.94627, b: 0.20311 },
  { t: 145 / 255, r: 0.81410, g: 0.91861, b: 0.20552 },
  { t: 150 / 255, r: 0.85868, g: 0.88655, b: 0.21230 },
  { t: 155 / 255, r: 0.89870, g: 0.85087, b: 0.22038 },
  { t: 160 / 255, r: 0.93301, g: 0.81236, b: 0.22667 },
  { t: 165 / 255, r: 0.96049, g: 0.77181, b: 0.22811 },
  { t: 170 / 255, r: 0.98000, g: 0.73000, b: 0.22161 },
  { t: 175 / 255, r: 0.99163, g: 0.68408, b: 0.20706 },
  { t: 180 / 255, r: 0.99654, g: 0.63193, b: 0.18738 },
  { t: 185 / 255, r: 0.99517, g: 0.57549, b: 0.16412 },
  { t: 190 / 255, r: 0.98799, g: 0.51667, b: 0.13883 },
  { t: 195 / 255, r: 0.97545, g: 0.45740, b: 0.11305 },
  { t: 200 / 255, r: 0.95801, g: 0.39958, b: 0.08831 },
  { t: 205 / 255, r: 0.93612, g: 0.34513, b: 0.06616 },
  { t: 210 / 255, r: 0.91024, g: 0.29599, b: 0.04814 },
  { t: 215 / 255, r: 0.88066, g: 0.25334, b: 0.03521 },
  { t: 220 / 255, r: 0.84662, g: 0.21407, b: 0.02487 },
  { t: 225 / 255, r: 0.80799, g: 0.17753, b: 0.01660 },
  { t: 230 / 255, r: 0.76476, g: 0.14374, b: 0.01041 },
  { t: 235 / 255, r: 0.71692, g: 0.11268, b: 0.00629 },
  { t: 240 / 255, r: 0.66449, g: 0.08436, b: 0.00424 },
  { t: 245 / 255, r: 0.60746, g: 0.05878, b: 0.00427 },
  { t: 250 / 255, r: 0.54583, g: 0.03593, b: 0.00638 },
  { t: 255 / 255, r: 0.47960, g: 0.01583, b: 0.01055 }
];
export function getTurboColor(v: number, target?: THREE.Color): THREE.Color { return lerpColor(v, turboStops, target); }

// ⚡ Bolt Optimization: Cache colormaps in a Look-Up Table (LUT)
// This avoids re-running the stop search and interpolation on every pixel/point.
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

const linearColormapCache = new Map<ColormapName, Float32Array>();

/**
 * getColormapLUT converted to three's linear working colour space, for writing straight
 * into BufferGeometry `color` attributes and InstancedMesh.instanceColor. The built-in
 * materials sRGB-encode every fragment on output (colorspace_fragment), which turns these
 * back into the colormap's own colours; the sRGB LUT written raw would be encoded twice
 * and render washed out (Turbo t=0 #30123b as #794c84).
 */
export function getColormapLUTLinear(mapName: ColormapName): Float32Array {
  let lut = linearColormapCache.get(mapName);
  if (!lut) {
    const srgb = getColormapLUT(mapName);
    lut = new Float32Array(srgb.length);
    const color = new THREE.Color();
    for (let i = 0; i < srgb.length; i += 3) {
      color.setRGB(srgb[i], srgb[i + 1], srgb[i + 2], THREE.SRGBColorSpace);
      lut[i] = color.r;
      lut[i + 1] = color.g;
      lut[i + 2] = color.b;
    }
    linearColormapCache.set(mapName, lut);
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
