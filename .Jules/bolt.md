## 2024-05-22 - [Object Allocation in Render Loops]
**Learning:** The codebase heavily relied on creating new `THREE.Color` objects inside high-frequency loops (e.g., `renderDataset`), leading to significant GC pressure.
**Action:** Always use "scratch" objects and pass them as `target` parameters to utility functions like `getColormapColor` to reuse memory.
