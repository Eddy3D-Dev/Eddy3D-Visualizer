import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { CameraSetup } from './camera';
import type { SensorDataPoint } from './csv-loader';

export interface ScreenshotConfig {
  canvasContainer: HTMLElement;
  renderer: THREE.WebGLRenderer;
  cameras: CameraSetup;
  controls: OrbitControls;
  sensorPoints: THREE.Points | null;
  buildingVoxels: THREE.InstancedMesh | null;
  loadedDatasets: Map<string, SensorDataPoint[]>;
  renderDataset: (name: string) => void;
  zoomToFit: () => void;
}

// Helper: Position camera for Top View with tight zoom
export function setCameraTopView(config: ScreenshotConfig): Promise<void> {
  return new Promise((resolve) => {
    const { renderer, cameras, controls, sensorPoints, buildingVoxels } = config;
    const box = new THREE.Box3();
    if (sensorPoints) box.expandByObject(sensorPoints);
    if (buildingVoxels) box.expandByObject(buildingVoxels);

    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxZ = Math.max(size.z, 10);

      // Position camera directly above, looking down
      cameras.activeCamera.position.set(center.x, center.y - 0.001, center.z + maxZ * 3);
      cameras.activeCamera.lookAt(center);
      cameras.activeCamera.up.set(0, 0, 1);
      controls.target.copy(center);
      controls.enableRotate = false;
      controls.update();

      // Tight zoom: use actual scene width/height for orthographic bounds
      const aspect = renderer.domElement.width / renderer.domElement.height;
      const sceneWidth = size.x;
      const sceneHeight = size.y;
      const padding = 1.2; // 20% padding

      // Determine which dimension to fit
      const fitWidth = sceneWidth / aspect;
      const fitHeight = sceneHeight;
      const fitDim = Math.max(fitWidth, fitHeight) * padding;

      cameras.orthographicCamera.left = -fitDim * aspect / 2;
      cameras.orthographicCamera.right = fitDim * aspect / 2;
      cameras.orthographicCamera.top = fitDim / 2;
      cameras.orthographicCamera.bottom = -fitDim / 2;
      cameras.orthographicCamera.position.set(center.x, center.y - 0.001, center.z + maxZ * 3);
      cameras.orthographicCamera.lookAt(center);
      cameras.orthographicCamera.updateProjectionMatrix();

      // Also update perspective camera if that's active
      if (cameras.activeCamera instanceof THREE.PerspectiveCamera) {
        const dist = Math.max(sceneWidth, sceneHeight) * 1.2;
        cameras.activeCamera.position.set(center.x, center.y - 0.001, center.z + dist);
        cameras.activeCamera.lookAt(center);
        cameras.activeCamera.updateProjectionMatrix();
      }
    }

    // Wait for render to complete
    requestAnimationFrame(() => {
      renderer.render(config.cameras.activeCamera.userData.scene || new THREE.Scene(), config.cameras.activeCamera);
      resolve();
    });
  });
}

// Helper: Position camera for Perspective (Isometric) View with tight zoom
export function setCameraPerspective(config: ScreenshotConfig): Promise<void> {
  return new Promise((resolve) => {
    const { renderer, cameras, controls, sensorPoints, buildingVoxels } = config;
    const box = new THREE.Box3();
    if (sensorPoints) box.expandByObject(sensorPoints);
    if (buildingVoxels) box.expandByObject(buildingVoxels);

    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      // Use half of maxDim for tighter framing in isometric view
      const sceneSize = Math.max(size.x, size.y) * 0.5;

      // Position camera at isometric angle - closer
      const dist = sceneSize * 1.5;
      cameras.activeCamera.position.set(center.x - dist, center.y - dist, center.z + dist * 0.7);
      cameras.activeCamera.lookAt(center);
      cameras.activeCamera.up.set(0, 0, 1);
      controls.target.copy(center);
      controls.enableRotate = true;
      controls.update();

      // Tight zoom for orthographic camera - use sceneSize not maxDim
      const aspect = renderer.domElement.width / renderer.domElement.height;
      const padding = 1.2; // 20% padding

      cameras.orthographicCamera.left = -sceneSize * aspect * padding;
      cameras.orthographicCamera.right = sceneSize * aspect * padding;
      cameras.orthographicCamera.top = sceneSize * padding;
      cameras.orthographicCamera.bottom = -sceneSize * padding;
      cameras.orthographicCamera.position.set(center.x - dist, center.y - dist, center.z + dist * 0.7);
      cameras.orthographicCamera.lookAt(center);
      cameras.orthographicCamera.updateProjectionMatrix();

      // Also update perspective camera
      if (cameras.activeCamera instanceof THREE.PerspectiveCamera) {
        cameras.activeCamera.updateProjectionMatrix();
      }
    }

    // Wait for render to complete
    requestAnimationFrame(() => {
      renderer.render(config.cameras.activeCamera.userData.scene || new THREE.Scene(), config.cameras.activeCamera);
      resolve();
    });
  });
}

