import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1f5f9);

const canvasContainer = document.getElementById('canvas-container') as HTMLElement;
const width = canvasContainer.clientWidth;
const height = canvasContainer.clientHeight;
const aspect = width / height;

// Dual Camera setup
const perspectiveCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 20000);
perspectiveCamera.up.set(0, 0, 1);

const frustumSize = 1000;
const orthographicCamera = new THREE.OrthographicCamera(
  frustumSize * aspect / -2,
  frustumSize * aspect / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  20000
);
orthographicCamera.up.set(0, 0, 1);

let activeCamera: THREE.Camera = orthographicCamera; // Default to Axonometric (Orthographic)

// Turbo Colormap implementation
function getTurboColor(v: number): THREE.Color {
  v = Math.max(0, Math.min(1, v));
  const r = 34.61 + v * (198.21 + v * (-564.48 + v * (3302.08 + v * (-9526.58 + v * (13728.54 + v * (-9312.39 + v * 2399.13))))));
  const g = -1.37 + v * (233.19 + v * (757.44 + v * (-2346.73 + v * (3410.83 + v * (-2368.12 + v * (486.63 + v * 153.22))))));
  const b = 27.2 + v * (370.19 + v * (3167.31 + v * (-28166.37 + v * (88786.17 + v * (-141662.1 + v * (116488.0 + v * (-36818.27)))))));
  return new THREE.Color(r / 255, g / 255, b / 255);
}


let sensorPoints: THREE.Points | null = null;
let buildingVoxels: THREE.InstancedMesh | null = null;
let edgesVoxels: THREE.LineSegments | null = null;
let activeSensorData: { x: number, y: number, z: number, val: number, h: number }[] = [];
const loadedDatasets = new Map<string, { x: number, y: number, z: number, val: number, h: number }[]>();
let dataMin = 0;
let dataMax = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = false; // Disable shadows as requested
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasContainer.appendChild(renderer.domElement);

// Controls
let controls = new OrbitControls(activeCamera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE
};

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(100, -100, 200);
directionalLight.castShadow = true;

// Shadow settings
directionalLight.shadow.mapSize.width = 8192;
directionalLight.shadow.mapSize.height = 8192;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 4000;
directionalLight.shadow.bias = -0.0001;
directionalLight.shadow.normalBias = 0.02; // Helps with shadow acne on flat surfaces

scene.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight2.position.set(-100, 100, -50);
scene.add(directionalLight2);

// Helpers
const gridHelper = new THREE.GridHelper(2000, 40, 0xccd6e0, 0xdde4ed);
gridHelper.rotation.x = Math.PI / 2;
gridHelper.visible = false;
scene.add(gridHelper);



function processCSVData(text: string, name: string) {
  try {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      console.error('CSV is empty');
      return;
    }

    const header = lines[0].split(',').map(h => h.trim());
    const xIdx = header.findIndex(h => h.toLowerCase() === 'x');
    const yIdx = header.findIndex(h => h.toLowerCase() === 'y');
    const zIdx = header.findIndex(h => h.toLowerCase() === 'z_relative' || h.toLowerCase() === 'z');
    const valIdx = header.findIndex(h => h.toLowerCase() === 'mag_u' || h.toLowerCase() === 'u' || h.toLowerCase().includes('mag_u'));
    const hIdx = header.findIndex(h => h.toLowerCase() === 'bldg_height' || h.toLowerCase().includes('height')); // Check for height

    if (xIdx === -1 || yIdx === -1 || zIdx === -1) {
      console.error('Missing columns in CSV:', { xIdx, yIdx, zIdx });
      return;
    }

    const newData: { x: number, y: number, z: number, val: number, h: number }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length <= Math.max(xIdx, yIdx, zIdx, valIdx)) continue;

      const x = parseFloat(parts[xIdx]);
      const y = parseFloat(parts[yIdx]);
      const z = parseFloat(parts[zIdx]);
      const val = valIdx !== -1 ? parseFloat(parts[valIdx]) : 0;
      const h = hIdx !== -1 ? parseFloat(parts[hIdx]) : 0;

      if (!isNaN(x) && !isNaN(y) && !isNaN(z) && !isNaN(val)) {
        newData.push({ x, y, z, val, h });
      }
    }

    if (newData.length > 0) {
      loadedDatasets.set(name, newData);
      updateResultsDropdown();
      // Auto-select the first sorted option
      const select = document.getElementById('results-select') as HTMLSelectElement;
      if (select.options.length > 1) {
        const firstSortedName = select.options[1].value;
        select.value = firstSortedName;
        renderDataset(firstSortedName);
      }
    }
  } catch (err) {
    console.error('Error processing CSV:', err);
  }
}

