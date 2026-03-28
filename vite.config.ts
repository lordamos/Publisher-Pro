import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'remove-fetch-overwrites',
        transform(code, id) {
          if (id.includes('node_modules')) {
            return {
              code: code.replace(/(global|globalThis|self|window|g|q|Q)(\.(fetch|Headers|Request|Response|FormData)|\[['"](fetch|Headers|Request|Response|FormData)['"]\])\s*=/g, 'void '),
              map: null,
            };
          }
        },
      },
    ],
    optimizeDeps: {
      exclude: ['node-fetch', 'isomorphic-fetch', 'whatwg-fetch', 'formdata-polyfill'],
      force: true,
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'node-fetch': path.resolve(__dirname, 'src/fetch-proxy.js'),
        'isomorphic-fetch': path.resolve(__dirname, 'src/fetch-proxy.js'),
        'isomorphic-fetch/fetch-npm-node.js': path.resolve(__dirname, 'src/fetch-proxy.js'),
        'isomorphic-fetch/fetch-npm-browserify.js': path.resolve(__dirname, 'src/fetch-proxy.js'),
        'whatwg-fetch': path.resolve(__dirname, 'src/fetch-proxy.js'),
        'whatwg-fetch/fetch.js': path.resolve(__dirname, 'src/fetch-proxy.js'),
        'whatwg-fetch/dist/fetch.umd.js': path.resolve(__dirname, 'src/fetch-proxy.js'),
        'formdata-polyfill': path.resolve(__dirname, 'src/formdata-noop.js'),
        'formdata-polyfill/esm.min.js': path.resolve(__dirname, 'src/formdata-noop.js'),
        'formdata-polyfill/FormData.js': path.resolve(__dirname, 'src/formdata-noop.js'),
        'formdata-polyfill/formdata.min.js': path.resolve(__dirname, 'src/formdata-noop.js'),
        'formdata-polyfill/formdata-to-blob.js': path.resolve(__dirname, 'src/formdata-noop.js'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
