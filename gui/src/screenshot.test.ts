import { describe, it, expect } from 'vitest';
import { updateDownloadButton } from './screenshot';

describe('updateDownloadButton', () => {
  function makeBtn(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'download-screenshots';
    return btn;
  }

  it('disables button when datasetCount is 0', () => {
    const btn = makeBtn();
    updateDownloadButton(btn, 0);

    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Upload a dataset to enable downloads');
  });

  it('enables button when datasetCount > 0', () => {
    const btn = makeBtn();
    updateDownloadButton(btn, 3);

    expect(btn.disabled).toBe(false);
    expect(btn.title).toBe('Download screenshots');
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
