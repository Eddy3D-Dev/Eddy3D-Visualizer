import { describe, it, expect } from 'vitest';
import {
  buildVelocityGrid,
  sampleVelocity,
  advectParticles,
  createParticleState,
  datasetHasVectors,
  packVelocityField,
  packSpawnTable,
  particleTextureSize,
  particleReferences,
  CPU_PARTICLE_CAP,
  GPU_PARTICLE_CAP,
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

// ── GPU packing (the data the GPGPU backend uploads) ─────────────────────────

describe('packVelocityField', () => {
  it('lays texel (ix, iy) out as cell iy*nx+ix, carrying u, v and the mask', () => {
    const pts = uniformField(4, 3, 2, 1.5, -0.5);
    pts.find((p) => p.x === 2 && p.y === 2)!.h = 10; // one building cell
    const grid = buildVelocityGrid(pts, 2)!;
    const tex = packVelocityField(grid);

    expect(tex.width).toBe(grid.nx);
    expect(tex.height).toBe(grid.ny);
    expect(tex.data.length).toBe(grid.nx * grid.ny * 4);

    const fluid = 0 * 4; // cell (0,0)
    expect(tex.data[fluid]).toBeCloseTo(1.5, 5);
    expect(tex.data[fluid + 1]).toBeCloseTo(-0.5, 5);
    expect(tex.data[fluid + 2]).toBe(1);

    const blockedCell = 1 * grid.nx + 1;
    expect(grid.mask[blockedCell]).toBe(0);
    const blocked = blockedCell * 4;
    expect(tex.data[blocked + 2]).toBe(0);
    // A blocked texel must carry ZERO velocity, not stale binned values: the shader
    // weights by the mask, and a nonzero u behind a 0 mask is a trap for any future
    // change that forgets the weighting.
    expect(tex.data[blocked]).toBe(0);
    expect(tex.data[blocked + 1]).toBe(0);
  });
});

describe('packSpawnTable', () => {
  it('holds the world centre of every fluid cell', () => {
    const grid = buildVelocityGrid(uniformField(4, 4, 2, 1, 0), 2)!;
    const tab = packSpawnTable(grid);
    expect(tab.width * tab.height).toBeGreaterThanOrEqual(grid.fluidCells.length);

    // Every entry must land on a fluid cell of the grid.
    for (let i = 0; i < grid.fluidCells.length; i++) {
      const x = tab.data[i * 4];
      const y = tab.data[i * 4 + 1];
      const ix = Math.round((x - grid.originX) / grid.step);
      const iy = Math.round((y - grid.originY) / grid.step);
      expect(grid.mask[iy * grid.nx + ix]).toBe(1);
    }
  });

  it('pads with a real fluid cell, never with the origin', () => {
    // 3x2 = 6 fluid cells pads to a 3x2 texture with no spare, so block one cell to
    // force padding. The pad must not be (0, 0), which for this offset field is far
    // outside the domain.
    const pts = uniformField(3, 2, 2, 2, 0).map((p) => ({ ...p, x: p.x + 1000, y: p.y + 500 }));
    pts[0].h = 9;
    const grid = buildVelocityGrid(pts, 2)!;
    const tab = packSpawnTable(grid);
    for (let i = 0; i < tab.width * tab.height; i++) {
      expect(tab.data[i * 4]).toBeGreaterThanOrEqual(1000);
      expect(tab.data[i * 4 + 1]).toBeGreaterThanOrEqual(500);
    }
  });
});

describe('particleReferences', () => {
  it('addresses texel CENTRES, never boundaries', () => {
    const size = 4;
    const refs = particleReferences(size);
    expect(refs.length).toBe(size * size * 2);
    // Half-texel in, not on the edge: a uv of exactly 0 or i/size lands on the boundary
    // between texels and resolves to whichever neighbour a given driver rounds toward.
    expect(refs[0]).toBeCloseTo(0.5 / size, 10);
    expect(refs[1]).toBeCloseTo(0.5 / size, 10);
    for (let i = 0; i < size * size; i++) {
      expect(refs[i * 2]).toBeGreaterThan(0);
      expect(refs[i * 2] * size % 1).toBeCloseTo(0.5, 10);
      expect(refs[i * 2 + 1] * size % 1).toBeCloseTo(0.5, 10);
    }
  });

  it('gives every particle a distinct texel', () => {
    const size = 8;
    const refs = particleReferences(size);
    const seen = new Set<string>();
    for (let i = 0; i < size * size; i++) seen.add(`${refs[i * 2]},${refs[i * 2 + 1]}`);
    expect(seen.size).toBe(size * size);
  });
});

describe('particleTextureSize', () => {
  it('is a power of two holding at least the clamped count', () => {
    for (const n of [1, 500, 4096, 20000, 999999]) {
      const s = particleTextureSize(n, GPU_PARTICLE_CAP);
      expect(Math.log2(s) % 1).toBe(0);
      expect(s * s).toBeGreaterThanOrEqual(Math.max(500, Math.min(GPU_PARTICLE_CAP, n)));
    }
  });

  it('never exceeds the cap it was given, and never starves a tiny field', () => {
    expect(particleTextureSize(10_000_000, GPU_PARTICLE_CAP) ** 2).toBeLessThanOrEqual(
      GPU_PARTICLE_CAP
    );
    expect(particleTextureSize(1, GPU_PARTICLE_CAP) ** 2).toBeGreaterThanOrEqual(500);
  });

  it('carries more particles than the CPU backend for the same field', () => {
    // The whole point of the GPU path: the integration is free, so density can track
    // the field several times over instead of stopping at what JS can advect per frame.
    for (const cells of [800, 5000, 40000]) {
      const cpuCount = Math.max(500, Math.min(CPU_PARTICLE_CAP, cells));
      const gpuCount = particleTextureSize(cells * 4, GPU_PARTICLE_CAP) ** 2;
      expect(gpuCount).toBeGreaterThan(cpuCount);
    }
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
