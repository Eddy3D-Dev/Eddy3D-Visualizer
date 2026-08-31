// GPU particle advection — the same animation as particles.ts, with the integration
// running in a fragment shader over a ping-ponged position texture instead of in JS.
//
// Why GPGPU-on-WebGL2 rather than WebGPURenderer: the whole scene (sensor cloud,
// instanced building voxels, edges, OrbitControls, and the screenshot path that reads
// the canvas back) is built on THREE.WebGLRenderer. Swapping renderers to get compute
// shaders would port all of that and drop every browser without WebGPU, to accelerate
// one overlay. GPUComputationRenderer needs no renderer change, runs wherever WebGL2
// float render targets exist (i.e. essentially everywhere the app already runs), and
// leaves the CPU backend in place as the fallback when they do not.
//
// The velocity field, the spawn table and the particle count all come from the SAME
// pure functions the CPU backend uses (packVelocityField / packSpawnTable /
// particleTextureSize in particles.ts), so the two backends are one animation at two
// costs rather than two different pictures.

import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import {
  GPU_PARTICLE_CAP,
  packSpawnTable,
  packVelocityField,
  particleReferences,
  particleTextureSize,
  type ParticleFlow,
  type VelocityGrid,
} from './particles';

/**
 * Mask-weighted bilinear sampling of the velocity field, shared verbatim by the compute
 * shader and the trail vertex shader. This is the GLSL twin of `sampleVelocity` in
 * particles.ts, down to the 0.35 support threshold — below it the particle is over a
 * building or a hole and must die rather than skate along the mask edge.
 */
const FIELD_SAMPLER_GLSL = /* glsl */ `
uniform sampler2D uField;
uniform vec2 uFieldSize;
uniform vec2 uOrigin;
uniform float uStep;

bool eddy3dSampleField(vec2 world, out vec2 vel) {
  // Written FIRST, not just on the success path. An 'out' parameter is not copied in on
  // entry and IS copied out on return (GLSL ES 3.00 6.1.1), so returning false without
  // assigning it overwrites the caller's own initializer with an undefined temp — the
  // 'vec2 vel = vec2(0.0)' at the call site reads like a fallback but is destroyed.
  // Measured: a caller's (777, -777) sentinel came back as (0, 0) on ANGLE/Metal, i.e.
  // the zero came from the driver, not from the code.
  vel = vec2(0.0);
  vec2 f = (world - uOrigin) / uStep;
  vec2 i0 = floor(f);
  vec2 t = f - i0;
  float wSum = 0.0;
  vec2 acc = vec2(0.0);
  for (int dy = 0; dy <= 1; dy++) {
    for (int dx = 0; dx <= 1; dx++) {
      vec2 c = i0 + vec2(float(dx), float(dy));
      if (c.x < 0.0 || c.y < 0.0 || c.x > uFieldSize.x - 1.0 || c.y > uFieldSize.y - 1.0) continue;
      vec4 texel = texture2D(uField, (c + 0.5) / uFieldSize);
      if (texel.b < 0.5) continue;
      float w = (dx == 1 ? t.x : 1.0 - t.x) * (dy == 1 ? t.y : 1.0 - t.y);
      wSum += w;
      acc += texel.rg * w;
    }
  }
  if (wSum < 0.35) return false;
  vel = acc / wSum;
  return true;
}
`;

