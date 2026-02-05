import * as THREE from 'three';
import './style.css';
import { getColormapColor, type ColormapName } from './colormaps';
import { CSVLoader, updateResultsDropdown, handleFileUpload, type SensorDataPoint } from './csv-loader';
import { setupCameras, switchCamera, zoomToFit, updateCameraOnResize } from './camera';
import { 
  captureAllScreenshots, 
  updateDownloadButton,
  type ScreenshotConfig 
} from './screenshot';

const PLACEHOLDER_NAME = 'ML_Basic_Test_0_0.csv';
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1f5f9);

const canvasContainer = document.getElementById('canvas-container') as HTMLElement;

// Setup renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasContainer.appendChild(renderer.domElement);

// Setup cameras
const cameraSetup = setupCameras(canvasContainer, renderer);
let { perspectiveCamera, orthographicCamera, activeCamera } = cameraSetup;
let controls = cameraSetup.controls;

// Scene objects
let sensorPoints: THREE.Points | null = null;
let buildingVoxels: THREE.InstancedMesh | null = null;
let edgesVoxels: THREE.LineSegments | null = null;
let activeSensorData: SensorDataPoint[] = [];
let dataMin = 0;
let dataMax = 1;
let userMin = 0;
let userMax = 1;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(100, -100, 200);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 8192;
directionalLight.shadow.mapSize.height = 8192;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 4000;
directionalLight.shadow.bias = -0.0001;
directionalLight.shadow.normalBias = 0.02;
scene.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight2.position.set(-100, 100, -50);
scene.add(directionalLight2);

// Grid helper
const gridHelper = new THREE.GridHelper(2000, 40, 0xccd6e0, 0xdde4ed);
gridHelper.rotation.x = Math.PI / 2;
gridHelper.visible = false;
scene.add(gridHelper);

// CSV Loader
const csvLoader = new CSVLoader(
  () => {
    updateResultsDropdownUI();
    updateDownloadButtonUI();
  }
);

function updateResultsDropdownUI() {
  const select = document.getElementById('results-select') as HTMLSelectElement;
  const firstOption = select.options[0];
  const sortedNames = csvLoader.getSortedDatasetNames();
  updateResultsDropdown(select, sortedNames, firstOption);
}

function updateDownloadButtonUI() {
  const downloadBtn = document.getElementById('download-screenshots') as HTMLButtonElement;
  updateDownloadButton(downloadBtn, csvLoader.getDatasetCount());
}

function processCSVData(text: string, name: string) {
  csvLoader.processCSVData(text, name);
  
  // Auto-select the first sorted option
  const select = document.getElementById('results-select') as HTMLSelectElement;
  if (select.options.length > 1) {
    const firstSortedName = select.options[1].value;
    select.value = firstSortedName;
    renderDataset(firstSortedName);
  }
}

function renderDataset(name: string) {
  const data = csvLoader.getDataset(name);
  if (!data) return;

  activeSensorData = data;

  // Calculate Min/Max for this dataset
  let referenceData = data;
  if (name.toLowerCase().endsWith('_pred.csv')) {
    const refName = name.replace(/_pred\.csv$/i, '.csv');
    if (csvLoader.hasDataset(refName)) {
      referenceData = csvLoader.getDataset(refName)!;
      console.log(`Using reference range from: ${refName}`);
    }
  }

  let minVal = Infinity;
  let maxVal = -Infinity;
  referenceData.forEach(d => {
    if (d.val < minVal) minVal = d.val;
    if (d.val > maxVal) maxVal = d.val;
  });
  dataMin = minVal;
  dataMax = maxVal;
  userMin = dataMin;
  userMax = dataMax;

  // Update Sliders
  const minSlider = document.getElementById('colormap-min') as HTMLInputElement;
  const maxSlider = document.getElementById('colormap-max') as HTMLInputElement;
  const minDisplay = document.getElementById('min-val-display') as HTMLElement;
  const maxDisplay = document.getElementById('max-val-display') as HTMLElement;

  if (minSlider && maxSlider) {
    const sliderMin = Math.min(0, dataMin);
    const sliderMax = Math.max(2, dataMax);
    const range = sliderMax - sliderMin;
    const step = range / 1000 || 0.01;

    minSlider.min = sliderMin.toString();
    minSlider.max = sliderMax.toString();
    minSlider.step = step.toString();
    minSlider.value = "0";

    maxSlider.min = sliderMin.toString();
    maxSlider.max = sliderMax.toString();
    maxSlider.step = step.toString();
    maxSlider.value = "1";

    userMin = 0;
    userMax = 1;

    if (minDisplay) minDisplay.textContent = userMin.toFixed(2);
    if (maxDisplay) maxDisplay.textContent = userMax.toFixed(2);
  }

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

    const normalized = (d.val - userMin) / (userMax - userMin || 1);
    const c = getColormapColor(normalized, mapName as ColormapName);

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
    const boxGeo = new THREE.BoxGeometry(2, 2, 1);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    buildingVoxels = new THREE.InstancedMesh(boxGeo, boxMat, validBuildings.length);

    const dummy = new THREE.Object3D();
    validBuildings.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.h / 2);
      dummy.scale.set(1, 1, d.h);
      dummy.updateMatrix();
      buildingVoxels!.setMatrixAt(i, dummy.matrix);
    });

    buildingVoxels.instanceMatrix.needsUpdate = true;
    const buildingToggle = document.getElementById('show-buildings') as HTMLInputElement;
    buildingVoxels.visible = buildingToggle ? buildingToggle.checked : true;
    scene.add(buildingVoxels);
    console.log(`Voxel City created: ${validBuildings.length} buildings.`);

    // Create Edges (Smart Filtering for Outline)
    createBuildingEdges(validBuildings);
  }

  zoomToFit({
    perspectiveCamera,
    orthographicCamera,
    activeCamera,
    controls
  }, controls, canvasContainer, sensorPoints, buildingVoxels, directionalLight);
}

