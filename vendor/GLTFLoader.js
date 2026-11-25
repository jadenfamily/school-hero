// Re-export shim: the vendored GLTFLoader lives at ./loaders/GLTFLoader.js
// (its '../utils/BufferGeometryUtils.js' import only resolves from there).
export { GLTFLoader } from './loaders/GLTFLoader.js';
