import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';

export class DetectionService {
  constructor() {
    this.model = null;
    this.labels = [];
    this.config = {
      modelPath: '/model/model.json',
      metadataPath: '/model/metadata.json',
      inputSize: 224
    };
  }

  // TODO [Basic] Muat model dan metadata secara bersamaan, lalu simpan ke instance
  // TODO [Advance] Implementasikan strategi Backend Adaptive
  async loadModel(onProgress) {
    try {
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        try {
          await tf.setBackend('webgpu');
          console.log('TF.js successfully initialized WebGPU backend.');
        } catch (gpuErr) {
          console.warn('TF.js failed to initialize WebGPU, falling back to WebGL:', gpuErr);
          await tf.setBackend('webgl');
        }
      } else {
        await tf.setBackend('webgl');
      }
      await tf.ready();

      const [model, metadata] = await Promise.all([
        tf.loadLayersModel(this.config.modelPath, {
          onProgress: (fraction) => {
            if (onProgress) onProgress(fraction);
          }
        }),
        fetch(this.config.metadataPath).then((res) => res.json())
      ]);

      this.model = model;
      this.labels = metadata.labels;

      // Warm up model
      tf.tidy(() => {
        const dummyInput = tf.zeros([1, this.config.inputSize, this.config.inputSize, 3]);
        this.model.predict(dummyInput);
      });

      console.log('Object detection model loaded and warmed up. Backend:', tf.getBackend());
    } catch (err) {
      console.error('Error loading TF.js model:', err);
      throw err;
    }
  }

  // TODO [Basic] Lakukan prediksi pada elemen gambar yang diberikan dan kembalikan hasilnya
  // TODO [Advanced] Manajemen Memori: Secara disiplin menggunakan tidy/dispose
  async predict(imageElement) {
    if (!this.model) {
      throw new Error('Detection model is not loaded');
    }

    let imgTensor = null;
    let resized = null;
    let normalized = null;
    let batched = null;
    let prediction = null;

    try {
      // Convert HTMLVideoElement or image to pixel tensor
      imgTensor = tf.browser.fromPixels(imageElement);

      // Resize input to expected 224x224 shape
      resized = tf.image.resizeBilinear(imgTensor, [this.config.inputSize, this.config.inputSize]);

      // Normalize TM model pixels to range [-1, 1]
      // Use tf.tidy for intermediate scalar calculations to prevent memory leaks
      normalized = tf.tidy(() => {
        return resized.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1.0));
      });

      // Expand dimensions to batched shape [1, 224, 224, 3]
      batched = normalized.expandDims(0);

      // Make prediction
      prediction = this.model.predict(batched);

      // Asynchronously fetch scores from GPU to CPU to avoid WebGPU sync read warning and UI lag
      const scores = await prediction.data();

      // Find class with highest confidence
      let maxIdx = 0;
      let maxScore = -1;
      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > maxScore) {
          maxScore = scores[i];
          maxIdx = i;
        }
      }

      return {
        className: this.labels[maxIdx],
        score: maxScore,
        index: maxIdx
      };
    } finally {
      // Manually dispose all created tensors to avoid memory leaks
      tf.dispose([imgTensor, resized, normalized, batched, prediction]);
    }
  }

  // TODO [Basic] Periksa apakah model sudah dimuat dan siap digunakan
  isLoaded() {
    return this.model !== null;
  }
}

