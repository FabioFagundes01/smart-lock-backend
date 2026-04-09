/**
 * Setup do face-api para Node.js.
 * Uses tfjs-node (native) + face-api nobundle (uses our tfjs, not its own).
 */
import * as canvas from 'canvas';

// Load tfjs-node FIRST to register the native backend
const tf = require('@tensorflow/tfjs-node');

// Use the nobundle version so it picks up our tfjs-node instead of its own bundled tfjs
const faceapi = require('@vladmandic/face-api/dist/face-api.node.js');

// Monkey-patch: replace face-api's internal tf.browser.fromPixels
// with a version that properly handles node-canvas objects
const origFromPixels = tf.browser.fromPixels.bind(tf.browser);
faceapi.tf.browser.fromPixels = function (pixels: any, numChannels?: number) {
  // If it's an Image (not Canvas), draw onto a Canvas first
  if (pixels.constructor && pixels.constructor.name === 'Image') {
    const { createCanvas } = canvas as any;
    const cvs = createCanvas(pixels.width, pixels.height);
    cvs.getContext('2d').drawImage(pixels, 0, 0);
    return origFromPixels(cvs, numChannels);
  }
  return origFromPixels(pixels, numChannels);
};

// Inject node-canvas polyfills
const { Canvas, Image, ImageData } = canvas as any;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

export const faceDetectionNet = faceapi.nets.ssdMobilenetv1;
export const faceDetectionOptions = new faceapi.SsdMobilenetv1Options({
  minConfidence: 0.5,
});

export { canvas, faceapi };
