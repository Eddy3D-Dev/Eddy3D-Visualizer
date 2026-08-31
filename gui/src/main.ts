import * as THREE from 'three';
import './style.css';

// Display version badge
const versionBadge = document.getElementById('version-badge');
if (versionBadge) {
  const version = (import.meta.env.VITE_APP_VERSION as string) || '';
  const branch = (import.meta.env.VITE_APP_BRANCH as string) || '';
  if (version) {
    const isDev = branch === 'dev' || version.includes('-dev');
    const labelClass = isDev ? 'label-dev' : 'label-main';
    const branchLabel = isDev ? 'dev' : 'main';
    versionBadge.innerHTML = `<span class="version-label ${labelClass}">${version} · ${branchLabel}</span>`;
  }
}
import { getColormapLUT, LUT_SIZE, type ColormapName } from './colormaps';
import { CSVLoader, updateResultsDropdown, handleFileUpload, type SensorDataPoint } from './csv-loader';
import {
  buildVelocityGrid,
  createParticleFlow,
  datasetHasVectors,
  type ParticleFlow,
  type VelocityGrid,
} from './particles';
import { createGpuParticleFlow } from './particles-gpu';
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

// Accessibility: Make canvas focusable for keyboard controls (OrbitControls)
renderer.domElement.id = 'webgl-canvas';
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', 'Interactive 3D Scene. Use arrow keys to pan, or press R to reset the view.');

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
let particleFlow: ParticleFlow | null = null;
/**
 * What the USER asked for, which is not the same as what the active dataset can do.
 * Kept separate so a dataset that cannot support particles disables the control without
 * destroying the choice, and so the choice — not the momentarily-unchecked checkbox — is
 * what gets persisted.
 */
let particlesRequested = false;
/** The active dataset's flow field, or null when it has none. Built once per dataset. */
let activeVelocityGrid: VelocityGrid | null = null;
/** Particles run only when the user asked AND the dataset can carry them. */
const particlesActive = () => particlesRequested && activeVelocityGrid !== null;
const particleClock = new THREE.Clock();
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
  particles: boolean;
  flowSpeed: number;
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
  // Further optimized to only update the x and y scale components, as translations and other scales never change after creation.
  const instanceMatrixArray = fixedSensorPoints.instanceMatrix.array;

  const len = activeSensorData.length;
  for (let i = 0; i < len; i += 1) {
    const mOff = i * 16;

    // Scale components (worldSize, worldSize, 1)
    instanceMatrixArray[mOff + 0] = worldSize;
    instanceMatrixArray[mOff + 5] = worldSize;
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
    colormap: savedColormap,
    // The request, NOT the live checkbox: the checkbox is unchecked while a dataset that
    // cannot support particles is displayed, and persisting that would let any unrelated
    // control change silently discard the user's setting.
    particles: particlesRequested,
    flowSpeed: getFlowSpeedMultiplier()
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

  if (typeof saved.particles === 'boolean') {
    // Into the REQUEST; updateParticleControls decides whether the active dataset can
    // honour it and sets the checkbox accordingly.
    particlesRequested = saved.particles;
  }
  const flowSpeedSlider = document.getElementById('flow-speed') as HTMLInputElement | null;
  if (flowSpeedSlider && typeof saved.flowSpeed === 'number' && Number.isFinite(saved.flowSpeed)) {
    const clamped = Math.min(parseFloat(flowSpeedSlider.max), Math.max(parseFloat(flowSpeedSlider.min), saved.flowSpeed));
    flowSpeedSlider.value = clamped.toString();
    const flowDisplay = document.getElementById('flow-speed-display');
    if (flowDisplay) flowDisplay.textContent = clamped.toFixed(1);
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
    updateEmptyStateUI();
  },
  (msg) => showToast(msg, true)
);

