import type { ColormapName } from './colormaps';

export const PLACEHOLDER_FILENAME = 'ML_Basic_Test_0_0.csv';
export const SCENE_BACKGROUND_COLOR = 0xf1f5f9;

export const DEFAULT_POINT_SIZE = 3;
export const GAPLESS_POINT_SIZE_FALLBACK = 12;
export const GAPLESS_POINT_SIZE_PADDING = 1.1;
export const FIXED_POINT_SIZE_BASE_RATIO = 0.5;
export const FIXED_POINT_GAPLESS_PADDING = 1.05;
export const VIEW_SETTINGS_STORAGE_KEY = 'eddy3d:view-settings:v1';

export const ALLOWED_COLORMAPS: ColormapName[] = ['turbo', 'jet', 'viridis', 'inferno', 'magma'];
