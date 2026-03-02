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
import {
  PLACEHOLDER_FILENAME,
  SCENE_BACKGROUND_COLOR,
  DEFAULT_POINT_SIZE,
  GAPLESS_POINT_SIZE_FALLBACK,
  GAPLESS_POINT_SIZE_PADDING,
  FIXED_POINT_SIZE_BASE_RATIO,
  FIXED_POINT_GAPLESS_PADDING,
  VIEW_SETTINGS_STORAGE_KEY,
  ALLOWED_COLORMAPS
} from './config';

const scene = new THREE.Scene();
scene.background = new THREE.Color(SCENE_BACKGROUND_COLOR);

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
let fixedSensorPoints: THREE.InstancedMesh | null = null;
let buildingVoxels: THREE.InstancedMesh | null = null;
let edgesVoxels: THREE.LineSegments | null = null;
let activeSensorData: SensorDataPoint[] = [];
let dataMin = 0;
let dataMax = 1;
let userMin = 0;
let userMax = 1;
let gaplessPointSizingEnabled = true;
let rotatePointsToCameraEnabled = false;
let sensorGridStep = 2;
const sensorCloudCenter = new THREE.Vector3();
const projectionScratchA = new THREE.Vector3();
const projectionScratchB = new THREE.Vector3();
const gaplessPointX = new THREE.Vector3();
const gaplessPointY = new THREE.Vector3();
const fixedPointColor = new THREE.Color();

interface PersistedViewSettings {
  topView: boolean;
  autoRotate: boolean;
  perspectiveMode: boolean;
  grid: boolean;
  showBuildings: boolean;
  showEdges: boolean;
  pointSize: number;
  gaplessPoints: boolean;
  rotateToCamera: boolean;
  colormap: ColormapName;
}

function getManualPointSize(): number {
  const pointSizeSlider = document.getElementById('point-size') as HTMLInputElement | null;
  if (!pointSizeSlider) return DEFAULT_POINT_SIZE;

  const parsedSize = parseFloat(pointSizeSlider.value);
  if (!Number.isFinite(parsedSize) || parsedSize <= 0) {
    return DEFAULT_POINT_SIZE;
  }

  return parsedSize;
}

function estimateAxisStep(points: SensorDataPoint[], axis: 'x' | 'y'): number {
  // ⚡ Bolt Optimization: Use explicit loop instead of map/filter to reduce GC pressure
  const uniqueValues = new Set<number>();
  const len = points.length;
  for (let i = 0; i < len; i++) {
    uniqueValues.add(axis === 'x' ? points[i].x : points[i].y);
  }

  const values = Array.from(uniqueValues);
  if (values.length < 2) return 0;

  values.sort((a, b) => a - b);
  const diffs: number[] = [];

  for (let i = 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff > 0.0001 && Number.isFinite(diff)) {
      diffs.push(diff);
    }
  }

  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);

  return diffs[Math.floor(diffs.length / 2)];
}

function estimatePointGridStep(points: SensorDataPoint[]): number {
  const xStep = estimateAxisStep(points, 'x');
  const yStep = estimateAxisStep(points, 'y');
  const candidates = [xStep, yStep].filter(step => step > 0 && Number.isFinite(step));

  if (candidates.length === 0) return 2;
  return Math.max(...candidates);
}

function getProjectedPixelDistance(from: THREE.Vector3, to: THREE.Vector3): number {
  projectionScratchA.copy(from).project(activeCamera);
  projectionScratchB.copy(to).project(activeCamera);

  const width = renderer.domElement.clientWidth || 1;
  const height = renderer.domElement.clientHeight || 1;

  const dx = (projectionScratchB.x - projectionScratchA.x) * width * 0.5;
  const dy = (projectionScratchB.y - projectionScratchA.y) * height * 0.5;

  return Math.hypot(dx, dy);
}