export function showToast(message: string, isError = false) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;

  // Accessibility enhancements
  toast.setAttribute('role', isError ? 'alert' : 'status');
  toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');

  // Visual enhancement: Icon
  const iconWrapper = document.createElement('span');
  iconWrapper.className = 'toast-icon';
  iconWrapper.setAttribute('aria-hidden', 'true');

  // Inject SVG depending on type
  if (isError) {
    // Alert/Warning icon
    iconWrapper.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  } else {
    // Info icon
    iconWrapper.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  // Text container
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  textSpan.className = 'toast-message';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Close notification');
  closeBtn.title = 'Close notification';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  const removeToast = () => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn.addEventListener('click', removeToast);

  toast.appendChild(iconWrapper);
  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  let timeoutId = setTimeout(removeToast, 4000);

  const pauseTimer = () => clearTimeout(timeoutId);
  const resumeTimer = () => {
    clearTimeout(timeoutId); // Ensure we don't start multiple timers
    timeoutId = setTimeout(removeToast, 4000);
  };

  // Pause timer on hover/focus for better accessibility
  toast.addEventListener('mouseenter', pauseTimer);
  toast.addEventListener('focusin', pauseTimer);

  // Resume timer when interaction ceases
  toast.addEventListener('mouseleave', resumeTimer);
  toast.addEventListener('focusout', resumeTimer);
}

function updateEmptyStateUI() {
  const emptyState = document.getElementById('empty-state');
  const canvasContainer = document.getElementById('canvas-container');
  if (emptyState && canvasContainer) {
    const hasData = csvLoader.getDatasetCount() > 0;

    // Check if the currently focused element is inside the empty state before hiding it
    const emptyStateHasFocus = emptyState.contains(document.activeElement);

    emptyState.style.display = hasData ? 'none' : 'flex';
    if (hasData) {
      canvasContainer.classList.add('has-data');

      // If focus was inside the empty state, move it to the canvas itself to prevent focus drop to body and instantly enable keyboard controls
      if (emptyStateHasFocus) {
        renderer.domElement.focus();
      }
    } else {
      canvasContainer.classList.remove('has-data');
    }
  }
}

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

  // Update document title for better wayfinding and screen reader context
  if (name === PLACEHOLDER_FILENAME) {
    document.title = 'Eddy3D Visualiser';
  } else {
    document.title = `${name} - Eddy3D Visualiser`;
  }

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
  const refLen = referenceData.length;
  // ⚡ Bolt Optimization: Use explicit for loop instead of forEach to reduce GC pressure
  for (let i = 0; i < refLen; i++) {
    const d = referenceData[i];
    if (d.val < minVal) minVal = d.val;
    if (d.val > maxVal) maxVal = d.val;
  }
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
    minSlider.disabled = false;
    minSlider.title = "Set the minimum value for the colormap scale";
    const minWrapper = minSlider.closest('.toggle-item');
    if (minWrapper) minWrapper.setAttribute('title', "Set the minimum value for the colormap scale");

    maxSlider.min = sliderMin.toString();
    maxSlider.max = sliderMax.toString();
    maxSlider.step = step.toString();
    maxSlider.value = "1";
    maxSlider.disabled = false;
    maxSlider.title = "Set the maximum value for the colormap scale";
    const maxWrapper = maxSlider.closest('.toggle-item');
    if (maxWrapper) maxWrapper.setAttribute('title', "Set the maximum value for the colormap scale");

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

  // ⚡ Bolt Optimization: Look up the raw Float32Array LUT once to avoid instantiating/updating THREE.Color per point
  const lut = getColormapLUT(mapName as ColormapName);
  const dataLen = activeSensorData.length;
  const valRange = userMax - userMin || 1;

  // ⚡ Bolt Optimization: Pre-calculate scaling factor and use bitwise OR for integer truncation instead of Math.floor.
  const scale = (LUT_SIZE - 1) / valRange;
  const maxLut = LUT_SIZE - 1;

  for (let i = 0; i < dataLen; i++) {
    const d = activeSensorData[i];
    const i3 = i * 3;
    positions[i3] = d.x;
    positions[i3 + 1] = d.y;
    positions[i3 + 2] = d.z;

    const norm = (d.val - userMin) * scale;
    const lutIdx = (Math.max(0, Math.min(maxLut, norm)) | 0) * 3;

    colors[i3] = lut[lutIdx];
    colors[i3 + 1] = lut[lutIdx + 1];
    colors[i3 + 2] = lut[lutIdx + 2];
  }

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

    // ⚡ Bolt Optimization: Use already converted linear values from `colors` array
    const cOff = i * 3;
    instanceColorArray[cOff] = colors[cOff];
    instanceColorArray[cOff + 1] = colors[cOff + 1];
    instanceColorArray[cOff + 2] = colors[cOff + 2];
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

  // ⚡ Bolt Optimization: Use explicit for loop with push instead of filter
  const validBuildings: typeof activeSensorData = [];
  const activeLen = activeSensorData.length;
  for (let i = 0; i < activeLen; i++) {
    if (activeSensorData[i].h > 0) {
      validBuildings.push(activeSensorData[i]);
    }
  }
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

  updateParticleControls();
  rebuildParticleFlow();
}

