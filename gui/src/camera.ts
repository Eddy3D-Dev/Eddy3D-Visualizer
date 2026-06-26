import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface CameraSetup {
  perspectiveCamera: THREE.PerspectiveCamera;
  orthographicCamera: THREE.OrthographicCamera;
  activeCamera: THREE.Camera;
  controls: OrbitControls;
}

export function setupCameras(
  canvasContainer: HTMLElement,
  renderer: THREE.WebGLRenderer
): CameraSetup {
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

  let activeCamera: THREE.Camera = orthographicCamera;

  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D Canvas. Use arrow keys to pan, and press R to reset the view.');
  renderer.domElement.setAttribute('role', 'img');

  const controls = new OrbitControls(activeCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
  };
  controls.listenToKeyEvents(renderer.domElement);

  return {
    perspectiveCamera,
    orthographicCamera,
    activeCamera,
    controls
  };
}

export function switchCamera(
  isPerspective: boolean,
  cameras: CameraSetup,
  renderer: THREE.WebGLRenderer
): OrbitControls {
  const oldTarget = cameras.controls.target.clone();
  const oldCamPos = cameras.controls.object.position.clone();

  cameras.controls.dispose();

  if (isPerspective) {
    cameras.activeCamera = cameras.perspectiveCamera;
  } else {
    cameras.activeCamera = cameras.orthographicCamera;
  }

  const newControls = new OrbitControls(cameras.activeCamera, renderer.domElement);
  newControls.enableDamping = true;
  newControls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
  };
  newControls.listenToKeyEvents(renderer.domElement);
  newControls.target.copy(oldTarget);
  cameras.activeCamera.position.copy(oldCamPos);
  newControls.update();

  return newControls;
}

export function zoomToFit(
  cameras: CameraSetup,
  controls: OrbitControls,
  canvasContainer: HTMLElement,
  sensorPoints: THREE.Points | null,
  buildingVoxels: THREE.InstancedMesh | null,
  directionalLight?: THREE.DirectionalLight
) {
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
  cameras.perspectiveCamera.position.copy(camPos);
  cameras.perspectiveCamera.lookAt(center);
  cameras.perspectiveCamera.far = distance * 10;
  cameras.perspectiveCamera.updateProjectionMatrix();

  // Update Orthographic Camera
  const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  cameras.orthographicCamera.left = -maxDim * aspect;
  cameras.orthographicCamera.right = maxDim * aspect;
  cameras.orthographicCamera.top = maxDim;
  cameras.orthographicCamera.bottom = -maxDim;
  cameras.orthographicCamera.position.copy(camPos);
  cameras.orthographicCamera.lookAt(center);
  cameras.orthographicCamera.far = distance * 10;
  cameras.orthographicCamera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();

  // Adjust shadow camera to tightly fit the scene
  if (directionalLight) {
    const shadowCam = directionalLight.shadow.camera;
    shadowCam.left = -maxDim * 1.2;
    shadowCam.right = maxDim * 1.2;
    shadowCam.top = maxDim * 1.2;
    shadowCam.bottom = -maxDim * 1.2;
    shadowCam.updateProjectionMatrix();

    // Position light based on center
    directionalLight.position.set(center.x + maxDim, center.y - maxDim, center.z + maxDim * 1.5);
  }
}

export function updateCameraOnResize(
  cameras: CameraSetup,
  renderer: THREE.WebGLRenderer,
  canvasContainer: HTMLElement,
  sensorPoints: THREE.Points | null,
  buildingVoxels: THREE.InstancedMesh | null,
  zoomToFitFn: () => void
) {
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  const aspect = w / h;

  renderer.setSize(w, h);

  cameras.perspectiveCamera.aspect = aspect;
  cameras.perspectiveCamera.updateProjectionMatrix();

  const box = new THREE.Box3();
  if (sensorPoints && sensorPoints.visible) {
    box.expandByObject(sensorPoints);
  }
  if (buildingVoxels && buildingVoxels.visible) {
    box.expandByObject(buildingVoxels);
  }
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1000;

  cameras.orthographicCamera.left = -maxDim * aspect;
  cameras.orthographicCamera.right = maxDim * aspect;
  cameras.orthographicCamera.top = maxDim;
  cameras.orthographicCamera.bottom = -maxDim;
  cameras.orthographicCamera.updateProjectionMatrix();

  // Re-center view on resize
  zoomToFitFn();
}