function updateResultsDropdown() {
  const select = document.getElementById('results-select') as HTMLSelectElement;
  // Keep the first disabled option
  const firstOption = select.options[0];
  select.innerHTML = '';
  select.appendChild(firstOption);

  const keys = Array.from(loadedDatasets.keys());

  // Numerical Sort Attempt
  keys.sort((a, b) => {
    // Attempt to match numbers in the filename
    const numA = a.match(/\d+/);
    const numB = b.match(/\d+/);

    if (numA && numB) {
      const valA = parseInt(numA[0]);
      const valB = parseInt(numB[0]);
      return valA - valB;
    } else if (numA) {
      return -1; // Numbers come first
    } else if (numB) {
      return 1;
    } else {
      return a.localeCompare(b);
    }
  });

  keys.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.text = key;
    select.appendChild(option);
  });
}

function renderDataset(name: string) {
  const data = loadedDatasets.get(name);
  if (!data) return;

  activeSensorData = data;

  // Calculate Min/Max for this dataset
  let minVal = Infinity;
  let maxVal = -Infinity;
  activeSensorData.forEach(d => {
    if (d.val < minVal) minVal = d.val;
    if (d.val > maxVal) maxVal = d.val;
  });
  dataMin = minVal;
  dataMax = maxVal;

  // Create Point Cloud
  if (sensorPoints) {
    scene.remove(sensorPoints);
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(activeSensorData.length * 3);
  const colors = new Float32Array(activeSensorData.length * 3);

  const mapName = (document.getElementById('colormap-select') as HTMLSelectElement)?.value || 'jet';

  activeSensorData.forEach((d, i) => {
    positions[i * 3] = d.x;
    positions[i * 3 + 1] = d.y;
    positions[i * 3 + 2] = d.z;

    const normalized = (d.val - minVal) / (maxVal - minVal || 1);

    let c: THREE.Color;
    switch (mapName) {
      case 'jet': c = getJetColor(normalized); break;
      case 'viridis': c = getViridisColor(normalized); break;
      case 'magma': c = getMagmaColor(normalized); break;
      case 'inferno': c = getInfernoColor(normalized); break;
      case 'turbo': default: c = getTurboColor(normalized); break;
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  });

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: (document.getElementById('point-size') as HTMLInputElement)?.value ? parseFloat((document.getElementById('point-size') as HTMLInputElement).value) : 10,
    vertexColors: true,
    sizeAttenuation: true
  });

  sensorPoints = new THREE.Points(geometry, material);
  scene.add(sensorPoints);
  console.log(`Rendered: ${name}. Points: ${activeSensorData.length}`);

  // Create Voxel City (Instanced Mesh)
  if (buildingVoxels) {
    scene.remove(buildingVoxels);
    buildingVoxels = null;
  }
  if (edgesVoxels) {
    scene.remove(edgesVoxels);
    edgesVoxels = null;
  }

  const validBuildings = activeSensorData.filter(d => d.h > 0);
  if (validBuildings.length > 0) {
    const boxGeo = new THREE.BoxGeometry(2, 2, 1); // Base 2x2m, height 1
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    buildingVoxels = new THREE.InstancedMesh(boxGeo, boxMat, validBuildings.length);
    // buildingVoxels.castShadow = true; // No shadows on Basic
    // buildingVoxels.receiveShadow = true;

    const dummy = new THREE.Object3D();
    validBuildings.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.h / 2); // Center of box is at h/2 so it sits on 0
      dummy.scale.set(1, 1, d.h);
      dummy.updateMatrix();
      buildingVoxels!.setMatrixAt(i, dummy.matrix);
    });

    buildingVoxels.instanceMatrix.needsUpdate = true;
    // Initial visibility based on toggle
    const buildingToggle = document.getElementById('show-buildings') as HTMLInputElement;
    buildingVoxels.visible = buildingToggle ? buildingToggle.checked : true;
    scene.add(buildingVoxels);
    console.log(`Voxel City created: ${validBuildings.length} buildings.`);

    // Create Edges (Smart Filtering for Outline)
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const edgePositions: number[] = [];
    const hMap = new Map<string, number>();

    // Build Key: "x,y" (Assuming x,y are precise enough or integers)
    // Note: sensorData likely has integer grid steps.
    validBuildings.forEach(d => {
      hMap.set(`${d.x},${d.y}`, d.h);
    });

    const getH = (x: number, y: number) => hMap.get(`${x},${y}`) || 0;

    validBuildings.forEach(d => {
      const x = d.x; const y = d.y; const h = d.h; const s = 1.0;

      const hN = getH(x, y + 2);
      const hS = getH(x, y - 2);
      const hE = getH(x + 2, y);
      const hW = getH(x - 2, y);

      // Top Rect (Draw if higher than neighbor)
      if (h > hN) edgePositions.push(x - s, y + s, h, x + s, y + s, h);
      if (h > hS) edgePositions.push(x - s, y - s, h, x + s, y - s, h);
      if (h > hE) edgePositions.push(x + s, y - s, h, x + s, y + s, h);
      if (h > hW) edgePositions.push(x - s, y - s, h, x - s, y + s, h);

      // Bottom Rect (Draw if neighbor is missing/ground)
      if (hN === 0) edgePositions.push(x - s, y + s, 0, x + s, y + s, 0);
      if (hS === 0) edgePositions.push(x - s, y - s, 0, x + s, y - s, 0);
      if (hE === 0) edgePositions.push(x + s, y - s, 0, x + s, y + s, 0);
      if (hW === 0) edgePositions.push(x - s, y - s, 0, x - s, y + s, 0);

      // Vertical Edges (Smart Corner Logic: !((h1!=h2) && !corner))
      const checkCorner = (h1: boolean, h2: boolean, hCorner: boolean) => {
        return !((h1 !== h2) && !hCorner) && !(h1 && h2 && hCorner);
      };

      // NE
      const hNE = getH(x + 2, y + 2);
      if (checkCorner(hN >= h, hE >= h, hNE >= h)) edgePositions.push(x + s, y + s, 0, x + s, y + s, h);

      // NW
      const hNW = getH(x - 2, y + 2);
      if (checkCorner(hN >= h, hW >= h, hNW >= h)) edgePositions.push(x - s, y + s, 0, x - s, y + s, h);

      // SE
      const hSE = getH(x + 2, y - 2);
      if (checkCorner(hS >= h, hE >= h, hSE >= h)) edgePositions.push(x + s, y - s, 0, x + s, y - s, h);

      // SW
      const hSW = getH(x - 2, y - 2);
      if (checkCorner(hS >= h, hW >= h, hSW >= h)) edgePositions.push(x - s, y - s, 0, x - s, y - s, h);
    });

    const edgesGeo = new THREE.BufferGeometry();
    edgesGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    edgesVoxels = new THREE.LineSegments(edgesGeo, edgesMat);

    const edgesToggle = document.getElementById('show-edges') as HTMLInputElement;
    edgesVoxels.visible = edgesToggle ? edgesToggle.checked : false;
    scene.add(edgesVoxels);
  }

  // Zoom to fit if this is the first thing loaded or requested
  zoomToFit();
}