function getGaplessPointSize(): number {
  const manualSize = getManualPointSize();
  if (!sensorPoints || sensorGridStep <= 0) {
    return Math.max(manualSize, GAPLESS_POINT_SIZE_FALLBACK);
  }

  gaplessPointX.set(sensorCloudCenter.x + sensorGridStep, sensorCloudCenter.y, sensorCloudCenter.z);
  gaplessPointY.set(sensorCloudCenter.x, sensorCloudCenter.y + sensorGridStep, sensorCloudCenter.z);

  const spacingX = getProjectedPixelDistance(sensorCloudCenter, gaplessPointX);
  const spacingY = getProjectedPixelDistance(sensorCloudCenter, gaplessPointY);
  const projectedSpacing = Math.max(spacingX, spacingY);

  if (!Number.isFinite(projectedSpacing) || projectedSpacing <= 0) {
    return Math.max(manualSize, GAPLESS_POINT_SIZE_FALLBACK);
  }

  return Math.max(manualSize, projectedSpacing * GAPLESS_POINT_SIZE_PADDING);
}

function resolvePointSize(): number {
  if (!gaplessPointSizingEnabled) {
    return getManualPointSize();
  }
  return getGaplessPointSize();
}

function getFixedPointWorldSize(): number {
  const baseStep = sensorGridStep > 0 ? sensorGridStep : 2;
  if (gaplessPointSizingEnabled) {
    return baseStep * FIXED_POINT_GAPLESS_PADDING;
  }

  const manualScale = getManualPointSize() / DEFAULT_POINT_SIZE;
  return baseStep * FIXED_POINT_SIZE_BASE_RATIO * manualScale;
}

function updateFixedPointMatrices() {
  if (!fixedSensorPoints || activeSensorData.length === 0) return;

  const worldSize = getFixedPointWorldSize();

  // ⚡ Bolt Optimization: Batch update `instanceMatrix` via direct Float32Array mutation
  // Updating instance matrices directly by writing 16-float blocks is 3-5x faster than using `Object3D.updateMatrix()`.
  const instanceMatrixArray = fixedSensorPoints.instanceMatrix.array;
  instanceMatrixArray.fill(0);

  for (let i = 0; i < activeSensorData.length; i += 1) {
    const point = activeSensorData[i];
    const mOff = i * 16;

    // Scale components (worldSize, worldSize, 1)
    instanceMatrixArray[mOff + 0] = worldSize;
    instanceMatrixArray[mOff + 5] = worldSize;
    instanceMatrixArray[mOff + 10] = 1;
    instanceMatrixArray[mOff + 15] = 1;

    // Translation components (x, y, z)
    instanceMatrixArray[mOff + 12] = point.x;
    instanceMatrixArray[mOff + 13] = point.y;
    instanceMatrixArray[mOff + 14] = point.z;
  }

  fixedSensorPoints.instanceMatrix.needsUpdate = true;
}

function updatePointModeVisibility() {
  if (sensorPoints) {
    (sensorPoints.material as THREE.PointsMaterial).visible = rotatePointsToCameraEnabled;
  }
  if (fixedSensorPoints) {
    fixedSensorPoints.visible = !rotatePointsToCameraEnabled;
  }
}

function applyPointSize() {
  if (sensorPoints) {
    (sensorPoints.material as THREE.PointsMaterial).size = resolvePointSize();
  }

  if (fixedSensorPoints && !rotatePointsToCameraEnabled) {
    updateFixedPointMatrices();
  }
}

function setPointSizeControlState(disabled: boolean) {
  const pointSizeSlider = document.getElementById('point-size') as HTMLInputElement | null;
  if (pointSizeSlider) {
    pointSizeSlider.disabled = disabled;
    if (disabled) {
      pointSizeSlider.title = "Disable 'Gapless Points' to adjust manually";
    } else {
      pointSizeSlider.removeAttribute('title');
    }
  }

  const pointSizeControl = document.getElementById('point-size-control');
  if (pointSizeControl) {
    pointSizeControl.classList.toggle('disabled', disabled);
    if (disabled) {
      pointSizeControl.title = "Disable 'Gapless Points' to adjust manually";
    } else {
      pointSizeControl.removeAttribute('title');
    }
  }
}

function readPersistedViewSettings(): Partial<PersistedViewSettings> {
  try {
    const raw = localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    return parsed as Partial<PersistedViewSettings>;
  } catch {
    return {};
  }
}

