## 2024-05-22 - [Object Allocation in Render Loops]
**Learning:** The codebase heavily relied on creating new `THREE.Color` objects inside high-frequency loops (e.g., `renderDataset`), leading to significant GC pressure.
**Action:** Always use "scratch" objects and pass them as `target` parameters to utility functions like `getColormapColor` to reuse memory.

## 2024-05-23 - [String Allocations in Spatial Lookups]
**Learning:** Using `Map<string, T>` with composite string keys (e.g., `${x},${y}`) for spatial lookups creates massive GC pressure and slows down large dataset processing by 3x-10x compared to nested Maps `Map<number, Map<number, T>>`.
**Action:** For 2D/3D grid lookups, prefer nested Maps or flattened TypedArrays over string-based hash maps.

## 2024-05-24 - [Lookup Table Overhead in Tight Loops]
**Learning:** In extremely hot loops (like per-vertex color calculation), the overhead of `Map.get(key)` can negate the benefits of a precomputed LUT if the computation itself was relatively fast (e.g. polynomial). However, caching the last used LUT reference avoids the `Map.get` cost and restores the performance gain.
**Action:** When using LUTs in tight loops where the key rarely changes (e.g. `mapName` constant for 1M points), always implement a "last used" cache or pass the LUT directly instead of looking it up every iteration.

## 2025-02-14 - [InstancedMesh Batch Array Mutations]
**Learning:** For rendering very large datasets (e.g. 1M+ point clouds or voxels), updating Three.js `InstancedMesh` via `.setMatrixAt()` and `.setColorAt()` combined with `Object3D.updateMatrix()` causes severe frame drops and massive allocations due to object and matrix instantiation per point.
**Action:** To optimize `InstancedMesh` setup, calculate transformations directly and assign them to 16-element blocks on the `instanceMatrix.array` (Float32Array) and `instanceColor.array`. Remember to apply correct color space conversions when assigning to `instanceColor.array` by using a shared `Color` scratch object's `setRGB` before pulling `.r`/`.g`/`.b`.

## 2025-03-01 - [InstancedMesh Batch Array Mutations for Colors]
**Learning:** For rendering very large datasets (e.g. 1M+ point clouds or voxels), updating Three.js `InstancedMesh` via `.setColorAt()` combined with `Object3D.updateMatrix()` inside a tight loop creates massive overhead.
**Action:** Extract `fixedSensorPoints.instanceColor.array` outside the loop, and inside the loop, directly assign `.r`, `.g`, `.b` components into the array.

## 2025-03-02 - [Redundant Color Conversions in Rendering Loops]
**Learning:** Three.js `.setRGB(r, g, b)` inherently assumes sRGB input and converts it to linear space. When assigning colors from colormaps in tight loops (like `renderDataset` or `updateSensorColors`), the `colorScratch` already contains linear values. Repeatedly passing these back through `.setRGB` on another color object causes a redundant double conversion, breaking color accuracy and creating unnecessary performance overhead (e.g., adding ~20-30ms per 1M points).
**Action:** When working with colors that have already been converted by Three.js (like `colorScratch.r/g/b`), assign them directly to arrays (`colors` or `instanceColor.array`) without passing them through `.setRGB` again.

## 2024-05-30 - Refactor hot rendering loops to eliminate THREE.Color intermediate scratch objects
**Learning:** While reusing "scratch" objects (like `THREE.Color()`) is typically a recommended pattern over instantiating new objects in hot paths, it is still an abstraction that introduces overhead. When doing tight loops over large datasets (100k+ points), the CPU overhead from multiple function calls (`setRGB()`, object property access) limits performance compared to working strictly with typed arrays (`Float32Array`).
**Action:** When updating massive typed array attributes (like `colors` or `instanceColor.array`), directly look up values from flat Float32Array LUTs instead of reading and writing via an intermediate object. In this project, bypassing `THREE.Color` in `renderDataset` and `updateSensorColors` sped up color processing by ~8x. Also, always ensure `LUT_SIZE` is exported and referenced to prevent silent logic errors.
