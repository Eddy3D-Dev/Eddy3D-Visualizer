// Particle flow module — animated wind particles advected through the probe grid's
// velocity field (the ArchiWind-style "particles animation").
//
// The simulation core (grid build, bilinear sampling, advection) is pure and
// three.js-free so it can be unit-tested; createParticleFlow wraps it into scene
// objects (points + fading trails) for main.ts.

import * as THREE from 'three';
import type { SensorDataPoint } from './csv-loader';

export interface VelocityGrid {
  originX: number;
  originY: number;
  step: number;
  nx: number;
  ny: number;
  /** Height at which particles fly (mean sample z plus a small lift). */
  z: number;
  /** Cell-averaged velocity components, row-major [iy * nx + ix]. */
  u: Float32Array;
  v: Float32Array;
  /** 1 = fluid (has data, not inside a building footprint), 0 = blocked/empty. */
  mask: Uint8Array;
  /** Max in-plane speed over fluid cells (m/s); 0 when the field is entirely calm. */
  maxSpeed: number;
  /** Flat indices of fluid cells, for uniform respawn. */
  fluidCells: Int32Array;
}

/** An RGBA float texture's payload plus its dimensions, ready for THREE.DataTexture. */
export interface PackedTexture {
  data: Float32Array;
  width: number;
  height: number;
}

/**
 * The velocity grid as one RGBA float texel per cell — R = u, G = v, B = mask (1 fluid,
 * 0 blocked), A = 0 — laid out so texel (ix, iy) is cell `iy * nx + ix`, i.e. the same
 * indexing {@link sampleVelocity} uses. The GPU backend does its own mask-weighted
 * bilinear read of this, so the texture is sampled with NearestFilter and never needs
 * float-linear filtering support.
 */
export function packVelocityField(grid: VelocityGrid): PackedTexture {
  const data = new Float32Array(grid.nx * grid.ny * 4);
  for (let c = 0; c < grid.nx * grid.ny; c++) {
    const o = c * 4;
    const fluid = grid.mask[c] === 1;
    data[o] = fluid ? grid.u[c] : 0;
    data[o + 1] = fluid ? grid.v[c] : 0;
    data[o + 2] = fluid ? 1 : 0;
    data[o + 3] = 0;
  }
  return { data, width: grid.nx, height: grid.ny };
}

/**
 * The world-space centre of every fluid cell, as an RGBA float texture (R = x, G = y),
 * so the GPU can respawn a particle by drawing one random index — the same uniform draw
 * over `fluidCells` that the CPU backend's respawn does. Padding texels repeat the last
 * fluid cell rather than sitting at (0, 0), which would be a spawn point outside the
 * field for any grid whose origin is not the model origin.
 */
export function packSpawnTable(grid: VelocityGrid): PackedTexture {
  const n = grid.fluidCells.length;
  const width = Math.max(1, Math.ceil(Math.sqrt(n)));
  const height = Math.max(1, Math.ceil(n / width));
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const c = grid.fluidCells[Math.min(i, n - 1)];
    const ix = c % grid.nx;
    const iy = (c / grid.nx) | 0;
    const o = i * 4;
    data[o] = grid.originX + ix * grid.step;
    data[o + 1] = grid.originY + iy * grid.step;
    data[o + 2] = 0;
    data[o + 3] = 0;
  }
  return { data, width, height };
}

/**
 * Particle budget for the CPU backend: about one per fluid cell, never so few that the
 * field looks empty nor so many that per-frame JS advection and buffer writes stall the
 * canvas.
 */
export const CPU_PARTICLE_CAP = 20000;

/**
 * The GPU backend integrates in a fragment shader and writes nothing per particle from
 * JS, so its ceiling is texture size rather than frame time — it carries several
 * particles per cell, which is what makes the flow read as flow instead of as speckle.
 */
export const GPU_PARTICLE_CAP = 65536;

/**
 * Square power-of-two side length holding at least `count` particles, clamped into
 * [500, max]. Only the GPU backend needs this (its particle count IS a texture); the
 * CPU backend counts particles directly, so `max` is always passed explicitly rather
 * than defaulted to one backend's ceiling.
 */
export function particleTextureSize(count: number, max: number): number {
  const clamped = Math.max(500, Math.min(max, count | 0));
  let size = 1;
  while (size * size < clamped) size *= 2;
  return size;
}

/**
 * One uv per particle, addressing the CENTRE of its texel in a size×size position
 * texture. The half-texel offset is the whole content of this function: uvs on the texel
 * boundary resolve to whichever neighbour the driver rounds toward, so a shader that
 * looks correct on one GPU reads a different particle's position on another.
 */
export function particleReferences(size: number): Float32Array {
  const refs = new Float32Array(size * size * 2);
  for (let i = 0; i < size * size; i++) {
    refs[i * 2] = ((i % size) + 0.5) / size;
    refs[i * 2 + 1] = (((i / size) | 0) + 0.5) / size;
  }
  return refs;
}

/** True when any point in the dataset carries a usable in-plane velocity vector. */
export function datasetHasVectors(data: SensorDataPoint[]): boolean {
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if ((d.u !== undefined && d.u !== 0) || (d.v !== undefined && d.v !== 0)) return true;
  }
  return false;
}

