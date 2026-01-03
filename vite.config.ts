/**
 * Vite configuration for HexFleet.
 *
 * Why Vite?
 * - Fast dev server / HMR
 * - Simple TypeScript bundling (Phaser 3 works well)
 *
 * This file also defines path aliases to keep imports clean.
 */

import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@assets': path.resolve(__dirname, 'src/assets')
    }
  }
});
