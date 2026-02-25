## 2024-05-22 - [Object Allocation in Render Loops]
**Learning:** The codebase heavily relied on creating new `THREE.Color` objects inside high-frequency loops (e.g., `renderDataset`), leading to significant GC pressure.
**Action:** Always use "scratch" objects and pass them as `target` parameters to utility functions like `getColormapColor` to reuse memory.

## 2024-05-23 - [String Allocations in Spatial Lookups]
**Learning:** Using `Map<string, T>` with composite string keys (e.g., `${x},${y}`) for spatial lookups creates massive GC pressure and slows down large dataset processing by 3x-10x compared to nested Maps `Map<number, Map<number, T>>`.
**Action:** For 2D/3D grid lookups, prefer nested Maps or flattened TypedArrays over string-based hash maps.