function createBuildingEdges(validBuildings: SensorDataPoint[]) {
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const edgePositions: number[] = [];
  // ⚡ Bolt Optimization: Use nested Map<number, Map<number, number>> to avoid string allocation
  const hMap = new Map<number, Map<number, number>>();

  const validBuildingsLen = validBuildings.length;
  // ⚡ Bolt Optimization: Use explicit for loops instead of forEach
  for (let i = 0; i < validBuildingsLen; i++) {
    const d = validBuildings[i];
    let xMap = hMap.get(d.x);
    if (!xMap) {
      xMap = new Map<number, number>();
      hMap.set(d.x, xMap);
    }
    xMap.set(d.y, d.h);
  }

  const getH = (x: number, y: number) => hMap.get(x)?.get(y) || 0;

  for (let i = 0; i < validBuildingsLen; i++) {
    const d = validBuildings[i];
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
  }

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

  // ⚡ Bolt Optimization: Batch update `instanceColor` via direct Float32Array mutation
  // Calling .setColorAt() in a tight loop creates massive overhead for 100k+ points
  const instanceColorArray = fixedSensorPoints?.instanceColor?.array as Float32Array | undefined;

  const lut = getColormapLUT(mapName);
  const dataLen = activeSensorData.length;
  const valRange = userMax - userMin || 1;

  // ⚡ Bolt Optimization: Pre-calculate scaling factor and hoist conditionals out of the hot loop
  const scale = (LUT_SIZE - 1) / valRange;
  const maxLut = LUT_SIZE - 1;

  if (pointColors && instanceColorArray) {
    for (let i = 0; i < dataLen; i++) {
      const norm = (activeSensorData[i].val - userMin) * scale;
      const lutIdx = (Math.max(0, Math.min(maxLut, norm)) | 0) * 3;
      const r = lut[lutIdx];
      const g = lut[lutIdx + 1];
      const b = lut[lutIdx + 2];
      const i3 = i * 3;

      pointColors[i3] = r;
      pointColors[i3 + 1] = g;
      pointColors[i3 + 2] = b;

      instanceColorArray[i3] = r;
      instanceColorArray[i3 + 1] = g;
      instanceColorArray[i3 + 2] = b;
    }
  } else if (pointColors) {
    for (let i = 0; i < dataLen; i++) {
      const norm = (activeSensorData[i].val - userMin) * scale;
      const lutIdx = (Math.max(0, Math.min(maxLut, norm)) | 0) * 3;
      const r = lut[lutIdx];
      const g = lut[lutIdx + 1];
      const b = lut[lutIdx + 2];
      const i3 = i * 3;

      pointColors[i3] = r;
      pointColors[i3 + 1] = g;
      pointColors[i3 + 2] = b;
    }
  } else if (instanceColorArray) {
    for (let i = 0; i < dataLen; i++) {
      const norm = (activeSensorData[i].val - userMin) * scale;
      const lutIdx = (Math.max(0, Math.min(maxLut, norm)) | 0) * 3;
      const r = lut[lutIdx];
      const g = lut[lutIdx + 1];
      const b = lut[lutIdx + 2];
      const i3 = i * 3;

      instanceColorArray[i3] = r;
      instanceColorArray[i3 + 1] = g;
      instanceColorArray[i3 + 2] = b;
    }
  }

  if (sensorPoints) {
    sensorPoints.geometry.attributes.color.needsUpdate = true;
  }
  if (fixedSensorPoints?.instanceColor) {
    fixedSensorPoints.instanceColor.needsUpdate = true;
  }
}

// --- Particle flow (animated wind particles over the velocity field) ---

/**
 * Whether particles CAN run on the active dataset, and why not when they cannot.
 *
 * Carrying U_x/U_y is necessary but not sufficient: buildVelocityGrid also refuses a
 * single probe transect (it needs two rows to interpolate across), a dataset whose
 * sampled cells all sit inside building footprints, and a field that averages to a dead
 * stop. Gating the toggle on the vectors alone left it switched ON with nothing drawn
 * and nothing said — the same "quietly degraded looks exactly like working" state the
 * GPU/CPU badge exists to prevent, one step earlier.
 */