/** RGBA of the position texture: xy = world position, z = life left (s), w = local speed. */
const POSITION_SHADER = /* glsl */ `
uniform sampler2D uSpawn;
uniform vec2 uSpawnSize;
uniform float uSpawnCount;
uniform float uDt;
uniform float uSpeedFactor;
uniform float uSeed;

${FIELD_SAMPLER_GLSL}

// The dot product is range-reduced BEFORE sin(). Without the mod, uSeed drives the
// argument to ~2.2e6, where float32 spacing plus the driver's own range reduction
// quantize sin() to a handful of outputs: measured on ANGLE/Metal at the shipped density,
// distinct hash values across the texture fell 878 -> 215 -> 33 -> 17 over frames
// 1/600/3600/8191, and since the spawn cell, the jitter and the lifetime are all this
// hash with constant offsets, particles respawned superimposed, in lockstep, on 17
// positions — exactly the clumping the respawn exists to avoid. With the reduction the
// count is flat at ~2100 regardless of frame. Same fix three's own common-chunk rand()
// uses.
float eddy3dHash(vec2 p) {
  highp float d = mod(dot(p, vec2(127.1, 311.7)), 3.14159265);
  return fract(sin(d) * 43758.5453123);
}

// One random fluid cell, jittered inside it — the GPU twin of the CPU respawn's
// uniform draw over grid.fluidCells.
vec2 eddy3dRespawn(vec2 seed) {
  float idx = floor(eddy3dHash(seed) * uSpawnCount);
  idx = min(idx, uSpawnCount - 1.0);
  float sx = mod(idx, uSpawnSize.x);
  float sy = floor(idx / uSpawnSize.x);
  vec2 base = texture2D(uSpawn, (vec2(sx, sy) + 0.5) / uSpawnSize).xy;
  vec2 jitter = vec2(eddy3dHash(seed + 3.7), eddy3dHash(seed + 11.3)) - 0.5;
  return base + jitter * 0.9 * uStep;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec2 pos = p.xy;
  float life = p.z - uDt;

  vec2 vel = vec2(0.0);
  bool inField = eddy3dSampleField(pos, vel);

  if (life <= 0.0 || !inField) {
    vec2 seed = uv * 137.0 + uSeed;
    pos = eddy3dRespawn(seed);
    life = 1.5 + eddy3dHash(seed + 17.0) * 4.5;
    eddy3dSampleField(pos, vel);
    gl_FragColor = vec4(pos, life, length(vel));
    return;
  }

  pos += vel * uDt * uSpeedFactor;
  gl_FragColor = vec4(pos, life, length(vel));
}
`;

const HEAD_VERTEX = /* glsl */ `
#include <common>
uniform sampler2D uPositions;
uniform float uZ;
uniform float uSize;
uniform float uScale;
uniform float uPixelRatio;
attribute vec2 reference;

void main() {
  vec4 p = texture2D(uPositions, reference);
  vec4 mv = modelViewMatrix * vec4(p.x, p.y, uZ, 1.0);
  // Exactly THREE.PointsMaterial's own arithmetic: size * pixelRatio, then the
  // attenuation only under a perspective camera (three's 'scale' uniform is HALF THE CSS
  // HEIGHT, not half the drawing buffer). Folding the ratio into uScale instead would
  // agree under perspective and draw devicePixelRatio times too small in this app's
  // orthographic 2D mode, where the attenuation term never runs.
  gl_PointSize = uSize * uPixelRatio;
  if (isPerspectiveMatrix(projectionMatrix)) gl_PointSize *= uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const HEAD_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;

void main() {
  gl_FragColor = vec4(uColor, uOpacity);
}
`;

/**
 * Trails as streaklets: the tail is where the particle WAS `uTrailSeconds` ago under the
 * steady field, reconstructed from the local velocity rather than stored. That costs one
 * extra field sample and buys the property a stored previous position cannot have — a
 * particle that respawned this frame draws a correct short tail instead of a line
 * spanning the whole domain from its old home to its new one.
 */
const TRAIL_VERTEX = /* glsl */ `
#include <common>
uniform sampler2D uPositions;
uniform float uZ;
uniform float uTrailSeconds;
uniform float uSpeedFactor;
attribute vec2 reference;
attribute float side;
varying float vFade;

${FIELD_SAMPLER_GLSL}

void main() {
  vec4 p = texture2D(uPositions, reference);
  vec2 pos = p.xy;
  vec2 vel = vec2(0.0);
  eddy3dSampleField(pos, vel);
  vec2 world = pos - vel * uTrailSeconds * uSpeedFactor * side;
  vFade = 1.0 - side;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world.x, world.y, uZ, 1.0);
}
`;

