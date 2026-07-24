import { useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import CameraSection from './components/CameraSection';
import InfoPanel from './components/InfoPanel';
import { useAppState } from './hooks/useAppState';
import { CameraService } from './services/CameraService';
import { DetectionService } from './services/DetectionService';
import { RootFactsService } from './services/RootFactsService';

function App() {
  const { state, actions } = useAppState();
  const detectionCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
  const [currentTone, setCurrentTone] = useState('normal');

  // TODO [Basic] Inisialisasi layanan deteksi, kamera, dan generator fakta saat aplikasi dimuat
  useEffect(() => {
    const detector = new DetectionService();
    const camera = new CameraService();
    const generator = new RootFactsService();

    actions.setServices({ detector, camera, generator });

    let tfProgress = 0;
    let transformersProgress = 0;

    const updateStatus = () => {
      const totalProgress = Math.round((tfProgress + transformersProgress) / 2);
      actions.setModelStatus(`Menunggu Model... (${totalProgress}%)`);
    };

    const init = async () => {
      try {
        updateStatus();

        // 1. Load Detection Service
        await detector.loadModel((fraction) => {
          tfProgress = Math.round(fraction * 100);
          updateStatus();
        });

        // 2. Load Cameras list
        await camera.loadCameras();

        // 3. Load Generative AI Service
        await generator.loadModel((progress) => {
          if (progress.status === 'progress' && progress.file) {
            if (progress.progress !== undefined) {
              transformersProgress = Math.round(progress.progress);
              updateStatus();
            }
          } else if (progress.status === 'ready') {
            transformersProgress = 100;
            updateStatus();
          }
        });

        // Completed initialization
        actions.setModelStatus('Model AI Siap');
      } catch (err) {
        console.error('Initialization failed:', err);
        actions.setError('Gagal menginisialisasi model AI. Periksa koneksi internet Anda.');
        actions.setModelStatus('Gagal Memuat Model');
      }
    };

    init();

    // TODO [Basic] Bersihkan sumber daya saat komponen ditinggalkan
    return () => {
      if (detectionCleanupRef.current) {
        cancelAnimationFrame(detectionCleanupRef.current);
      }
      camera.stopCamera();
    };
  }, [actions]);

  // TODO [Basic] Fungsi untuk memulai loop deteksi
  const startDetectionLoop = () => {
    if (!state.services.detector || !state.services.camera) return;

    isRunningRef.current = true;
    actions.setRunning(true);
    actions.setAppState('idle');

    const fps = state.services.camera.fps || 30;
    const frameInterval = 1000 / fps;
    const loopStartTime = Date.now();
    let lastFrameTime = Date.now();
    let consecutiveDetections = 0;
    let lastDetectedClass = null;

    const loop = async () => {
      if (!isRunningRef.current) return;

      const now = Date.now();

      // Give 1 second for the camera stream to stabilize to avoid blank/black screen false detections
      if (now - loopStartTime < 1000) {
        detectionCleanupRef.current = requestAnimationFrame(loop);
        return;
      }

      const elapsed = now - lastFrameTime;

      if (elapsed >= frameInterval) {
        lastFrameTime = now - (elapsed % frameInterval);

        if (state.services.camera.isReady()) {
          try {
            const result = await state.services.detector.predict(state.services.camera.video);

            // Confidence threshold is 70%
            const confidence = Math.round(result.score * 100);
            if (confidence >= 70) {
              if (lastDetectedClass === result.className) {
                consecutiveDetections++;
              } else {
                lastDetectedClass = result.className;
                consecutiveDetections = 1;
              }

              // Require 8 consecutive frames of the same object to confirm detection
              if (consecutiveDetections >= 8) {
                // Object detected successfully and steadily!
                isRunningRef.current = false;
                actions.setRunning(false);
                state.services.camera.stopCamera();

                // Switch to analyzing state
                actions.setAppState('analyzing');
                actions.setDetectionResult({
                  className: result.className,
                  score: result.score
                });

                // Wait 2 seconds for analyzing animation
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Switch to result state and trigger generative AI fact
                actions.setAppState('result');
                actions.setFunFactData(null); // Show loading inside result card

                try {
                // Apply the selected tone
                  state.services.generator.setTone(currentTone);
                  const funFactText = await state.services.generator.generateFacts(result.className);
                  actions.setFunFactData(funFactText);
                } catch (factErr) {
                  console.error('Failed to generate fact:', factErr);
                  actions.setFunFactData('error');
                }
                return; // Exit loop
              } // closes if (consecutiveDetections >= 8)
            } else { // closes if (confidence >= 70)
              consecutiveDetections = 0;
              lastDetectedClass = null;
            }
          } catch (err) { // closes try (state.services.detector.predict)
            console.error('Detection loop predict error:', err);
          }
        } // closes if (state.services.camera.isReady())
      }

      detectionCleanupRef.current = requestAnimationFrame(loop);
    };

    detectionCleanupRef.current = requestAnimationFrame(loop);
  };

  // TODO [Basic] Fungsi untuk memulai dan menghentikan kamera
  const handleToggleCamera = async () => {
    if (state.isRunning) {
      // Stop scanning
      isRunningRef.current = false;
      if (detectionCleanupRef.current) {
        cancelAnimationFrame(detectionCleanupRef.current);
        detectionCleanupRef.current = null;
      }
      if (state.services.camera) {
        state.services.camera.stopCamera();
      }
      actions.setRunning(false);
      actions.resetResults();
    } else {
      // Start scanning
      try {
        actions.resetResults();
        if (state.services.camera) {
          const selectElement = document.getElementById('camera-select');
          const selectedCamera = selectElement ? selectElement.value : 'default';
          await state.services.camera.startCamera(selectedCamera);
          startDetectionLoop();
        }
      } catch (err) {
        console.error('Failed to start camera:', err);
        actions.setError(`Gagal mengakses kamera: ${err.name || 'Error'} - ${err.message || 'Unknown error'}`);
      }
    }
  };

  // TODO [Advance] Fungsi untuk mengubah nada fakta yang dihasilkan
  const handleToneChange = (tone) => {
    setCurrentTone(tone);
    if (state.services.generator) {
      state.services.generator.setTone(tone);
    }
  };

  // TODO [Skilled] Fungsi untuk menyalin fakta ke clipboard
  const handleCopyFact = async () => {
    if (state.funFactData && state.funFactData !== 'error') {
      try {
        await navigator.clipboard.writeText(state.funFactData);
        alert('Fakta menarik berhasil disalin ke papan klip!');
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        alert('Gagal menyalin ke papan klip.');
      }
    }
  };

  return (
    <div className="app-container">
      <Header modelStatus={state.modelStatus} />

      <main className="main-content">
        <CameraSection
          isRunning={state.isRunning}
          onToggleCamera={handleToggleCamera}
          onToneChange={handleToneChange}
          services={state.services}
          modelStatus={state.modelStatus}
          error={state.error}
          currentTone={currentTone}
        />

        <InfoPanel
          appState={state.appState}
          detectionResult={state.detectionResult}
          funFactData={state.funFactData}
          error={state.error}
          onCopyFact={handleCopyFact}
        />
      </main>

      <footer className="footer">
        <p>Powered by TensorFlow.js & Transformers.js</p>
      </footer>

      {state.error && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '380px',
          padding: '0.875rem 1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          color: '#991b1b',
          fontSize: '0.8125rem',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 1000
        }}>
          <strong>Error:</strong> {state.error}
          <button
            onClick={() => actions.setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#991b1b',
              padding: 0,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

