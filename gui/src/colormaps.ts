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

// Viridis/Magma/Inferno (Nathaniel J. Smith, Stefan van der Walt and Eric Firing, CC0): every 5th
// entry of matplotlib's 256-entry tables, at t = index / 255. Interpolating between them stays
// within 0.0028 (< 1/255) of the full tables.
const viridisStops: ColorStop[] = [
  { t: 0 / 255, r: 0.267004, g: 0.004874, b: 0.329415 },
  { t: 5 / 255, r: 0.273809, g: 0.031497, b: 0.358853 },
  { t: 10 / 255, r: 0.278791, g: 0.062145, b: 0.386592 },
  { t: 15 / 255, r: 0.281924, g: 0.089666, b: 0.412415 },
  { t: 20 / 255, r: 0.283197, g: 0.115680, b: 0.436115 },
  { t: 25 / 255, r: 0.282623, g: 0.140926, b: 0.457517 },
  { t: 30 / 255, r: 0.280255, g: 0.165693, b: 0.476498 },
  { t: 35 / 255, r: 0.276194, g: 0.190074, b: 0.493001 },
  { t: 40 / 255, r: 0.270595, g: 0.214069, b: 0.507052 },
  { t: 45 / 255, r: 0.263663, g: 0.237631, b: 0.518762 },
  { t: 50 / 255, r: 0.255645, g: 0.260703, b: 0.528312 },
  { t: 55 / 255, r: 0.246811, g: 0.283237, b: 0.535941 },
  { t: 60 / 255, r: 0.237441, g: 0.305202, b: 0.541921 },
  { t: 65 / 255, r: 0.227802, g: 0.326594, b: 0.546532 },
  { t: 70 / 255, r: 0.218130, g: 0.347432, b: 0.550038 },
  { t: 75 / 255, r: 0.208623, g: 0.367752, b: 0.552675 },
  { t: 80 / 255, r: 0.199430, g: 0.387607, b: 0.554642 },
  { t: 85 / 255, r: 0.190631, g: 0.407061, b: 0.556089 },
  { t: 90 / 255, r: 0.182256, g: 0.426184, b: 0.557120 },
  { t: 95 / 255, r: 0.174274, g: 0.445044, b: 0.557792 },
  { t: 100 / 255, r: 0.166617, g: 0.463708, b: 0.558119 },
  { t: 105 / 255, r: 0.159194, g: 0.482237, b: 0.558073 },
  { t: 110 / 255, r: 0.151918, g: 0.500685, b: 0.557587 },
  { t: 115 / 255, r: 0.144759, g: 0.519093, b: 0.556572 },
  { t: 120 / 255, r: 0.137770, g: 0.537492, b: 0.554906 },
  { t: 125 / 255, r: 0.131172, g: 0.555899, b: 0.552459 },
  { t: 130 / 255, r: 0.125394, g: 0.574318, b: 0.549086 },
  { t: 135 / 255, r: 0.121148, g: 0.592739, b: 0.544641 },
  { t: 140 / 255, r: 0.119423, g: 0.611141, b: 0.538982 },
  { t: 145 / 255, r: 0.121380, g: 0.629492, b: 0.531973 },
  { t: 150 / 255, r: 0.128087, g: 0.647749, b: 0.523491 },
  { t: 155 / 255, r: 0.140210, g: 0.665859, b: 0.513427 },
  { t: 160 / 255, r: 0.157851, g: 0.683765, b: 0.501686 },
  { t: 165 / 255, r: 0.180653, g: 0.701402, b: 0.488189 },
  { t: 170 / 255, r: 0.208030, g: 0.718701, b: 0.472873 },
  { t: 175 / 255, r: 0.239374, g: 0.735588, b: 0.455688 },
  { t: 180 / 255, r: 0.274149, g: 0.751988, b: 0.436601 },
  { t: 185 / 255, r: 0.311925, g: 0.767822, b: 0.415586 },
  { t: 190 / 255, r: 0.352360, g: 0.783011, b: 0.392636 },
  { t: 195 / 255, r: 0.395174, g: 0.797475, b: 0.367757 },
  { t: 200 / 255, r: 0.440137, g: 0.811138, b: 0.340967 },
  { t: 205 / 255, r: 0.487026, g: 0.823929, b: 0.312321 },
  { t: 210 / 255, r: 0.535621, g: 0.835785, b: 0.281908 },
  { t: 215 / 255, r: 0.585678, g: 0.846661, b: 0.249897 },
  { t: 220 / 255, r: 0.636902, g: 0.856542, b: 0.216620 },
  { t: 225 / 255, r: 0.688944, g: 0.865448, b: 0.182725 },
  { t: 230 / 255, r: 0.741388, g: 0.873449, b: 0.149561 },
  { t: 235 / 255, r: 0.793760, g: 0.880678, b: 0.120005 },
  { t: 240 / 255, r: 0.845561, g: 0.887322, b: 0.099702 },
  { t: 245 / 255, r: 0.896320, g: 0.893616, b: 0.096335 },
  { t: 250 / 255, r: 0.945636, g: 0.899815, b: 0.112838 },
  { t: 255 / 255, r: 0.993248, g: 0.906157, b: 0.143936 }
];
export function getViridisColor(t: number, target?: THREE.Color) { return lerpColor(t, viridisStops, target); }