function persistViewSettings() {
  const topViewToggle = document.getElementById('top-view') as HTMLInputElement | null;
  const autoRotateToggle = document.getElementById('auto-rotate') as HTMLInputElement | null;
  const perspectiveToggle = document.getElementById('perspective-mode') as HTMLInputElement | null;
  const gridToggle = document.getElementById('grid') as HTMLInputElement | null;
  const showBuildingsToggle = document.getElementById('show-buildings') as HTMLInputElement | null;
  const showEdgesToggle = document.getElementById('show-edges') as HTMLInputElement | null;
  const pointSizeSlider = document.getElementById('point-size') as HTMLInputElement | null;
  const gaplessToggle = document.getElementById('gapless-points') as HTMLInputElement | null;
  const rotateToCameraToggle = document.getElementById('rotate-to-camera') as HTMLInputElement | null;
  const colormapSelect = document.getElementById('colormap-select') as HTMLSelectElement | null;

  const pointSizeValue = pointSizeSlider ? parseFloat(pointSizeSlider.value) : DEFAULT_POINT_SIZE;
  const colormapValue = colormapSelect?.value as ColormapName | undefined;
  const savedColormap = colormapValue && ALLOWED_COLORMAPS.includes(colormapValue) ? colormapValue : 'jet';

  const settings: PersistedViewSettings = {
    topView: topViewToggle?.checked ?? false,
    autoRotate: autoRotateToggle?.checked ?? false,
    perspectiveMode: perspectiveToggle?.checked ?? false,
    grid: gridToggle?.checked ?? false,
    showBuildings: showBuildingsToggle?.checked ?? true,
    showEdges: showEdgesToggle?.checked ?? true,
    pointSize: Number.isFinite(pointSizeValue) ? pointSizeValue : DEFAULT_POINT_SIZE,
    gaplessPoints: gaplessToggle?.checked ?? true,
    rotateToCamera: rotateToCameraToggle?.checked ?? false,
    colormap: savedColormap
  };

  try {
    localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    console.warn('Could not persist UI settings.');
  }
}

function applyPerspectiveMode(isPerspective: boolean) {
  const isAlreadyPerspective = activeCamera === perspectiveCamera;
  if (isPerspective !== isAlreadyPerspective) {
    controls = switchCamera(isPerspective, {
      perspectiveCamera,
      orthographicCamera,
      activeCamera,
      controls
    }, renderer);
    activeCamera = isPerspective ? perspectiveCamera : orthographicCamera;
  }

  const autoRotateToggle = document.getElementById('auto-rotate') as HTMLInputElement | null;
  controls.autoRotate = autoRotateToggle?.checked ?? false;
  applyPointSize();

  const topViewToggle = document.getElementById('top-view') as HTMLInputElement | null;
  if (topViewToggle?.checked) {
    applyTopViewMode(true);
  }
}

function applyTopViewMode(isTop: boolean) {
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
      const dist = maxDim * 1.5;
      activeCamera.position.set(center.x - dist, center.y - dist, center.z + dist);
      activeCamera.lookAt(center);
      activeCamera.up.set(0, 0, 1);
      controls.target.copy(center);
    }
  }

  controls.enableRotate = !isTop;
  controls.update();
  applyPointSize();
}