function zoomToFit() {
  const box = new THREE.Box3();
  let hasMesh = false;

  if (sensorPoints && sensorPoints.visible) {
    box.expandByObject(sensorPoints);
    hasMesh = true;
  }
  if (buildingVoxels && buildingVoxels.visible) {
    box.expandByObject(buildingVoxels);
    hasMesh = true;
  }

  if (!hasMesh) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // Position cameras at a representative isometric angle
  const distance = maxDim * 1.5;
  const camPos = new THREE.Vector3(
    center.x + distance,
    center.y - distance,
    center.z + distance
  );

  // Update Perspective Camera
  perspectiveCamera.position.copy(camPos);
  perspectiveCamera.lookAt(center);
  perspectiveCamera.far = distance * 10;
  perspectiveCamera.updateProjectionMatrix();

  // Update Orthographic Camera
  const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  orthographicCamera.left = -maxDim * aspect;
  orthographicCamera.right = maxDim * aspect;
  orthographicCamera.top = maxDim;
  orthographicCamera.bottom = -maxDim;
  orthographicCamera.position.copy(camPos);
  orthographicCamera.lookAt(center);
  orthographicCamera.far = distance * 10;
  orthographicCamera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();

  // Adjust shadow camera to tightly fit the scene
  const shadowCam = directionalLight.shadow.camera;
  shadowCam.left = -maxDim * 1.2;
  shadowCam.right = maxDim * 1.2;
  shadowCam.top = maxDim * 1.2;
  shadowCam.bottom = -maxDim * 1.2;
  shadowCam.updateProjectionMatrix();

  // Position light based on center
  directionalLight.position.set(center.x + maxDim, center.y - maxDim, center.z + maxDim * 1.5);
}