const magmaStops: ColorStop[] = [
  { t: 0 / 255, r: 0.001462, g: 0.000466, b: 0.013866 },
  { t: 5 / 255, r: 0.007588, g: 0.006356, b: 0.044973 },
  { t: 10 / 255, r: 0.018815, g: 0.016026, b: 0.084584 },
  { t: 15 / 255, r: 0.035520, g: 0.028397, b: 0.125209 },
  { t: 20 / 255, r: 0.056615, g: 0.042160, b: 0.167446 },
  { t: 25 / 255, r: 0.078815, g: 0.054184, b: 0.211667 },
  { t: 30 / 255, r: 0.102815, g: 0.063010, b: 0.257854 },
  { t: 35 / 255, r: 0.129380, g: 0.067935, b: 0.305443 },
  { t: 40 / 255, r: 0.159018, g: 0.068354, b: 0.352688 },
  { t: 45 / 255, r: 0.191460, g: 0.064818, b: 0.396152 },
  { t: 50 / 255, r: 0.225302, g: 0.060445, b: 0.431742 },
  { t: 55 / 255, r: 0.258857, g: 0.059706, b: 0.457710 },
  { t: 60 / 255, r: 0.291366, g: 0.064553, b: 0.475462 },
  { t: 65 / 255, r: 0.322899, g: 0.073782, b: 0.487408 },
  { t: 70 / 255, r: 0.353773, g: 0.085373, b: 0.495501 },
  { t: 75 / 255, r: 0.384299, g: 0.097855, b: 0.501002 },
  { t: 80 / 255, r: 0.414709, g: 0.110431, b: 0.504662 },
  { t: 85 / 255, r: 0.445163, g: 0.122724, b: 0.506901 },
  { t: 90 / 255, r: 0.475780, g: 0.134577, b: 0.507921 },
  { t: 95 / 255, r: 0.506629, g: 0.145958, b: 0.507806 },
  { t: 100 / 255, r: 0.537755, g: 0.156894, b: 0.506551 },
  { t: 105 / 255, r: 0.569172, g: 0.167454, b: 0.504105 },
  { t: 110 / 255, r: 0.600868, g: 0.177743, b: 0.500394 },
  { t: 115 / 255, r: 0.632805, g: 0.187893, b: 0.495332 },
  { t: 120 / 255, r: 0.664915, g: 0.198075, b: 0.488836 },
  { t: 125 / 255, r: 0.697098, g: 0.208501, b: 0.480835 },
  { t: 130 / 255, r: 0.729216, g: 0.219437, b: 0.471279 },
  { t: 135 / 255, r: 0.761077, g: 0.231214, b: 0.460162 },
  { t: 140 / 255, r: 0.792427, g: 0.244242, b: 0.447543 },
  { t: 145 / 255, r: 0.822926, g: 0.259016, b: 0.433573 },
  { t: 150 / 255, r: 0.852126, g: 0.276106, b: 0.418573 },
  { t: 155 / 255, r: 0.879464, g: 0.296125, b: 0.403118 },
  { t: 160 / 255, r: 0.904281, g: 0.319610, b: 0.388137 },
  { t: 165 / 255, r: 0.925937, g: 0.346844, b: 0.374959 },
  { t: 170 / 255, r: 0.944006, g: 0.377643, b: 0.365136 },
  { t: 175 / 255, r: 0.958464, g: 0.411324, b: 0.360014 },
  { t: 180 / 255, r: 0.969680, g: 0.446936, b: 0.360311 },
  { t: 185 / 255, r: 0.978210, g: 0.483612, b: 0.366025 },
  { t: 190 / 255, r: 0.984622, g: 0.520713, b: 0.376698 },
  { t: 195 / 255, r: 0.989363, g: 0.557873, b: 0.391671 },
  { t: 200 / 255, r: 0.992785, g: 0.594891, b: 0.410283 },
  { t: 205 / 255, r: 0.995122, g: 0.631696, b: 0.431951 },
  { t: 210 / 255, r: 0.996580, g: 0.668256, b: 0.456192 },
  { t: 215 / 255, r: 0.997254, g: 0.704611, b: 0.482635 },
  { t: 220 / 255, r: 0.997285, g: 0.740772, b: 0.510983 },
  { t: 225 / 255, r: 0.996727, g: 0.776795, b: 0.541039 },
  { t: 230 / 255, r: 0.995680, g: 0.812706, b: 0.572645 },
  { t: 235 / 255, r: 0.994222, g: 0.848540, b: 0.605696 },
  { t: 240 / 255, r: 0.992440, g: 0.884330, b: 0.640099 },
  { t: 245 / 255, r: 0.990570, g: 0.920049, b: 0.675675 },
  { t: 250 / 255, r: 0.988717, g: 0.955742, b: 0.712242 },
  { t: 255 / 255, r: 0.987053, g: 0.991438, b: 0.749504 }
];
export function getMagmaColor(t: number, target?: THREE.Color) { return lerpColor(t, magmaStops, target); }