function createBuildingEdges(validBuildings: SensorDataPoint[]) {
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const edgePositions: number[] = [];
  const hMap = new Map<string, number>();

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

    // Vertical Edges (Smart Corner Logic)
    const checkCorner = (h1: boolean, h2: boolean, hCorner: boolean) => {
      return !((h1 !== h2) && !hCorner) && !(h1 && h2 && hCorner);
    };

    const hNE = getH(x + 2, y + 2);
    if (checkCorner(hN >= h, hE >= h, hNE >= h)) edgePositions.push(x + s, y + s, 0, x + s, y + s, h);

    const hNW = getH(x - 2, y + 2);
    if (checkCorner(hN >= h, hW >= h, hNW >= h)) edgePositions.push(x - s, y + s, 0, x - s, y + s, h);

    const hSE = getH(x + 2, y - 2);
    if (checkCorner(hS >= h, hE >= h, hSE >= h)) edgePositions.push(x + s, y - s, 0, x + s, y - s, h);

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

function updateSensorColors(mapName: ColormapName) {
  if (!sensorPoints || activeSensorData.length === 0) return;

  const colors = sensorPoints.geometry.attributes.color.array as Float32Array;

  activeSensorData.forEach((d, i) => {
    const normalized = (d.val - userMin) / (userMax - userMin || 1);
    const c = getColormapColor(normalized, mapName);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  });

  sensorPoints.geometry.attributes.color.needsUpdate = true;
}

// UI Event Listeners
document.getElementById('auto-rotate')?.addEventListener('change', (e) => {
  controls.autoRotate = (e.target as HTMLInputElement).checked;
});

document.getElementById('perspective-mode')?.addEventListener('change', (e) => {
  const isPerspective = (e.target as HTMLInputElement).checked;
  controls = switchCamera(isPerspective, {
    perspectiveCamera,
    orthographicCamera,
    activeCamera,
    controls
  }, renderer);
  activeCamera = isPerspective ? perspectiveCamera : orthographicCamera;
});

document.getElementById('grid')?.addEventListener('change', (e) => {
  gridHelper.visible = (e.target as HTMLInputElement).checked;
});

document.getElementById('point-size')?.addEventListener('input', (e) => {
  if (sensorPoints) {
    (sensorPoints.material as THREE.PointsMaterial).size = parseFloat((e.target as HTMLInputElement).value);
  }
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

  controls.enableRotate = !isTop;
  controls.update();
});

// CSV Upload Listener
document.getElementById('csv-upload')?.addEventListener('change', (e) => {
  handleFileUpload((e.target as HTMLInputElement).files, (text, name) => {
    // Remove placeholder if exists
    if (csvLoader.hasDataset(PLACEHOLDER_NAME)) {
      csvLoader.deleteDataset(PLACEHOLDER_NAME);
    }
    processCSVData(text, name);
  });
});

document.getElementById('folder-upload')?.addEventListener('change', (e) => {
  handleFileUpload((e.target as HTMLInputElement).files, (text, name) => {
    if (csvLoader.hasDataset(PLACEHOLDER_NAME)) {
      csvLoader.deleteDataset(PLACEHOLDER_NAME);
    }
    processCSVData(text, name);
  });
});

// Resize handle
window.addEventListener('resize', () => {
  updateCameraOnResize(
    { perspectiveCamera, orthographicCamera, activeCamera, controls },
    renderer,
    canvasContainer,
    sensorPoints,
    buildingVoxels,
    () => zoomToFit({ perspectiveCamera, orthographicCamera, activeCamera, controls }, controls, canvasContainer, sensorPoints, buildingVoxels, directionalLight)
  );
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, activeCamera);
}

// Load placeholder
csvLoader.processCSVData
function loadPlaceholder() {
  fetch(PLACEHOLDER_NAME)
    .then(response => {
      if (!response.ok) throw new Error("Placeholder not found");
      return response.text();
    })
    .then(text => {
      csvLoader.processCSVData(text, PLACEHOLDER_NAME);
      const select = document.getElementById('results-select') as HTMLSelectElement;
      if (select) select.value = PLACEHOLDER_NAME;
      renderDataset(PLACEHOLDER_NAME);
    })
    .catch(err => {
      console.warn("Could not load placeholder:", err);
      zoomToFit({ perspectiveCamera, orthographicCamera, activeCamera, controls }, controls, canvasContainer, sensorPoints, buildingVoxels, directionalLight);
    });
}

// Colormap events
document.getElementById('colormap-select')?.addEventListener('change', (e) => {
  const mapName = (e.target as HTMLSelectElement).value;
  updateSensorColors(mapName as ColormapName);
});

// Advanced Tab Colormap Slider Logic
const updateRange = () => {
  const minSlider = document.getElementById('colormap-min') as HTMLInputElement;
  const maxSlider = document.getElementById('colormap-max') as HTMLInputElement;

  if (!minSlider || !maxSlider) return;

  let v1 = parseFloat(minSlider.value);
  let v2 = parseFloat(maxSlider.value);

  if (v1 > v2) {
    if (document.activeElement === minSlider) {
      minSlider.value = v2.toString();
      v1 = v2;
    } else {
      maxSlider.value = v1.toString();
      v2 = v1;
    }
  }

  userMin = v1;
  userMax = v2;

  const minDisplay = document.getElementById('min-val-display');
  const maxDisplay = document.getElementById('max-val-display');
  if (minDisplay) minDisplay.textContent = userMin.toFixed(2);
  if (maxDisplay) maxDisplay.textContent = userMax.toFixed(2);

  const mapName = (document.getElementById('colormap-select') as HTMLSelectElement).value;
  updateSensorColors(mapName as ColormapName);
};

document.getElementById('colormap-min')?.addEventListener('input', updateRange);
document.getElementById('colormap-max')?.addEventListener('input', updateRange);

document.getElementById('advanced-toggle')?.addEventListener('click', function (this: HTMLElement) {
  this.classList.toggle('active');
  const content = document.getElementById('advanced-content');
  if (content) {
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
  }
});

// Mobile Menu Toggle Logic
const menuToggle = document.getElementById('menu-toggle');
const uiContainer = document.getElementById('ui-container');

menuToggle?.addEventListener('click', () => {
  menuToggle.classList.toggle('open');
  uiContainer?.classList.toggle('sidebar-open');
});

// Close sidebar when clicking outside
canvasContainer.addEventListener('click', () => {
  if (uiContainer?.classList.contains('sidebar-open')) {
    menuToggle?.classList.remove('open');
    uiContainer.classList.remove('sidebar-open');
  }
});

// Screenshot download
document.getElementById('download-screenshots')?.addEventListener('click', () => {
  const downloadBtn = document.getElementById('download-screenshots') as HTMLButtonElement;
  const dpiSelect = document.getElementById('dpi-select') as HTMLSelectElement;
  const originalWidth = canvasContainer.clientWidth;
  const originalHeight = canvasContainer.clientHeight;
  const originalPixelRatio = renderer.getPixelRatio();

  const config: ScreenshotConfig = {
    canvasContainer,
    renderer,
    cameras: { perspectiveCamera, orthographicCamera, activeCamera, controls },
    controls,
    sensorPoints,
    buildingVoxels,
    loadedDatasets: csvLoader.getAllDatasets(),
    renderDataset,
    zoomToFit: () => zoomToFit({ perspectiveCamera, orthographicCamera, activeCamera, controls }, controls, canvasContainer, sensorPoints, buildingVoxels, directionalLight)
  };

  captureAllScreenshots(config, scene, downloadBtn, dpiSelect, originalWidth, originalHeight, originalPixelRatio);
});

loadPlaceholder();
animate();
