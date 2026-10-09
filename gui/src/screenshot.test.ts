import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { setCameraTopView, setCameraPerspective, updateDownloadButton } from './screenshot';
import type { ScreenshotConfig } from './screenshot';

describe('updateDownloadButton', () => {
  function makeBtn(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'download-screenshots';
    return btn;
  }

  it('disables button when datasetCount is 0', () => {
    const btn = makeBtn();
    updateDownloadButton(btn, 0);

    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);
    expect(btn.title).toBe('Upload a dataset to enable downloads');
  });

  it('enables button when datasetCount > 0', () => {
    const btn = makeBtn();
    updateDownloadButton(btn, 3);

    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(btn.title).toBe('Download screenshots for all datasets as a ZIP');
  });

  it('also toggles the dpi-select element if present', () => {
    const btn = makeBtn();
    const dpi = document.createElement('select');
    dpi.id = 'dpi-select';
    document.body.appendChild(dpi);

    updateDownloadButton(btn, 0);
    expect(dpi.disabled).toBe(true);

    updateDownloadButton(btn, 1);
    expect(dpi.disabled).toBe(false);

    document.body.removeChild(dpi);
  });
});

// Regression: the capture pipeline froze at "Capturing 1/1..." whenever the page
// was hidden or occluded, because setCameraTopView/setCameraPerspective resolved
// their promise inside a requestAnimationFrame callback — and browsers stop
// firing rAF on hidden pages. The helpers must settle without any animation
// frame ever being delivered.
describe('camera helpers on a hidden page (no animation frames ever fire)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeConfig(): ScreenshotConfig {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 2], 3)
    );
    const sensorPoints = new THREE.Points(geometry, new THREE.PointsMaterial());

    const perspectiveCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const controls = {
      target: new THREE.Vector3(),
      update: vi.fn(),
      enableRotate: true,
    } as unknown as ScreenshotConfig['controls'];

    return {
      canvasContainer: document.createElement('div'),
      renderer: {
        domElement: { width: 1000, height: 1000 },
        render: vi.fn(),
      } as unknown as ScreenshotConfig['renderer'],
      cameras: { perspectiveCamera, orthographicCamera, activeCamera: orthographicCamera, controls },
      controls,
      sensorPoints,
      buildingVoxels: null,
      loadedDatasets: new Map(),
      renderDataset: vi.fn(),
      zoomToFit: vi.fn(),
    };
  }

  /** Resolves 'settled' if the helper settles on its own, 'hung' if it is still
   *  pending after real timers have had a chance to run. */
  function raceAgainstHang(p: Promise<void>): Promise<string> {
    return Promise.race([
      p.then(() => 'settled'),
      new Promise<string>((r) => setTimeout(() => r('hung'), 250)),
    ]);
  }

  it('setCameraTopView settles even though rAF callbacks are never delivered', async () => {
    const rafSpy = vi.fn().mockReturnValue(1); // registers, never fires — hidden-page semantics
    vi.stubGlobal('requestAnimationFrame', rafSpy);

    const config = makeConfig();
    await expect(raceAgainstHang(setCameraTopView(config))).resolves.toBe('settled');
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('setCameraPerspective settles even though rAF callbacks are never delivered', async () => {
    const rafSpy = vi.fn().mockReturnValue(1);
    vi.stubGlobal('requestAnimationFrame', rafSpy);

    const config = makeConfig();
    await expect(raceAgainstHang(setCameraPerspective(config))).resolves.toBe('settled');
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('leaves all rendering to captureScreenshot (no stray render of an empty scene)', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));

    const config = makeConfig();
    await setCameraTopView(config);
    await setCameraPerspective(config);
    expect(config.renderer.render).not.toHaveBeenCalled();
  });

  it('still positions the cameras (the synchronous path does the camera math)', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));

    const config = makeConfig();
    await setCameraTopView(config);

    // Scene bbox is x:[0,10], y:[0,10], z:[0,2] → center (5,5,1); top view sits
    // above the center looking down.
    expect(config.cameras.orthographicCamera.position.z).toBeGreaterThan(1);
    expect(config.controls.target.x).toBeCloseTo(5);
    expect(config.controls.target.y).toBeCloseTo(5);
    expect(config.controls.update).toHaveBeenCalled();
  });
});