const infernoStops: ColorStop[] = [
  { t: 0 / 255, r: 0.001462, g: 0.000466, b: 0.013866 },
  { t: 5 / 255, r: 0.007676, g: 0.006136, b: 0.046836 },
  { t: 10 / 255, r: 0.019373, g: 0.015133, b: 0.088767 },
  { t: 15 / 255, r: 0.037668, g: 0.025921, b: 0.132232 },
  { t: 20 / 255, r: 0.061340, g: 0.036590, b: 0.177642 },
  { t: 25 / 255, r: 0.087411, g: 0.044556, b: 0.224813 },
  { t: 30 / 255, r: 0.116656, g: 0.047574, b: 0.272321 },
  { t: 35 / 255, r: 0.149073, g: 0.045468, b: 0.317085 },
  { t: 40 / 255, r: 0.183429, g: 0.040329, b: 0.354971 },
  { t: 45 / 255, r: 0.217949, g: 0.036615, b: 0.383522 },
  { t: 50 / 255, r: 0.251620, g: 0.037705, b: 0.403378 },
  { t: 55 / 255, r: 0.284321, g: 0.043933, b: 0.416608 },
  { t: 60 / 255, r: 0.316282, g: 0.053490, b: 0.425116 },
  { t: 65 / 255, r: 0.347771, g: 0.064616, b: 0.430217 },
  { t: 70 / 255, r: 0.379001, g: 0.076253, b: 0.432719 },
  { t: 75 / 255, r: 0.410113, g: 0.087896, b: 0.433098 },
  { t: 80 / 255, r: 0.441207, g: 0.099338, b: 0.431594 },
  { t: 85 / 255, r: 0.472328, g: 0.110547, b: 0.428334 },
  { t: 90 / 255, r: 0.503493, g: 0.121575, b: 0.423356 },
  { t: 95 / 255, r: 0.534683, g: 0.132534, b: 0.416667 },
  { t: 100 / 255, r: 0.565854, g: 0.143567, b: 0.408258 },
  { t: 105 / 255, r: 0.596940, g: 0.154848, b: 0.398125 },
  { t: 110 / 255, r: 0.627847, g: 0.166575, b: 0.386276 },
  { t: 115 / 255, r: 0.658463, g: 0.178962, b: 0.372748 },
  { t: 120 / 255, r: 0.688653, g: 0.192239, b: 0.357603 },
  { t: 125 / 255, r: 0.718264, g: 0.206636, b: 0.340931 },
  { t: 130 / 255, r: 0.747127, g: 0.222378, b: 0.322856 },
  { t: 135 / 255, r: 0.775059, g: 0.239667, b: 0.303526 },
  { t: 140 / 255, r: 0.801871, g: 0.258674, b: 0.283099 },
  { t: 145 / 255, r: 0.827372, g: 0.279517, b: 0.261750 },
  { t: 150 / 255, r: 0.851384, g: 0.302260, b: 0.239636 },
  { t: 155 / 255, r: 0.873741, g: 0.326906, b: 0.216886 },
  { t: 160 / 255, r: 0.894305, g: 0.353399, b: 0.193584 },
  { t: 165 / 255, r: 0.912966, g: 0.381636, b: 0.169755 },
  { t: 170 / 255, r: 0.929644, g: 0.411479, b: 0.145367 },
  { t: 175 / 255, r: 0.944285, g: 0.442772, b: 0.120354 },
  { t: 180 / 255, r: 0.956852, g: 0.475356, b: 0.094695 },
  { t: 185 / 255, r: 0.967322, g: 0.509078, b: 0.068659 },
  { t: 190 / 255, r: 0.975677, g: 0.543798, b: 0.043618 },
  { t: 195 / 255, r: 0.981895, g: 0.579392, b: 0.026250 },
  { t: 200 / 255, r: 0.985952, g: 0.615750, b: 0.025592 },
  { t: 205 / 255, r: 0.987819, g: 0.652773, b: 0.045581 },
  { t: 210 / 255, r: 0.987464, g: 0.690366, b: 0.079990 },
  { t: 215 / 255, r: 0.984865, g: 0.728427, b: 0.120785 },
  { t: 220 / 255, r: 0.980032, g: 0.766837, b: 0.166353 },
  { t: 225 / 255, r: 0.973088, g: 0.805409, b: 0.216877 },
  { t: 230 / 255, r: 0.964394, g: 0.843848, b: 0.273391 },
  { t: 235 / 255, r: 0.954997, g: 0.881569, b: 0.337475 },
  { t: 240 / 255, r: 0.947594, g: 0.917399, b: 0.410665 },
  { t: 245 / 255, r: 0.947937, g: 0.949318, b: 0.491426 },
  { t: 250 / 255, r: 0.961812, g: 0.975924, b: 0.571925 },
  { t: 255 / 255, r: 0.988362, g: 0.998364, b: 0.644924 }
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
