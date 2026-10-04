// Dev: never auto-reload pages on file changes (several authors edit src/ in parallel; reload manually).
const noAutoReload = {
  name: 'no-auto-reload',
  handleHotUpdate() { return []; },
};
export default {
  base: './',
  plugins: [noAutoReload],
  build: { target: 'esnext', chunkSizeWarningLimit: 3000 },
};