function describeParticleSupport(): { grid: VelocityGrid | null; reason: string } {
  if (activeSensorData.length === 0) return { grid: null, reason: 'Upload a dataset first' };
  if (!datasetHasVectors(activeSensorData)) {
    return {
      grid: null,
      reason: 'Animate wind particles through the velocity field (needs a CSV with U_x/U_y '
        + 'columns — re-export with the current Export to Visualizer component)',
    };
  }
  const grid = buildVelocityGrid(activeSensorData, sensorGridStep);
  if (!grid) {
    return {
      grid: null,
      reason: 'This dataset has velocity vectors but no usable flow field — the points do not '
        + 'form a grid at least two rows deep, or every sampled cell is inside a building.',
    };
  }
  return { grid, reason: 'Animate wind particles through the velocity field' };
}

/**
 * Re-derives the control state for the active dataset. The user's REQUEST
 * (`particlesRequested`) survives a dataset that cannot honour it: the checkbox is
 * rebuilt from the request each time, so switching to a legacy CSV and back restores the
 * animation instead of silently discarding the choice — and, because the request rather
 * than the live checkbox is what gets persisted, an unrelated control change while a
 * legacy CSV is displayed no longer overwrites it.
 */
function updateParticleControls() {
  const control = document.getElementById('particles-control');
  const toggle = document.getElementById('particles') as HTMLInputElement | null;
  const { grid, reason } = describeParticleSupport();
  activeVelocityGrid = grid;
  const supported = grid !== null;

  if (toggle) {
    toggle.disabled = !supported;
    toggle.checked = supported && particlesRequested;
  }
  if (control) {
    control.classList.toggle('disabled', !supported);
    control.setAttribute('title', reason);
    toggle?.setAttribute('title', reason);
  }
  updateFlowSpeedControlState();
}

function updateFlowSpeedControlState() {
  const control = document.getElementById('flow-speed-control');
  const slider = document.getElementById('flow-speed') as HTMLInputElement | null;
  const active = particlesActive();
  if (slider) slider.disabled = !active;
  if (control) {
    control.classList.toggle('disabled', !active);
    control.setAttribute('title', active
      ? 'Animation pace multiplier (1 = default)'
      : "Enable 'Particles' to adjust the animation pace");
  }
}

function getFlowSpeedMultiplier(): number {
  const slider = document.getElementById('flow-speed') as HTMLInputElement | null;
  const v = slider ? parseFloat(slider.value) : 1;
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * (Re)creates the particle system for the active dataset — one grid binning pass, then
 * the GPU integrator, falling back to the CPU one on a device without float render
 * targets. Which backend won is reported on the control, never assumed.
 */
function rebuildParticleFlow() {
  if (particleFlow) {
    scene.remove(particleFlow.object);
    particleFlow.dispose();
    particleFlow = null;
  }
  updateParticleBackendLabel(null);
  // The grid was already built (and its absence already explained on the control) by
  // updateParticleControls, so there is no second, silent refusal hiding here.
  const grid = activeVelocityGrid;
  if (!particlesActive() || !grid) return;

  particleFlow = createGpuParticleFlow(grid, renderer) ?? createParticleFlow(grid);
  scene.add(particleFlow.object);
  updateParticleBackendLabel(particleFlow);
  particleClock.getDelta(); // swallow the idle time so the first step is a normal frame
}

/**
 * Says which integrator is running, next to the toggle. Not decoration: a GPU path that
 * quietly degraded to the CPU one is indistinguishable from a working GPU path, so the
 * fact is surfaced where a user (and the browser check) can read it.
 */
function updateParticleBackendLabel(flow: ParticleFlow | null) {
  const badge = document.getElementById('particles-backend');
  if (!badge) return;
  if (!flow) {
    badge.textContent = '';
    badge.removeAttribute('data-backend');
    return;
  }
  badge.textContent = flow.backend === 'gpu' ? 'GPU' : 'CPU';
  badge.setAttribute('data-backend', flow.backend);
  badge.title = flow.backend === 'gpu'
    ? `${flow.particleCount.toLocaleString()} particles advected on the GPU`
    : `${flow.particleCount.toLocaleString()} particles advected on the CPU `
      + '(this device has no float render targets for the GPU path)';
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

document.getElementById('particles')?.addEventListener('change', (e) => {
  particlesRequested = (e.target as HTMLInputElement).checked;
  updateFlowSpeedControlState();
  rebuildParticleFlow();
  persistViewSettings();
});

document.getElementById('flow-speed')?.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  const display = document.getElementById('flow-speed-display');
  if (display && Number.isFinite(val)) display.textContent = val.toFixed(1);
  persistViewSettings();
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

// Shared File Upload Handler
const handleFiles = (files: FileList | null) => {
  handleFileUpload(files, (text, name) => {
    // Remove placeholder if exists
    if (csvLoader.hasDataset(PLACEHOLDER_FILENAME)) {
      csvLoader.deleteDataset(PLACEHOLDER_FILENAME);
    }
    processCSVData(text, name);
  }, (msg) => showToast(msg, true));
};

// Helper to clear input value after selection so the same file can be re-uploaded
const handleFileInputChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  handleFiles(input.files);
  input.value = ''; // Reset value to allow selecting the same file again
};

// CSV Upload Listener
document.getElementById('csv-upload')?.addEventListener('change', handleFileInputChange);

document.getElementById('empty-csv-upload')?.addEventListener('change', handleFileInputChange);

// Drag and Drop Logic
let dragCounter = 0;
window.addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  canvasContainer.classList.add('drag-over');
});

