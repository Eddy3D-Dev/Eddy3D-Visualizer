import { describe, it, expect } from 'vitest';
import {
  buildVelocityGrid,
  sampleVelocity,
  advectParticles,
  createParticleState,
  datasetHasVectors,
  type VelocityGrid,
} from './particles';
import type { SensorDataPoint } from './csv-loader';

// ── fixtures ─────────────────────────────────────────────────────────────────

/** Regular nx x ny grid of points spaced `step` apart with uniform wind (u, v). */
function uniformField(
  nx: number,
  ny: number,
  step: number,
  u: number,
  v: number,
  z = 1.5
): SensorDataPoint[] {
  const pts: SensorDataPoint[] = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const speed = Math.hypot(u, v);
      pts.push({ x: ix * step, y: iy * step, z, val: speed, h: 0, u, v, w: 0 });
    }
  }
  return pts;
}

/** Deterministic rng for reproducible respawn positions. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── datasetHasVectors ────────────────────────────────────────────────────────

describe('datasetHasVectors', () => {
  it('is false for legacy scalar-only datasets', () => {
    const pts: SensorDataPoint[] = [{ x: 0, y: 0, z: 1.5, val: 3, h: 0 }];
    expect(datasetHasVectors(pts)).toBe(false);
  });

  it('is false when every vector is zero (still air is not a flow field)', () => {
    expect(datasetHasVectors(uniformField(3, 3, 2, 0, 0))).toBe(false);
  });

  it('is true when any point carries a nonzero component', () => {
    expect(datasetHasVectors(uniformField(3, 3, 2, 1.5, 0))).toBe(true);
  });
});

// ── buildVelocityGrid ────────────────────────────────────────────────────────

describe('buildVelocityGrid', () => {
  it('bins a regular field into one fluid cell per point', () => {
    const grid = buildVelocityGrid(uniformField(5, 4, 2, 2, -1), 2)!;
    expect(grid).not.toBeNull();
    expect(grid.nx).toBe(5);
    expect(grid.ny).toBe(4);
    expect(grid.fluidCells.length).toBe(20);
    expect(grid.maxSpeed).toBeCloseTo(Math.hypot(2, 1), 5);
    // Every cell carries the uniform velocity.
    for (const c of grid.fluidCells) {
      expect(grid.u[c]).toBeCloseTo(2, 5);
      expect(grid.v[c]).toBeCloseTo(-1, 5);
    }
  });

  it('masks building cells (h > 0) so particles die there', () => {
    const pts = uniformField(5, 5, 2, 3, 0);
    // Turn the center point into a building marker.
    const center = pts.find((p) => p.x === 4 && p.y === 4)!;
    center.h = 12;
    const grid = buildVelocityGrid(pts, 2)!;
    const c = 2 * grid.nx + 2;
    expect(grid.mask[c]).toBe(0);
    expect(grid.fluidCells.length).toBe(24);
  });

  it('returns null for scalar-only or degenerate data', () => {
    expect(buildVelocityGrid([{ x: 0, y: 0, z: 1.5, val: 1, h: 0 }], 2)).toBeNull();
    expect(buildVelocityGrid(uniformField(5, 5, 2, 1, 0), 0)).toBeNull();
    expect(buildVelocityGrid([], 2)).toBeNull();
  });
});

// ── sampleVelocity ───────────────────────────────────────────────────────────

describe('sampleVelocity', () => {
  const grid = buildVelocityGrid(uniformField(6, 6, 2, 2.5, 1.5), 2)!;

  it('reproduces the uniform field anywhere inside it', () => {
    const out = { u: 0, v: 0 };
    expect(sampleVelocity(grid, 3.7, 5.1, out)).toBe(true);
    expect(out.u).toBeCloseTo(2.5, 5);
    expect(out.v).toBeCloseTo(1.5, 5);
  });

  it('reports departure outside the grid', () => {
    const out = { u: 0, v: 0 };
    expect(sampleVelocity(grid, -50, 0, out)).toBe(false);
    expect(sampleVelocity(grid, 0, 500, out)).toBe(false);
  });

  it('interpolates a gradient linearly between cell centers', () => {
    // u ramps 0..5 across x; at x halfway between two columns the sample is the mean.
    const pts: SensorDataPoint[] = [];
    for (let iy = 0; iy < 4; iy++)
      for (let ix = 0; ix < 6; ix++)
        pts.push({ x: ix * 2, y: iy * 2, z: 1.5, val: ix, h: 0, u: ix, v: 0, w: 0 });
    const ramp = buildVelocityGrid(pts, 2)!;
    const out = { u: 0, v: 0 };
    expect(sampleVelocity(ramp, 5, 3, out)).toBe(true); // between columns 2 and 3
    expect(out.u).toBeCloseTo(2.5, 5);
  });
});

// ── advectParticles ──────────────────────────────────────────────────────────

describe('advectParticles', () => {
  function spawnAll(grid: VelocityGrid, count: number, rngSeed = 7) {
    const state = createParticleState(count);
    const rng = seededRng(rngSeed);
    // Force a respawn of every particle through an expired life.
    state.life.fill(-1);
    advectParticles(state, grid, 0.001, 1, rng);
    return state;
  }

  it('moves every particle along the uniform wind', () => {
    const grid = buildVelocityGrid(uniformField(10, 10, 2, 2, 0), 2)!;
    const state = spawnAll(grid, 50);
    const before = state.positions.slice();

    advectParticles(state, grid, 0.5, 1, seededRng(1));

    let moved = 0;
    for (let i = 0; i < 50; i++) {
      const dx = state.positions[i * 3] - before[i * 3];
      const dy = state.positions[i * 3 + 1] - before[i * 3 + 1];
      if (dx > 0) moved++;
      // Uniform +x wind: y never changes for a surviving particle.
      if (Math.abs(dy) > 1e-9) {
        expect(state.speed[i]).toBe(0); // only a respawned particle may jump in y
      }
    }
    // The overwhelming majority took the +x step of u*dt = 1 model unit.
    expect(moved).toBeGreaterThan(40);
  });

  it('previous positions trail current ones by exactly one step', () => {
    const grid = buildVelocityGrid(uniformField(10, 10, 2, 3, 0), 2)!;
    const state = spawnAll(grid, 20);
    advectParticles(state, grid, 0.25, 2, seededRng(2));
    for (let i = 0; i < 20; i++) {
      if (state.speed[i] === 0) continue; // respawned this step
      const dx = state.positions[i * 3] - state.previous[i * 3];
      expect(dx).toBeCloseTo(3 * 0.25 * 2, 5);
    }
  });

  it('respawns particles that blow out of the field instead of losing them', () => {
    const grid = buildVelocityGrid(uniformField(4, 4, 2, 100, 0), 2)!; // hurricane
    const state = spawnAll(grid, 30);
    // One long step carries everything far past the 6-unit-wide domain...
    advectParticles(state, grid, 1, 1, seededRng(3));
    // ...so the next step must find every particle back inside the grid.
    advectParticles(state, grid, 0.001, 1, seededRng(4));
    for (let i = 0; i < 30; i++) {
      const x = state.positions[i * 3];
      const y = state.positions[i * 3 + 1];
      expect(x).toBeGreaterThan(grid.originX - grid.step);
      expect(x).toBeLessThan(grid.originX + grid.nx * grid.step);
      expect(y).toBeGreaterThan(grid.originY - grid.step);
      expect(y).toBeLessThan(grid.originY + grid.ny * grid.step);
    }
  });

  it('ages particles out on schedule', () => {
    const grid = buildVelocityGrid(uniformField(6, 6, 2, 1, 0), 2)!;
    const state = spawnAll(grid, 10);
    const lifeBefore = state.life.slice();
    advectParticles(state, grid, 0.25, 1, seededRng(5));
    for (let i = 0; i < 10; i++) {
      if (state.speed[i] === 0) continue; // respawned
      expect(state.life[i]).toBeCloseTo(lifeBefore[i] - 0.25, 5);
    }
  });
});
