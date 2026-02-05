import * as THREE from 'three';

export type ColormapName = 'jet' | 'viridis' | 'magma' | 'inferno' | 'turbo';

// Turbo Colormap implementation
export function getTurboColor(v: number): THREE.Color {
  v = Math.max(0, Math.min(1, v));
  const r = 34.61 + v * (198.21 + v * (-564.48 + v * (3302.08 + v * (-9526.58 + v * (13728.54 + v * (-9312.39 + v * 2399.13))))));
  const g = -1.37 + v * (233.19 + v * (757.44 + v * (-2346.73 + v * (3410.83 + v * (-2368.12 + v * (486.63 + v * 153.22))))));
  const b = 27.2 + v * (370.19 + v * (3167.31 + v * (-28166.37 + v * (88786.17 + v * (-141662.1 + v * (116488.0 + v * (-36818.27)))))));
  return new THREE.Color(r / 255, g / 255, b / 255);
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

function lerpColor(t: number, stops: ColorStop[]) {
  if (t <= stops[0].t) return new THREE.Color(stops[0].r, stops[0].g, stops[0].b);
  if (t >= stops[stops.length - 1].t) return new THREE.Color(stops[stops.length - 1].r, stops[stops.length - 1].g, stops[stops.length - 1].b);

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      const localT = (t - stops[i].t) / (stops[i + 1].t - stops[i].t);
      return new THREE.Color(
        lerp(stops[i].r, stops[i + 1].r, localT),
        lerp(stops[i].g, stops[i + 1].g, localT),
        lerp(stops[i].b, stops[i + 1].b, localT)
      );
    }
  }
  return new THREE.Color(0, 0, 0);
}

export function getJetColor(t: number) {
  // Simple Jet approximation
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 1)));
  return new THREE.Color(r, g, b);
}

// Approximations for Viridis/Magma/Inferno using stops
const viridisStops: ColorStop[] = [
  { t: 0.0, r: 0.267, g: 0.004, b: 0.329 },
  { t: 0.25, r: 0.229, g: 0.322, b: 0.545 },
  { t: 0.5, r: 0.128, g: 0.567, b: 0.551 },
  { t: 0.75, r: 0.369, g: 0.787, b: 0.383 },
  { t: 1.0, r: 0.993, g: 0.906, b: 0.144 }
];
export function getViridisColor(t: number) { return lerpColor(t, viridisStops); }

const magmaStops: ColorStop[] = [
  { t: 0.0, r: 0.001, g: 0.000, b: 0.013 },
  { t: 0.25, r: 0.316, g: 0.092, b: 0.418 },
  { t: 0.5, r: 0.716, g: 0.211, b: 0.368 },
  { t: 0.75, r: 0.986, g: 0.549, b: 0.296 },
  { t: 1.0, r: 0.988, g: 0.998, b: 0.749 }
];
export function getMagmaColor(t: number) { return lerpColor(t, magmaStops); }

const infernoStops: ColorStop[] = [
  { t: 0.0, r: 0.001, g: 0.000, b: 0.013 },
  { t: 0.25, r: 0.347, g: 0.057, b: 0.406 },
  { t: 0.5, r: 0.730, g: 0.193, b: 0.279 },
  { t: 0.75, r: 0.963, g: 0.575, b: 0.116 },
  { t: 1.0, r: 0.988, g: 0.998, b: 0.643 }
];
export function getInfernoColor(t: number) { return lerpColor(t, infernoStops); }

export function getColormapColor(t: number, mapName: ColormapName): THREE.Color {
  switch (mapName) {
    case 'jet': return getJetColor(t);
    case 'viridis': return getViridisColor(t);
    case 'magma': return getMagmaColor(t);
    case 'inferno': return getInfernoColor(t);
    case 'turbo': default: return getTurboColor(t);
  }
}