const TRAIL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;

void main() {
  gl_FragColor = vec4(uColor, uOpacity * vFade);
}
`;

/** A float DataTexture that is read by exact texel, so it never needs float-linear filtering. */
function dataTexture(packed: { data: Float32Array; width: number; height: number }): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    packed.data,
    packed.width,
    packed.height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The GPU backend, or null when this device cannot ping-pong float render targets (no
 * EXT_color_buffer_float) — the caller then falls back to the CPU backend. Never throws
 * on an unsupported device, and never silently pretends: the returned flow reports
 * `backend === 'gpu'`, and nothing else in the app does.
 */
export function createGpuParticleFlow(
  grid: VelocityGrid,
  renderer: THREE.WebGLRenderer
): ParticleFlow | null {
  // Four particles per fluid cell: the integration is free here, and this density is
  // what separates "wind flowing" from "speckle drifting".
  const size = particleTextureSize(grid.fluidCells.length * 4, GPU_PARTICLE_CAP);
  const count = size * size;

  // GPUComputationRenderer.init() checks ONLY `maxVertexTextures === 0` in r182 — it does
  // NOT verify float render targets, so relying on its error return to detect an
  // unsupported device gives a fallback that can never fire. Ask the extension directly.
  // Half-float is not an option here: these texels hold world coordinates, and a 10-bit
  // mantissa quantizes a kilometre-wide site into visible stair-steps.
  if (!renderer.extensions.has('EXT_color_buffer_float')) return null;
  if (renderer.capabilities.maxVertexTextures === 0) return null;

  const compute = new GPUComputationRenderer(size, size, renderer);
  compute.setDataType(THREE.FloatType); // world coordinates need more than half-float

  const spawn = packSpawnTable(grid);
  const field = packVelocityField(grid);

  // Seed the first frame from the same spawn table the shader respawns from, with
  // staggered ages so the population does not blink out in lockstep waves.
  const initial = compute.createTexture();
  const seed = initial.image.data as Float32Array;
  for (let i = 0; i < count; i++) {
    const s = Math.min(grid.fluidCells.length - 1, (Math.random() * grid.fluidCells.length) | 0);
    const o = i * 4;
    seed[o] = spawn.data[s * 4] + (Math.random() - 0.5) * 0.9 * grid.step;
    seed[o + 1] = spawn.data[s * 4 + 1] + (Math.random() - 0.5) * 0.9 * grid.step;
    seed[o + 2] = (1.5 + Math.random() * 4.5) * Math.random();
    seed[o + 3] = 0;
  }

  const fieldTex = dataTexture(field);
  const spawnTex = dataTexture(spawn);

  const variable = compute.addVariable('texturePosition', POSITION_SHADER, initial);
  compute.setVariableDependencies(variable, [variable]);
  const cu = variable.material.uniforms as Record<string, THREE.IUniform>;
  cu.uField = { value: fieldTex };
  cu.uFieldSize = { value: new THREE.Vector2(field.width, field.height) };
  cu.uOrigin = { value: new THREE.Vector2(grid.originX, grid.originY) };
  cu.uStep = { value: grid.step };
  cu.uSpawn = { value: spawnTex };
  cu.uSpawnSize = { value: new THREE.Vector2(spawn.width, spawn.height) };
  cu.uSpawnCount = { value: grid.fluidCells.length };
  cu.uDt = { value: 0 };
  cu.uSpeedFactor = { value: 0 };
  cu.uSeed = { value: 0 };

  const error = compute.init();
  if (error !== null) {
    // Unsupported device (or a shader that will not compile here) — hand the caller a
    // null so it falls back, and dispose what was already allocated.
    console.warn('Eddy3D: GPU particles unavailable, falling back to CPU —', error);
    fieldTex.dispose();
    spawnTex.dispose();
    compute.dispose();
    return null;
  }

  // Same pacing as the CPU backend: the fastest particle crosses the field in ~12 s at
  // multiplier 1.
  const extent = Math.max(grid.nx, grid.ny) * grid.step;
  const baseFactor = extent / (12 * Math.max(0.1, grid.maxSpeed));

  // One `reference` per particle: the uv of its texel CENTRE in the position texture.
  const references = particleReferences(size);

  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  headGeo.setAttribute('reference', new THREE.BufferAttribute(references, 2));
  const headMat = new THREE.ShaderMaterial({
    uniforms: {
      uPositions: { value: null },
      uZ: { value: grid.z },
      uSize: { value: grid.step * 0.4 },
      uScale: { value: 300 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.95 },
    },
    vertexShader: HEAD_VERTEX,
    fragmentShader: HEAD_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const heads = new THREE.Points(headGeo, headMat);
  heads.frustumCulled = false; // positions live in a texture; the bounding sphere is meaningless

  // Two vertices per particle: side 0 = head, side 1 = tail.
  const trailRefs = new Float32Array(count * 4);
  const sides = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    trailRefs[i * 4] = references[i * 2];
    trailRefs[i * 4 + 1] = references[i * 2 + 1];
    trailRefs[i * 4 + 2] = references[i * 2];
    trailRefs[i * 4 + 3] = references[i * 2 + 1];
    sides[i * 2] = 0;
    sides[i * 2 + 1] = 1;
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
  trailGeo.setAttribute('reference', new THREE.BufferAttribute(trailRefs, 2));
  trailGeo.setAttribute('side', new THREE.BufferAttribute(sides, 1));
  const trailMat = new THREE.ShaderMaterial({
    uniforms: {
      uPositions: { value: null },
      uField: { value: fieldTex },
      uFieldSize: { value: new THREE.Vector2(field.width, field.height) },
      uOrigin: { value: new THREE.Vector2(grid.originX, grid.originY) },
      uStep: { value: grid.step },
      uZ: { value: grid.z },
      uTrailSeconds: { value: 0.3 },
      uSpeedFactor: { value: baseFactor },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.55 },
    },
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const trails = new THREE.LineSegments(trailGeo, trailMat);
  trails.frustumCulled = false;

  const group = new THREE.Group();
  group.add(trails);
  group.add(heads);

  let frame = 0;
  const _size = new THREE.Vector2();

  return {
    object: group,
    particleCount: count,
    backend: 'gpu',
    step(dt: number, speedMultiplier: number): void {
      // Clamp: a backgrounded tab hands back multi-second deltas that would teleport
      // every particle straight through the mask in one step.
      const clamped = Math.min(dt, 0.1);
      const factor = baseFactor * speedMultiplier;
      cu.uDt.value = clamped;
      cu.uSpeedFactor.value = factor;
      cu.uSeed.value = (frame = (frame + 1) % 8192) * 0.6180339887;
      compute.compute();

      const positions = compute.getCurrentRenderTarget(variable).texture;
      headMat.uniforms.uPositions.value = positions;
      trailMat.uniforms.uPositions.value = positions;
      trailMat.uniforms.uSpeedFactor.value = factor;
      // three sizes attenuated points against half the CSS height (not the drawing
      // buffer), with the pixel ratio applied separately. Read both every step so a
      // resized window or a move to a different-DPI display keeps the apparent size.
      renderer.getSize(_size);
      headMat.uniforms.uScale.value = _size.y * 0.5;
      headMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    },
    dispose(): void {
      compute.dispose();
      fieldTex.dispose();
      spawnTex.dispose();
      headGeo.dispose();
      trailGeo.dispose();
      headMat.dispose();
      trailMat.dispose();
    },
  };
}