// UI Event Listeners
document.getElementById('auto-rotate')?.addEventListener('change', (e) => {
  controls.autoRotate = (e.target as HTMLInputElement).checked;
});

document.getElementById('perspective-mode')?.addEventListener('change', (e) => {
  const isPerspective = (e.target as HTMLInputElement).checked;
  const oldTarget = controls.target.clone();

  if (isPerspective) {
    activeCamera = perspectiveCamera;
  } else {
    activeCamera = orthographicCamera;
  }

  // Transfer controls to new camera
  const oldCamPos = controls.object.position.clone();
  controls.dispose();
  controls = new OrbitControls(activeCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE
  };
  controls.target.copy(oldTarget);
  activeCamera.position.copy(oldCamPos);
  controls.update();
});

document.getElementById('grid')?.addEventListener('change', (e) => {
  gridHelper.visible = (e.target as HTMLInputElement).checked;
});


document.getElementById('point-size')?.addEventListener('input', (e) => {
  if (sensorPoints) {
    (sensorPoints.material as THREE.PointsMaterial).size = parseFloat((e.target as HTMLInputElement).value);
  }
});

// CSV Upload Listener
const handleFileUpload = (files: FileList | null) => {
  if (!files) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name.toLowerCase().endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        processCSVData(text, file.name);
      };
      reader.readAsText(file);
    }
  }
};

document.getElementById('csv-upload')?.addEventListener('change', (e) => {
  handleFileUpload((e.target as HTMLInputElement).files);
});

document.getElementById('folder-upload')?.addEventListener('change', (e) => {
  handleFileUpload((e.target as HTMLInputElement).files);
});

document.getElementById('results-select')?.addEventListener('change', (e) => {
  const name = (e.target as HTMLSelectElement).value;
  renderDataset(name);
});

document.getElementById('show-buildings')?.addEventListener('change', (e) => {
  if (buildingVoxels) {
    buildingVoxels.visible = (e.target as HTMLInputElement).checked;
  }
});

document.getElementById('show-edges')?.addEventListener('change', (e) => {
  if (edgesVoxels) {
    edgesVoxels.visible = (e.target as HTMLInputElement).checked;
  }
});

document.getElementById('top-view')?.addEventListener('change', (e) => {
  const isTop = (e.target as HTMLInputElement).checked;
  const box = new THREE.Box3();
  if (sensorPoints) box.expandByObject(sensorPoints);
  if (buildingVoxels) box.expandByObject(buildingVoxels);

  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (isTop) {
      activeCamera.position.set(center.x, center.y - 0.001, center.z + maxDim * 2);
      activeCamera.lookAt(center);
      activeCamera.up.set(0, 0, 1);
      controls.target.copy(center);
    } else {
      // Isometric View
      const dist = maxDim * 1.5;
      activeCamera.position.set(center.x - dist, center.y - dist, center.z + dist);
      activeCamera.lookAt(center);
      activeCamera.up.set(0, 0, 1);
      controls.target.copy(center);
    }
  }

  // Lock rotation if Top View is active
  controls.enableRotate = !isTop;
  controls.update();
});

