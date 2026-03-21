/**
 * Setup do face-api para Node.js (CommonJS).
 * Estratégia: usar o bundle .node.js que já inclui tfjs-node,
 * mas interceptar o require para substituir tfjs-node por tfjs puro.
 */
import * as canvas from 'canvas';

// Interceptar require de tfjs-node antes do face-api carregar
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  // Redirecionar tfjs-node para tfjs puro (sem bindings C++)
  if (id === '@tensorflow/tfjs-node' || id === '@tensorflow/tfjs-node-gpu') {
    return originalRequire.call(this, '@tensorflow/tfjs');
  }
  return originalRequire.apply(this, arguments);
};

// Agora pode carregar o face-api normalmente
// eslint-disable-next-line @typescript-eslint/no-var-requires
const faceapi = require('@vladmandic/face-api');

// Restaurar require original
Module.prototype.require = originalRequire;

// Injetar polyfills do canvas
const { Canvas, Image, ImageData } = canvas as any;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

export const faceDetectionNet = faceapi.nets.ssdMobilenetv1;
export const faceDetectionOptions = new faceapi.SsdMobilenetv1Options({
  minConfidence: 0.5,
});

export { canvas, faceapi };