/**
 * Bins the scattered probe points into a regular XY grid of cell-averaged (u, v).
 * Cells without samples, and cells whose samples sit inside a building footprint
 * (h > 0), are masked out — particles entering them die and respawn.
 * Returns null when the data cannot produce a usable field (no vectors, or a
 * degenerate extent).
 */
export function buildVelocityGrid(data: SensorDataPoint[], step: number): VelocityGrid | null {
  if (!data.length || !(step > 0) || !datasetHasVectors(data)) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let zSum = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.y < minY) minY = d.y;
    if (d.y > maxY) maxY = d.y;
    zSum += d.z;
  }
  const nx = Math.max(1, Math.round((maxX - minX) / step) + 1);
  const ny = Math.max(1, Math.round((maxY - minY) / step) + 1);
  if (nx < 2 || ny < 2 || nx * ny > 4_000_000) return null;

  const cells = nx * ny;
  const u = new Float32Array(cells);
  const v = new Float32Array(cells);
  const count = new Uint16Array(cells);
  const blocked = new Uint8Array(cells);

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const ix = Math.round((d.x - minX) / step);
    const iy = Math.round((d.y - minY) / step);
    if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;
    const c = iy * nx + ix;
    if (d.h > 0) {
      blocked[c] = 1;
      continue;
    }
    u[c] += d.u ?? 0;
    v[c] += d.v ?? 0;
    count[c]++;
  }

  const mask = new Uint8Array(cells);
  let maxSpeed = 0;
  let fluidCount = 0;
  for (let c = 0; c < cells; c++) {
    if (blocked[c] || count[c] === 0) continue;
    u[c] /= count[c];
    v[c] /= count[c];
    mask[c] = 1;
    fluidCount++;
    const s = Math.hypot(u[c], v[c]);
    if (s > maxSpeed) maxSpeed = s;
  }
  if (fluidCount === 0 || maxSpeed === 0) return null;

  const fluidCells = new Int32Array(fluidCount);
  for (let c = 0, n = 0; c < cells; c++) if (mask[c]) fluidCells[n++] = c;

  return {
    originX: minX,
    originY: minY,
    step,
    nx,
    ny,
    z: zSum / data.length + step * 0.15,
    u,
    v,
    mask,
    maxSpeed,
    fluidCells,
  };
}

/**
 * Bilinear velocity at world (x, y), weighting only fluid cells. Returns false —
 * "particle left the field" — when every surrounding cell is masked or the point
 * is outside the grid.
 */
export function sampleVelocity(
  grid: VelocityGrid,
  x: number,
  y: number,
  out: { u: number; v: number }
): boolean {
  const fx = (x - grid.originX) / grid.step;
  const fy = (y - grid.originY) / grid.step;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  if (ix < -1 || ix >= grid.nx || iy < -1 || iy >= grid.ny) return false;

  const tx = fx - ix;
  const ty = fy - iy;
  let wSum = 0, uSum = 0, vSum = 0;
  for (let dy = 0; dy <= 1; dy++) {
    const cy = iy + dy;
    if (cy < 0 || cy >= grid.ny) continue;
    for (let dx = 0; dx <= 1; dx++) {
      const cx = ix + dx;
      if (cx < 0 || cx >= grid.nx) continue;
      const c = cy * grid.nx + cx;
      if (!grid.mask[c]) continue;
      const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
      wSum += w;
      uSum += grid.u[c] * w;
      vSum += grid.v[c] * w;
    }
  }
  // Under ~35% support the particle is effectively over a building/hole — let it die
  // there instead of skating along masked walls on a sliver of weight.
  if (wSum < 0.35) return false;
  out.u = uSum / wSum;
  out.v = vSum / wSum;
  return true;
}

export interface ParticleState {
  /** World positions, xyz per particle. */
  positions: Float32Array;
  /** Previous positions (the trail's other end). */
  previous: Float32Array;
  /** Remaining lifetime in seconds; respawned when it runs out. */
  life: Float32Array;
  /** Local speed (m/s) at the particle, for coloring. */
  speed: Float32Array;
}

export function createParticleState(countTarget: number): ParticleState {
  return {
    positions: new Float32Array(countTarget * 3),
    previous: new Float32Array(countTarget * 3),
    life: new Float32Array(countTarget),
    speed: new Float32Array(countTarget),
  };
}

function respawn(
  state: ParticleState,
  i: number,
  grid: VelocityGrid,
  rng: () => number
): void {
  const c = grid.fluidCells[Math.min(grid.fluidCells.length - 1, (rng() * grid.fluidCells.length) | 0)];
  const ix = c % grid.nx;
  const iy = (c / grid.nx) | 0;
  const x = grid.originX + (ix + (rng() - 0.5) * 0.9) * grid.step;
  const y = grid.originY + (iy + (rng() - 0.5) * 0.9) * grid.step;
  const i3 = i * 3;
  state.positions[i3] = x;
  state.positions[i3 + 1] = y;
  state.positions[i3 + 2] = grid.z;
  state.previous[i3] = x;
  state.previous[i3 + 1] = y;
  state.previous[i3 + 2] = grid.z;
  state.life[i] = 1.5 + rng() * 4.5;
  state.speed[i] = 0;
}

