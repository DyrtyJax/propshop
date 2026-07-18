import {makeProject} from '@revideo/core';

import production from './production.js';

export default makeProject({
  name: 'propshop-music-video-explainer',
  scenes: [production],
  settings: {
    shared: {
      background: '#17130F',
      range: [0, Infinity],
      size: {x: 1920, y: 1080},
    },
    preview: {fps: 24, resolutionScale: 1},
    rendering: {
      exporter: {name: '@revideo/core/wasm'},
      fps: 24,
      resolutionScale: 1,
      colorSpace: 'srgb',
    },
  },
});
