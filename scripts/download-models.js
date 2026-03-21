#!/usr/bin/env node
/**
 * Script para baixar os modelos do face-api.js necessários.
 * Execute: node scripts/download-models.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const MODELS = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

function download(filename) {
  return new Promise((resolve, reject) => {
    const dest = path.join(MODELS_DIR, filename);
    if (fs.existsSync(dest)) {
      console.log(`⏭  Já existe: ${filename}`);
      return resolve();
    }
    const file = fs.createWriteStream(dest);
    console.log(`⬇️  Baixando: ${filename}`);
    https.get(`${BASE_URL}/${filename}`, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

(async () => {
  console.log('📦 Baixando modelos do face-api.js...\n');
  for (const model of MODELS) {
    await download(model);
  }
  console.log('\n✅ Todos os modelos baixados em ./models/');
})();