window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  dragCounter++;
  canvasContainer.classList.add('drag-over');
});

window.addEventListener('dragleave', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    canvasContainer.classList.remove('drag-over');
  }
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  canvasContainer.classList.remove('drag-over');

  if (e.dataTransfer && e.dataTransfer.files) {
    handleFiles(e.dataTransfer.files);
  }
});

document.getElementById('folder-upload')?.addEventListener('change', handleFileInputChange);

document.getElementById('empty-folder-upload')?.addEventListener('change', handleFileInputChange);

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
  if (particleFlow) {
    // Contained: the overlay must never take the camera and the render loop down with
    // it. An uncaught throw here would end animate() itself — frozen particles AND dead
    // orbit controls, which reads as "the whole app broke" when only the overlay did.
    try {
      particleFlow.step(particleClock.getDelta(), getFlowSpeedMultiplier());
    } catch (err) {
      console.error('Eddy3D: particle overlay failed and was removed —', err);
      scene.remove(particleFlow.object);
      try { particleFlow.dispose(); } catch { /* already broken */ }
      particleFlow = null;
      updateParticleBackendLabel(null);
    }
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
      updateEmptyStateUI();
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
    const isHidden = !content.classList.contains('open');
    content.classList.toggle('open');
    this.classList.toggle('active', isHidden);
    this.setAttribute('aria-expanded', String(isHidden));
    const label = isHidden ? 'Hide advanced settings' : 'Show advanced settings';
    this.setAttribute('title', label);
    this.setAttribute('aria-label', label);
  }
});

// Mobile Menu Toggle Logic
const menuToggle = document.getElementById('menu-toggle');
const uiContainer = document.getElementById('ui-container');

menuToggle?.addEventListener('click', () => {
  menuToggle.classList.toggle('open');
  const isOpen = uiContainer?.classList.toggle('sidebar-open');
  const label = isOpen ? 'Close Sidebar' : 'Open Sidebar';
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('title', label);
  menuToggle.setAttribute('aria-label', label);
});

applyPersistedViewSettings();

const closeSidebar = (returnFocus = false) => {
  if (uiContainer?.classList.contains('sidebar-open')) {
    menuToggle?.classList.remove('open');
    uiContainer.classList.remove('sidebar-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('title', 'Open Sidebar');
    menuToggle?.setAttribute('aria-label', 'Open Sidebar');
    if (returnFocus) menuToggle?.focus();
  }
};

// Close sidebar when clicking outside
canvasContainer.addEventListener('click', () => closeSidebar(false));

// Close sidebar on Escape key and handle R shortcut
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSidebar(true);
  } else if (e.key === 'r' || e.key === 'R') {
    if (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type !== 'range') return;
    zoomToFit({ perspectiveCamera, orthographicCamera, activeCamera, controls }, controls, canvasContainer, sensorPoints, buildingVoxels, directionalLight);
  }
});

// Screenshot download
document.getElementById('download-screenshots')?.addEventListener('click', () => {
  const downloadBtn = document.getElementById('download-screenshots') as HTMLButtonElement;
  if (downloadBtn.getAttribute('aria-disabled') === 'true') return;

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
