import { isMobileDevice } from '../utils/common';

export class CameraService {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.devices = [];
    this.fps = 30;
    this.activeCameraId = null;
  }

  setVideoElement(videoElement) {
    this.video = videoElement;
  }

  setCanvasElement(canvasElement) {
    this.canvas = canvasElement;
  }

  // TODO [Basic] Tambahkan konfigurasi kamera untuk mendapatkan daftar perangkat input video
  // TODO [Basic] Dapatkan constraints kamera berdasarkan konfigurasi dan kamera yang dipilih
  async loadCameras() {
    try {
      // First ask permission by doing a temp userMedia query if supported
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
          tempStream.getTracks().forEach((track) => track.stop());
        } catch (e) {
          console.warn('Initial camera permission query failed or rejected:', e);
        }
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter((device) => device.kind === 'videoinput');
      return this.devices;
    } catch (e) {
      console.error('Error loading cameras:', e);
      throw e;
    }
  }

  // TODO [Basic] Memulai kamera dengan perangkat yang dipilih dan menampilkan pada elemen video
  async startCamera(selectedCameraId) {
    if (this.stream) {
      this.stopCamera();
    }

    this.activeCameraId = selectedCameraId || null;
    const mobile = isMobileDevice();
    const facingMode = mobile ? 'environment' : 'user';

    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: this.fps }
      }
    };

    if (selectedCameraId && selectedCameraId !== 'default' && selectedCameraId !== 'front') {
      constraints.video.deviceId = { exact: selectedCameraId };
    } else if (selectedCameraId === 'front') {
      constraints.video.facingMode = 'user';
    } else if (selectedCameraId === 'default') {
      constraints.video.facingMode = facingMode;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;
      if (this.video) {
        this.video.srcObject = stream;
        await new Promise((resolve) => {
          this.video.onloadedmetadata = () => {
            this.video.play()
              .then(() => resolve())
              .catch((playErr) => {
                console.warn('Video play failed on start camera, resolving anyway:', playErr);
                resolve();
              });
          };
          // Fail-safe timeout
          setTimeout(resolve, 1500);
        });
      }
      return stream;
    } catch (error) {
      console.warn('Failed to start camera with initial constraints, trying fallback:', error);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.stream = fallbackStream;
        if (this.video) {
          this.video.srcObject = fallbackStream;
          await new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
              this.video.play().then(resolve).catch(resolve);
            };
            setTimeout(resolve, 1500);
          });
        }
        return fallbackStream;
      } catch (fallbackError) {
        console.error('Error starting camera even with fallback:', fallbackError);
        throw fallbackError;
      }
    }
  }

  // TODO [Basic] Menghentikan siaran kamera dan membersihkan sumber daya
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  // TODO [Skilled] Implementasikan metode untuk mengatur FPS kamera
  setFPS(fps) {
    this.fps = Number(fps);
    if (this.stream) {
      const track = this.stream.getVideoTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        track.applyConstraints({ frameRate: { ideal: this.fps } }).catch((err) => {
          console.warn('Failed to dynamically apply FPS constraint:', err);
        });
      }
    }
  }

  // TODO [Basic] Periksa apakah kamera sedang aktif
  isActive() {
    return this.stream !== null;
  }

  // TODO [Basic] Periksa apakah elemen video siap untuk digunakan
  isReady() {
    return this.video && this.video.readyState === 4; // HAVE_ENOUGH_DATA
  }
}