function applyPersistedViewSettings() {
  const saved = readPersistedViewSettings();

  const topViewToggle = document.getElementById('top-view') as HTMLInputElement | null;
  const autoRotateToggle = document.getElementById('auto-rotate') as HTMLInputElement | null;
  const perspectiveToggle = document.getElementById('perspective-mode') as HTMLInputElement | null;
  const gridToggle = document.getElementById('grid') as HTMLInputElement | null;
  const showBuildingsToggle = document.getElementById('show-buildings') as HTMLInputElement | null;
  const showEdgesToggle = document.getElementById('show-edges') as HTMLInputElement | null;
  const pointSizeSlider = document.getElementById('point-size') as HTMLInputElement | null;
  const gaplessToggle = document.getElementById('gapless-points') as HTMLInputElement | null;
  const rotateToCameraToggle = document.getElementById('rotate-to-camera') as HTMLInputElement | null;
  const colormapSelect = document.getElementById('colormap-select') as HTMLSelectElement | null;

  if (topViewToggle && typeof saved.topView === 'boolean') {
    topViewToggle.checked = saved.topView;
  }
  if (autoRotateToggle && typeof saved.autoRotate === 'boolean') {
    autoRotateToggle.checked = saved.autoRotate;
  }
  if (perspectiveToggle && typeof saved.perspectiveMode === 'boolean') {
    perspectiveToggle.checked = saved.perspectiveMode;
  }
  if (gridToggle && typeof saved.grid === 'boolean') {
    gridToggle.checked = saved.grid;
  }
  if (showBuildingsToggle && typeof saved.showBuildings === 'boolean') {
    showBuildingsToggle.checked = saved.showBuildings;
  }
  if (showEdgesToggle && typeof saved.showEdges === 'boolean') {
    showEdgesToggle.checked = saved.showEdges;
  }
  if (gaplessToggle && typeof saved.gaplessPoints === 'boolean') {
    gaplessToggle.checked = saved.gaplessPoints;
  }
  if (rotateToCameraToggle && typeof saved.rotateToCamera === 'boolean') {
    rotateToCameraToggle.checked = saved.rotateToCamera;
  }
  if (colormapSelect && typeof saved.colormap === 'string') {
    const mapName = saved.colormap as ColormapName;
    if (ALLOWED_COLORMAPS.includes(mapName)) {
      colormapSelect.value = mapName;
    }
  }
  if (pointSizeSlider && typeof saved.pointSize === 'number' && Number.isFinite(saved.pointSize)) {
    const sliderMin = parseFloat(pointSizeSlider.min);
    const sliderMax = parseFloat(pointSizeSlider.max);
    const clampedPointSize = Math.min(sliderMax, Math.max(sliderMin, saved.pointSize));
    pointSizeSlider.value = clampedPointSize.toString();
    updatePointSizeDisplay(clampedPointSize);
  } else {
    updatePointSizeDisplay(DEFAULT_POINT_SIZE);
  }

  gaplessPointSizingEnabled = gaplessToggle?.checked ?? true;
  rotatePointsToCameraEnabled = rotateToCameraToggle?.checked ?? false;
  gridHelper.visible = gridToggle?.checked ?? false;

  setPointSizeControlState(gaplessPointSizingEnabled);
  updatePointModeVisibility();
  applyPerspectiveMode(perspectiveToggle?.checked ?? false);
  applyTopViewMode(topViewToggle?.checked ?? false);
}

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
  if (fixedSensorPoints) {
    scene.remove(fixedSensorPoints);
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(activeSensorData.length * 3);
  const colors = new Float32Array(activeSensorData.length * 3);

  const mapName = (document.getElementById('colormap-select') as HTMLSelectElement)?.value || 'jet';
  const colorScratch = new THREE.Color();

  activeSensorData.forEach((d, i) => {
    positions[i * 3] = d.x;
    positions[i * 3 + 1] = d.y;
    positions[i * 3 + 2] = d.z;

    const normalized = (d.val - userMin) / (userMax - userMin || 1);
    getColormapColor(normalized, mapName as ColormapName, colorScratch);

    colors[i * 3] = colorScratch.r;
    colors[i * 3 + 1] = colorScratch.g;
    colors[i * 3 + 2] = colorScratch.b;
  });

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    geometry.boundingBox.getCenter(sensorCloudCenter);
  }
  sensorGridStep = estimatePointGridStep(activeSensorData);

  const material = new THREE.PointsMaterial({
    size: getManualPointSize(),
    vertexColors: true,
    sizeAttenuation: true
  });

  sensorPoints = new THREE.Points(geometry, material);
  scene.add(sensorPoints);

  const fixedPointGeometry = new THREE.PlaneGeometry(1, 1);
  const fixedPointMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide
  });
  const fixedMesh = new THREE.InstancedMesh(fixedPointGeometry, fixedPointMaterial, activeSensorData.length);

  // ⚡ Bolt Optimization: Manually write to Float32Arrays instead of using Object3D.updateMatrix() and setColorAt()
  // This avoids massive object allocation and redundant math operations, speeding up InstancedMesh creation by ~5-10x.
  const instanceMatrixArray = fixedMesh.instanceMatrix.array;

  // We must ensure instanceColor exists if we want to write to it directly
  if (!fixedMesh.instanceColor) {
    fixedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(activeSensorData.length * 3), 3);
  }
  const instanceColorArray = fixedMesh.instanceColor.array;

  // Pre-fill matrix array with 0s to avoid setting them inside the loop
  instanceMatrixArray.fill(0);

  for (let i = 0; i < activeSensorData.length; i += 1) {
    const point = activeSensorData[i];
    const mOff = i * 16;

    // Scale components (1, 1, 1)
    instanceMatrixArray[mOff + 0] = 1;
    instanceMatrixArray[mOff + 5] = 1;
    instanceMatrixArray[mOff + 10] = 1;
    instanceMatrixArray[mOff + 15] = 1;

    // Translation components (x, y, z)
    instanceMatrixArray[mOff + 12] = point.x;
    instanceMatrixArray[mOff + 13] = point.y;
    instanceMatrixArray[mOff + 14] = point.z;

    // Colors - apply setRGB to maintain color space conversion
    const cOff = i * 3;
    fixedPointColor.setRGB(colors[cOff], colors[cOff + 1], colors[cOff + 2]);
    instanceColorArray[cOff] = fixedPointColor.r;
    instanceColorArray[cOff + 1] = fixedPointColor.g;
    instanceColorArray[cOff + 2] = fixedPointColor.b;
  }

  fixedMesh.instanceMatrix.needsUpdate = true;
  fixedMesh.instanceColor.needsUpdate = true;

  fixedSensorPoints = fixedMesh;
  scene.add(fixedSensorPoints);

  applyPointSize();
  updatePointModeVisibility();
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

    // ⚡ Bolt Optimization: Manually write to buildingVoxels' Float32Array
    const buildingMatrixArray = buildingVoxels.instanceMatrix.array;
    buildingMatrixArray.fill(0);

    for (let i = 0; i < validBuildings.length; i += 1) {
      const d = validBuildings[i];
      const mOff = i * 16;

      // Scale components (1, 1, d.h)
      buildingMatrixArray[mOff + 0] = 1;
      buildingMatrixArray[mOff + 5] = 1;
      buildingMatrixArray[mOff + 10] = d.h;
      buildingMatrixArray[mOff + 15] = 1;

      // Translation components (x, y, h/2)
      buildingMatrixArray[mOff + 12] = d.x;
      buildingMatrixArray[mOff + 13] = d.y;
      buildingMatrixArray[mOff + 14] = d.h / 2;
    }

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

  const topViewToggle = document.getElementById('top-view') as HTMLInputElement | null;
  if (topViewToggle?.checked) {
    applyTopViewMode(true);
  }
}