// Resize handle
window.addEventListener('resize', () => {
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  const aspect = w / h;

  renderer.setSize(w, h);

  perspectiveCamera.aspect = aspect;
  perspectiveCamera.updateProjectionMatrix();

  const box = new THREE.Box3();
  if (sensorPoints && sensorPoints.visible) {
    box.expandByObject(sensorPoints);
  }
  if (buildingVoxels && buildingVoxels.visible) {
    box.expandByObject(buildingVoxels);
  }
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1000;

  orthographicCamera.left = -maxDim * aspect;
  orthographicCamera.right = maxDim * aspect;
  orthographicCamera.top = maxDim;
  orthographicCamera.bottom = -maxDim;
  orthographicCamera.updateProjectionMatrix();
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, activeCamera);
}

// Start empty (Upload only)
zoomToFit();
animate();

// --- Colormap Helpers ---

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(t: number, stops: { t: number, r: number, g: number, b: number }[]) {
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

function getJetColor(t: number) {
  // Simple Jet approximation
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(t * 4 - 1)));
  return new THREE.Color(r, g, b);
}

// Approximations for Viridis/Magma/Inferno using stops
const viridisStops = [
  { t: 0.0, r: 0.267, g: 0.004, b: 0.329 }, // 440154
  { t: 0.25, r: 0.229, g: 0.322, b: 0.545 }, // 3b528b
  { t: 0.5, r: 0.128, g: 0.567, b: 0.551 }, // 21918c
  { t: 0.75, r: 0.369, g: 0.787, b: 0.383 }, // 5ec962
  { t: 1.0, r: 0.993, g: 0.906, b: 0.144 }  // fde725
];
function getViridisColor(t: number) { return lerpColor(t, viridisStops); }

const magmaStops = [
  { t: 0.0, r: 0.001, g: 0.000, b: 0.013 }, // 000004
  { t: 0.25, r: 0.316, g: 0.092, b: 0.418 }, // 51127c
  { t: 0.5, r: 0.716, g: 0.211, b: 0.368 }, // b73779
  { t: 0.75, r: 0.986, g: 0.549, b: 0.296 }, // fc8d59
  { t: 1.0, r: 0.988, g: 0.998, b: 0.749 }  // fcfdbf
];
function getMagmaColor(t: number) { return lerpColor(t, magmaStops); }

const infernoStops = [
  { t: 0.0, r: 0.001, g: 0.000, b: 0.013 }, // 000004
  { t: 0.25, r: 0.347, g: 0.057, b: 0.406 }, // 5709ce (approx)
  { t: 0.5, r: 0.730, g: 0.193, b: 0.279 }, // bb3754
  { t: 0.75, r: 0.963, g: 0.575, b: 0.116 }, // f98e09
  { t: 1.0, r: 0.988, g: 0.998, b: 0.643 }  // fcffa4
];
function getInfernoColor(t: number) { return lerpColor(t, infernoStops); }

// Update function
function updateSensorColors(mapName: string) {
  if (!sensorPoints || activeSensorData.length === 0) return;

  const colors = sensorPoints.geometry.attributes.color.array as Float32Array;

  activeSensorData.forEach((d, i) => {
    const normalized = (d.val - dataMin) / (dataMax - dataMin || 1);
    let c: THREE.Color;
    switch (mapName) {
      case 'jet': c = getJetColor(normalized); break;
      case 'viridis': c = getViridisColor(normalized); break;
      case 'magma': c = getMagmaColor(normalized); break;
      case 'inferno': c = getInfernoColor(normalized); break;
      case 'turbo': default: c = getTurboColor(normalized); break;
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  });

  sensorPoints.geometry.attributes.color.needsUpdate = true;
}

document.getElementById('colormap-select')?.addEventListener('change', (e) => {
  const mapName = (e.target as HTMLSelectElement).value;
  updateSensorColors(mapName);
});