/**
 * Advances every particle by dt seconds: previous <- current, then one explicit
 * Euler step through the velocity field. speedFactor stretches the motion
 * (1 = real m/s in model units). Particles that age out, leave the field, or
 * enter a masked cell respawn at a random fluid cell. Pure given the rng.
 */
export function advectParticles(
  state: ParticleState,
  grid: VelocityGrid,
  dt: number,
  speedFactor: number,
  rng: () => number = Math.random
): void {
  const n = state.life.length;
  const vel = { u: 0, v: 0 };
  for (let i = 0; i < n; i++) {
    state.life[i] -= dt;
    const i3 = i * 3;
    if (state.life[i] <= 0) {
      respawn(state, i, grid, rng);
      continue;
    }
    const x = state.positions[i3];
    const y = state.positions[i3 + 1];
    if (!sampleVelocity(grid, x, y, vel)) {
      respawn(state, i, grid, rng);
      continue;
    }
    state.previous[i3] = x;
    state.previous[i3 + 1] = y;
    state.previous[i3 + 2] = state.positions[i3 + 2];
    state.positions[i3] = x + vel.u * dt * speedFactor;
    state.positions[i3 + 1] = y + vel.v * dt * speedFactor;
    state.speed[i] = Math.hypot(vel.u, vel.v);
  }
}

export interface ParticleFlow {
  /** Add to the scene; remove + dispose() when the dataset changes. */
  object: THREE.Group;
  /** Advance the animation by dt seconds at the given speed multiplier (1 = default pace). */
  step(dt: number, speedMultiplier: number): void;
  dispose(): void;
  readonly particleCount: number;
  /**
   * Which integrator is actually running. Reported, not inferred: a GPU path that
   * silently falls back to the CPU one looks exactly like a GPU path that works, and
   * the UI and the browser check both assert on this rather than on "it animates".
   */
  readonly backend: 'gpu' | 'cpu';
}

/**
 * The scene-facing particle system: a Points cloud plus one trail segment per
 * particle. Heads are white and trails near-black so the flow reads on top of ANY
 * colormap — coloring the particles by the same LUT as the surface camouflages
 * them perfectly (tried first; invisible by construction).
 */
export function createParticleFlow(grid: VelocityGrid): ParticleFlow {
  // Enough particles to read as flow without dusting over the field; scaled to the
  // fluid area so small studies do not drown and big ones do not starve.
  const count = Math.max(500, Math.min(CPU_PARTICLE_CAP, grid.fluidCells.length | 0));
  const state = createParticleState(count);
  for (let i = 0; i < count; i++) {
    respawn(state, i, grid, Math.random);
    // Stagger initial ages so the population does not respawn in lockstep waves.
    state.life[i] *= Math.random();
  }

  // Real wind takes minutes to cross a kilometre of model; scale so the fastest
  // particle crosses the field in roughly 12 s at multiplier 1.
  const extent = Math.max(grid.nx, grid.ny) * grid.step;
  const baseFactor = extent / (12 * Math.max(0.1, grid.maxSpeed));

  const pointGeo = new THREE.BufferGeometry();
  const pointPos = new THREE.BufferAttribute(state.positions, 3);
  pointPos.setUsage(THREE.DynamicDrawUsage);
  pointGeo.setAttribute('position', pointPos);

  const pointMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: grid.step * 0.4,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(pointGeo, pointMat);
  points.frustumCulled = false;

  // Trails: one segment per particle, previous -> current.
  const trailPositions = new Float32Array(count * 6);
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new THREE.BufferAttribute(trailPositions, 3);
  trailPos.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailPos);
  const trailMat = new THREE.LineBasicMaterial({
    color: 0x10151c,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const trails = new THREE.LineSegments(trailGeo, trailMat);
  trails.frustumCulled = false;

  const group = new THREE.Group();
  group.add(trails);
  group.add(points);

  function syncTrails(): void {
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i6 = i * 6;
      trailPositions[i6] = state.previous[i3];
      trailPositions[i6 + 1] = state.previous[i3 + 1];
      trailPositions[i6 + 2] = state.previous[i3 + 2];
      trailPositions[i6 + 3] = state.positions[i3];
      trailPositions[i6 + 4] = state.positions[i3 + 1];
      trailPositions[i6 + 5] = state.positions[i3 + 2];
    }
  }

  return {
    object: group,
    particleCount: count,
    backend: 'cpu',
    step(dt: number, speedMultiplier: number): void {
      // Clamp: a background tab hands back multi-second deltas that would teleport
      // every particle through the mask in one step.
      const clamped = Math.min(dt, 0.1);
      advectParticles(state, grid, clamped, baseFactor * speedMultiplier);
      syncTrails();
      pointPos.needsUpdate = true;
      trailPos.needsUpdate = true;
    },
    dispose(): void {
      pointGeo.dispose();
      trailGeo.dispose();
      pointMat.dispose();
      trailMat.dispose();
    },
  };
}