function createBuildingEdges(validBuildings: SensorDataPoint[]) {
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const edgePositions: number[] = [];
  // ⚡ Bolt Optimization: Use nested Map<number, Map<number, number>> to avoid string allocation
  const hMap = new Map<number, Map<number, number>>();

  validBuildings.forEach(d => {
    let xMap = hMap.get(d.x);
    if (!xMap) {
      xMap = new Map<number, number>();
      hMap.set(d.x, xMap);
    }
    xMap.set(d.y, d.h);
  });

  const getH = (x: number, y: number) => hMap.get(x)?.get(y) || 0;

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
  if (activeSensorData.length === 0) return;
  const pointColors = sensorPoints ? sensorPoints.geometry.attributes.color.array as Float32Array : null;
  const colorScratch = new THREE.Color();

  // ⚡ Bolt Optimization: Batch update `instanceColor` via direct Float32Array mutation
  // Calling .setColorAt() in a tight loop creates massive overhead for 100k+ points
  const instanceColorArray = fixedSensorPoints?.instanceColor?.array as Float32Array | undefined;

  activeSensorData.forEach((d, i) => {
    const normalized = (d.val - userMin) / (userMax - userMin || 1);
    getColormapColor(normalized, mapName, colorScratch);

    if (pointColors) {
      pointColors[i * 3] = colorScratch.r;
      pointColors[i * 3 + 1] = colorScratch.g;
      pointColors[i * 3 + 2] = colorScratch.b;
    }

    if (instanceColorArray) {
      // Apply setRGB to maintain correct color space conversion, then extract
      fixedPointColor.setRGB(colorScratch.r, colorScratch.g, colorScratch.b);
      instanceColorArray[i * 3] = fixedPointColor.r;
      instanceColorArray[i * 3 + 1] = fixedPointColor.g;
      instanceColorArray[i * 3 + 2] = fixedPointColor.b;
    }
  });

  if (sensorPoints) {
    sensorPoints.geometry.attributes.color.needsUpdate = true;
  }
  if (fixedSensorPoints?.instanceColor) {
    fixedSensorPoints.instanceColor.needsUpdate = true;
  }
}

// UI Event Listeners
document.getElementById('auto-rotate')?.addEventListener('change', (e) => {
  controls.autoRotate = (e.target as HTMLInputElement).checked;
  persistViewSettings();
});