// Helper: Capture current canvas as blob
export function captureScreenshot(renderer: THREE.WebGLRenderer, activeCamera: THREE.Camera, scene: THREE.Scene): Promise<Blob> {
  return new Promise((resolve, reject) => {
    renderer.render(scene, activeCamera);
    renderer.domElement.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to capture screenshot'));
      }
    }, 'image/png');
  });
}

// Helper to merge two blobs side by side
async function mergeImagesSideBySide(leftBlob: Blob, rightBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const leftImg = new Image();
    const rightImg = new Image();
    let loadedCount = 0;

    const onLoad = () => {
      loadedCount++;
      if (loadedCount === 2) {
        const canvas = document.createElement('canvas');
        canvas.width = leftImg.width + rightImg.width;
        canvas.height = Math.max(leftImg.height, rightImg.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.fillStyle = '#f1f5f9'; // Background color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(leftImg, 0, 0);
        ctx.drawImage(rightImg, leftImg.width, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create merged image'));
        }, 'image/png');
      }
    };

    leftImg.onload = onLoad;
    rightImg.onload = onLoad;
    leftImg.onerror = () => reject(new Error('Failed to load left image'));
    rightImg.onerror = () => reject(new Error('Failed to load right image'));

    leftImg.src = URL.createObjectURL(leftBlob);
    rightImg.src = URL.createObjectURL(rightBlob);
  });
}

interface DatasetPair {
  base: string;
  pred: string | null;
  outputName: string;
}

