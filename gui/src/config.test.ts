import { describe, it, expect } from 'vitest';
import {
  PLACEHOLDER_FILENAME,
  SCENE_BACKGROUND_COLOR,
  DEFAULT_POINT_SIZE,
  GAPLESS_POINT_SIZE_FALLBACK,
  GAPLESS_POINT_SIZE_PADDING,
  FIXED_POINT_SIZE_BASE_RATIO,
  FIXED_POINT_GAPLESS_PADDING,
  VIEW_SETTINGS_STORAGE_KEY,
  ALLOWED_COLORMAPS,
} from './config';

describe('config constants', () => {
  it('PLACEHOLDER_FILENAME is a .csv string', () => {
    expect(PLACEHOLDER_FILENAME).toMatch(/\.csv$/);
  });

  it('SCENE_BACKGROUND_COLOR is a valid hex color number', () => {
    expect(typeof SCENE_BACKGROUND_COLOR).toBe('number');
    expect(SCENE_BACKGROUND_COLOR).toBeGreaterThanOrEqual(0);
    expect(SCENE_BACKGROUND_COLOR).toBeLessThanOrEqual(0xffffff);
  });

  it('point size constants are positive numbers', () => {
    expect(DEFAULT_POINT_SIZE).toBeGreaterThan(0);
    expect(GAPLESS_POINT_SIZE_FALLBACK).toBeGreaterThan(0);
    expect(GAPLESS_POINT_SIZE_PADDING).toBeGreaterThan(0);
    expect(FIXED_POINT_SIZE_BASE_RATIO).toBeGreaterThan(0);
    expect(FIXED_POINT_GAPLESS_PADDING).toBeGreaterThan(0);
  });

  it('VIEW_SETTINGS_STORAGE_KEY is a non-empty string', () => {
    expect(VIEW_SETTINGS_STORAGE_KEY).toBeTruthy();
    expect(typeof VIEW_SETTINGS_STORAGE_KEY).toBe('string');
  });

  it('ALLOWED_COLORMAPS contains the expected colormaps', () => {
    expect(ALLOWED_COLORMAPS).toContain('turbo');
    expect(ALLOWED_COLORMAPS).toContain('jet');
    expect(ALLOWED_COLORMAPS).toContain('viridis');
    expect(ALLOWED_COLORMAPS).toContain('inferno');
    expect(ALLOWED_COLORMAPS).toContain('magma');
    expect(ALLOWED_COLORMAPS).toHaveLength(5);
  });
});