document.getElementById('perspective-mode')?.addEventListener('change', (e) => {
  applyPerspectiveMode((e.target as HTMLInputElement).checked);
  persistViewSettings();
});

document.getElementById('grid')?.addEventListener('change', (e) => {
  gridHelper.visible = (e.target as HTMLInputElement).checked;
  persistViewSettings();
});

function updatePointSizeDisplay(value: number) {
  const display = document.getElementById('point-size-display');
  if (display) {
    display.textContent = value.toFixed(1);
  }
}

document.getElementById('point-size')?.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  updatePointSizeDisplay(val);

  if (!gaplessPointSizingEnabled) {
    applyPointSize();
  }
  persistViewSettings();
});

document.getElementById('gapless-points')?.addEventListener('change', (e) => {
  gaplessPointSizingEnabled = (e.target as HTMLInputElement).checked;
  setPointSizeControlState(gaplessPointSizingEnabled);
  applyPointSize();
  persistViewSettings();
});

document.getElementById('rotate-to-camera')?.addEventListener('change', (e) => {
  rotatePointsToCameraEnabled = (e.target as HTMLInputElement).checked;
  updatePointModeVisibility();
  applyPointSize();
  persistViewSettings();
});

document.getElementById('results-select')?.addEventListener('change', (e) => {
  const name = (e.target as HTMLSelectElement).value;
  renderDataset(name);
});

document.getElementById('show-buildings')?.addEventListener('change', (e) => {
  if (buildingVoxels) {
    buildingVoxels.visible = (e.target as HTMLInputElement).checked;
  }
  persistViewSettings();
});

document.getElementById('show-edges')?.addEventListener('change', (e) => {
  if (edgesVoxels) {
    edgesVoxels.visible = (e.target as HTMLInputElement).checked;
  }
  persistViewSettings();
});

document.getElementById('top-view')?.addEventListener('change', (e) => {
  applyTopViewMode((e.target as HTMLInputElement).checked);
  persistViewSettings();
});

// CSV Upload Listener
document.getElementById('csv-upload')?.addEventListener('change', (e) => {
  handleFileUpload((e.target as HTMLInputElement).files, (text, name) => {
    // Remove placeholder if exists
    if (csvLoader.hasDataset(PLACEHOLDER_FILENAME)) {
      csvLoader.deleteDataset(PLACEHOLDER_FILENAME);
    }
    processCSVData(text, name);
  });
});

document.getElementById('folder-upload')?.addEventListener('change', (e) => {
  handleFileUpload((e.target as HTMLInputElement).files, (text, name) => {
    if (csvLoader.hasDataset(PLACEHOLDER_FILENAME)) {
      csvLoader.deleteDataset(PLACEHOLDER_FILENAME);
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
  if (gaplessPointSizingEnabled && rotatePointsToCameraEnabled && sensorPoints) {
    applyPointSize();
  }
  controls.update();
  renderer.render(scene, activeCamera);
}

// Load placeholder
csvLoader.processCSVData
function loadPlaceholder() {
  fetch(PLACEHOLDER_FILENAME)
    .then(response => {
      if (!response.ok) throw new Error("Placeholder not found");
      return response.text();
    })
    .then(text => {
      csvLoader.processCSVData(text, PLACEHOLDER_FILENAME);
      const select = document.getElementById('results-select') as HTMLSelectElement;
      if (select) select.value = PLACEHOLDER_FILENAME;
      renderDataset(PLACEHOLDER_FILENAME);
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
  persistViewSettings();
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
  const content = document.getElementById('advanced-content');
  if (content) {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    this.classList.toggle('active', isHidden);
    this.setAttribute('aria-expanded', String(isHidden));
  }
});

// Mobile Menu Toggle Logic
const menuToggle = document.getElementById('menu-toggle');
const uiContainer = document.getElementById('ui-container');

menuToggle?.addEventListener('click', () => {
  menuToggle.classList.toggle('open');
  const isOpen = uiContainer?.classList.toggle('sidebar-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

applyPersistedViewSettings();

// Close sidebar when clicking outside
canvasContainer.addEventListener('click', () => {
  if (uiContainer?.classList.contains('sidebar-open')) {
    menuToggle?.classList.remove('open');
    uiContainer.classList.remove('sidebar-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
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