// Main function: Capture all screenshots and create ZIP
export async function captureAllScreenshots(
  config: ScreenshotConfig,
  scene: THREE.Scene,
  downloadBtn: HTMLButtonElement,
  dpiSelect: HTMLSelectElement,
  originalWidth: number,
  originalHeight: number,
  originalPixelRatio: number
) {
  const originalText = downloadBtn.textContent;

  // Get selected resolution (multiply by 10 to get actual pixels: 100->1000, 150->1500, 300->3000)
  const targetSize = parseInt(dpiSelect.value) * 10;

  try {
    downloadBtn.classList.add('loading');
    downloadBtn.textContent = 'Capturing...';
    downloadBtn.disabled = true;

    // Set pixel ratio to 1 for consistent output size
    config.renderer.setPixelRatio(1);

    // Resize renderer to target resolution (square for consistent output)
    config.renderer.setSize(targetSize, targetSize);

    const zip = new JSZip();
    const topViewFolder = zip.folder('Top View');
    const perspectiveFolder = zip.folder('Perspective');

    if (!topViewFolder || !perspectiveFolder) {
      throw new Error('Failed to create ZIP folders');
    }

    const datasetNames = Array.from(config.loadedDatasets.keys());

    // Identify paired files (base + _pred)
    const processedNames = new Set<string>();
    const pairs: DatasetPair[] = [];

    for (const name of datasetNames) {
      if (processedNames.has(name)) continue;

      const baseName = name.replace(/\.csv$/i, '');

      // Check if this is a _pred file
      if (baseName.endsWith('_pred')) {
        const originalBaseName = baseName.slice(0, -5); // Remove '_pred'
        const originalName = `${originalBaseName}.csv`;

        // Check if original exists
        if (config.loadedDatasets.has(originalName)) {
          // Will be handled when we process the original
          continue;
        } else {
          // Standalone _pred file
          pairs.push({ base: name, pred: null, outputName: baseName });
          processedNames.add(name);
        }
      } else {
        // Check if _pred version exists
        const predName = `${baseName}_pred.csv`;
        if (config.loadedDatasets.has(predName)) {
          pairs.push({ base: name, pred: predName, outputName: baseName });
          processedNames.add(name);
          processedNames.add(predName);
        } else {
          // Standalone file
          pairs.push({ base: name, pred: null, outputName: baseName });
          processedNames.add(name);
        }
      }
    }

    const total = pairs.length;

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      downloadBtn.textContent = `Capturing ${i + 1}/${total}...`;

      if (pair.pred) {
        // === PAIRED FILES: Capture both and merge ===

        // Capture base - Top View
        config.renderDataset(pair.base);
        await new Promise(r => setTimeout(r, 100));
        await setCameraTopView(config);
        await new Promise(r => setTimeout(r, 50));
        const baseTopBlob = await captureScreenshot(config.renderer, config.cameras.activeCamera, scene);

        // Capture pred - Top View
        config.renderDataset(pair.pred);
        await new Promise(r => setTimeout(r, 100));
        await setCameraTopView(config);
        await new Promise(r => setTimeout(r, 50));
        const predTopBlob = await captureScreenshot(config.renderer, config.cameras.activeCamera, scene);

        // Merge Top Views side by side
        const mergedTopBlob = await mergeImagesSideBySide(baseTopBlob, predTopBlob);
        topViewFolder.file(`${pair.outputName}_comparison.png`, mergedTopBlob);

        // Capture base - Perspective
        config.renderDataset(pair.base);
        await new Promise(r => setTimeout(r, 100));
        await setCameraPerspective(config);
        await new Promise(r => setTimeout(r, 50));
        const basePerspBlob = await captureScreenshot(config.renderer, config.cameras.activeCamera, scene);

        // Capture pred - Perspective
        config.renderDataset(pair.pred);
        await new Promise(r => setTimeout(r, 100));
        await setCameraPerspective(config);
        await new Promise(r => setTimeout(r, 50));
        const predPerspBlob = await captureScreenshot(config.renderer, config.cameras.activeCamera, scene);

        // Merge Perspective Views side by side
        const mergedPerspBlob = await mergeImagesSideBySide(basePerspBlob, predPerspBlob);
        perspectiveFolder.file(`${pair.outputName}_comparison.png`, mergedPerspBlob);

      } else {
        // === SINGLE FILE: Capture as before ===
        config.renderDataset(pair.base);
        await new Promise(r => setTimeout(r, 100));

        // Capture Top View
        await setCameraTopView(config);
        await new Promise(r => setTimeout(r, 50));
        const topViewBlob = await captureScreenshot(config.renderer, config.cameras.activeCamera, scene);
        topViewFolder.file(`${pair.outputName}.png`, topViewBlob);

        // Capture Perspective View
        await setCameraPerspective(config);
        await new Promise(r => setTimeout(r, 50));
        const perspectiveBlob = await captureScreenshot(config.renderer, config.cameras.activeCamera, scene);
        perspectiveFolder.file(`${pair.outputName}.png`, perspectiveBlob);
      }
    }

    downloadBtn.textContent = 'Creating ZIP...';

    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, 'screenshots.zip');

    // Restore original canvas size and pixel ratio
    config.renderer.setPixelRatio(originalPixelRatio);
    config.renderer.setSize(originalWidth, originalHeight);
    config.zoomToFit();

    downloadBtn.textContent = '✓ Downloaded!';
    setTimeout(() => {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
      downloadBtn.classList.remove('loading');
    }, 2000);

  } catch (error) {
    console.error('Screenshot capture failed:', error);

    // Restore original canvas size and pixel ratio on error
    config.renderer.setPixelRatio(originalPixelRatio);
    config.renderer.setSize(originalWidth, originalHeight);
    config.zoomToFit();

    downloadBtn.textContent = '✗ Failed';
    setTimeout(() => {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
      downloadBtn.classList.remove('loading');
    }, 2000);
  }
}

export function updateDownloadButton(downloadBtn: HTMLButtonElement, datasetCount: number) {
  downloadBtn.disabled = datasetCount === 0;
}
