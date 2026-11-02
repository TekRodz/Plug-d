import { defineConfig } from 'vite';

/** Build autonome pour l'artefact : un seul script IIFE, Phaser chargé depuis cdnjs. */
export default defineConfig({
  build: {
    outDir: 'dist-artifact',
    target: 'es2020',
    emptyOutDir: true,
    lib: { entry: 'src/main.ts', name: 'PlugdGame', formats: ['iife'], fileName: () => 'plugd.js' },
    rollupOptions: { external: ['phaser'], output: { globals: { phaser: 'Phaser' } } },
  },
});
