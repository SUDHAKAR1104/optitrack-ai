/**
 * OptiTrack AI - Main Application Coordinator & Simulation Loop
 * Smart India Hackathon 2026 - Problem Statement SIH26169 (ISRO)
 * Multi-Class Live AI Camera Tracking (Humans, Animals, Objects, Beacons)
 */
class OptiTrackApplication {
  constructor() {
    this.worldCanvas = document.getElementById('world-canvas');
    this.cameraCanvas = document.getElementById('camera-canvas');

    this.simulator = new WorldSimulator(this.worldCanvas);
    this.camera = new CameraViewport(this.cameraCanvas);
    this.detector = new UniversalAIDetector();
    this.kalman = new KinematicKalmanFilter(1.2, 3.5);
    this.controller = new CameraPIDController();
    this.fsm = new TrackingFSM();
    this.charts = new TelemetryCharts('error-chart-canvas', 'latency-chart-canvas');
    this.logger = new TelemetryLogger();
    this.benchmarkRunner = new BenchmarkRunner(this);

    this.isRunning = true;
    this.lastTime = performance.now();
    this.fps = 60;
    this.fpsCount = 0;
    this.fpsTimer = performance.now();
    this.currentLatency = 10.0;

    this.activeScenario = 'WEBCAM_LIVE';
    this.latestDetectionResult = { allDetections: [], primaryTarget: null };
    
    this.initUI();
    this.bindEvents();
    this.populateCameraDevices();

    // Start 60 FPS loop
    requestAnimationFrame((t) => this.loop(t));

    // Auto-prompt webcam start after UI settles
    setTimeout(() => {
      this.promptWebcamStart();
    }, 600);
  }

  async promptWebcamStart() {
    const success = await this.camera.enableWebcam();
    this.updateWebcamUIState(success);
  }

  async populateCameraDevices() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const select = document.getElementById('camera-device-select');
        if (select && videoDevices.length > 0) {
          select.innerHTML = videoDevices.map((d, i) => 
            `<option value="${d.deviceId}">${d.label || `Camera ${i + 1}`}</option>`
          ).join('');
        }
      }
    } catch (err) {
      console.warn('Could not list cameras:', err);
    }
  }

  updateWebcamUIState(active) {
    const statusPill = document.getElementById('status-pill-text');
    const badge = document.getElementById('source-badge');
    const btn = document.getElementById('btn-start-webcam');

    if (active) {
      if (statusPill) statusPill.textContent = 'LIVE AI CAMERA ACTIVE';
      if (badge) {
        badge.textContent = 'LIVE CAMERA • 640x480 @ 30/60 FPS';
        badge.className = 'viewport-badge highlight';
      }
      if (btn) btn.textContent = '🟢 Camera Active';
    } else {
      if (statusPill) statusPill.textContent = 'CAMERA STANDBY';
      if (badge) {
        badge.textContent = 'CLICK TO ACTIVATE CAMERA';
        badge.className = 'viewport-badge';
      }
      if (btn) btn.textContent = '🎥 Start Camera';
    }
  }

  selectScenario(scenarioId) {
    this.activeScenario = scenarioId;
    if (scenarioId === 'WEBCAM_LIVE') {
      this.camera.enableWebcam();
    } else {
      this.camera.setSyntheticMode();
      this.simulator.setScenario(scenarioId);
    }
    this.controller.reset();
    this.kalman.initialized = false;
    this.fsm.reset();

    const sel = document.getElementById('scenario-select');
    if (sel) sel.value = scenarioId;
  }

  async loop(currentTime) {
    if (!this.isRunning) {
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    const t0 = performance.now();
    const dt = Math.min(0.05, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    // FPS
    this.fpsCount++;
    if (currentTime - this.fpsTimer >= 1000) {
      this.fps = this.fpsCount;
      this.fpsCount = 0;
      this.fpsTimer = currentTime;
    }

    const isWebcam = (this.camera.sourceMode === 'WEBCAM' || this.camera.sourceMode === 'VIDEO');

    // --- STEP 1: RENDER RAW SENSOR FRAME ---
    let groundTruth = null;
    if (isWebcam) {
      this.camera.renderSensorFrame();
    } else {
      this.simulator.update(dt);
      const beaconWorld = this.simulator.getBeaconState();
      const distractors = this.simulator.getDistractors();
      groundTruth = this.camera.renderSensorFrame(
        beaconWorld,
        this.controller.pan,
        this.controller.tilt,
        distractors
      );
    }

    // --- STEP 2: MULTI-CLASS AI DETECTION (Humans, Animals, Objects, Beacons) ---
    const predictedPos = this.kalman.initialized ? this.kalman.getState() : null;
    
    // Async detection call (passes rendered canvas directly for pixel-perfect alignment)
    this.detector.detect(
      this.cameraCanvas,
      this.camera.width,
      this.camera.height,
      predictedPos
    ).then(res => {
      this.latestDetectionResult = res;
    });

    const allDetections = this.latestDetectionResult.allDetections || [];
    const primaryTarget = this.latestDetectionResult.primaryTarget;

    // --- STEP 3: 5-STATE TRACKING FSM ---
    const fsmStatus = this.fsm.update(
      primaryTarget !== null,
      primaryTarget ? primaryTarget.confidence : 0,
      dt
    );

    // --- STEP 4: 4-STATE KINEMATIC KALMAN FILTER ---
    this.kalman.predict(dt);

    if (primaryTarget) {
      this.kalman.update(primaryTarget.x, primaryTarget.y);
    }

    const kalmanState = this.kalman.getState();
    const forwardForecast = this.kalman.forecast(dt);

    // --- STEP 5: DIGITAL PID CLOSED-LOOP CONTROLLER ---
    let controlTarget = null;
    if (fsmStatus.isLocked || fsmStatus.isCoasting) {
      controlTarget = kalmanState;
    } else if (primaryTarget) {
      controlTarget = primaryTarget;
    }

    const controlResult = this.controller.update(
      controlTarget,
      this.camera.width,
      this.camera.height,
      fsmStatus.state,
      dt
    );

    // --- STEP 6: RENDER AEROSPACE HUD OVERLAYS ---
    let error2D = controlResult.errorMagnitude;
    if (!isWebcam && groundTruth && groundTruth.inFOV && !groundTruth.isOccluded) {
      error2D = Math.hypot(groundTruth.x - kalmanState.x, groundTruth.y - kalmanState.y);
    }

    this.camera.renderHUD(
      allDetections,
      primaryTarget,
      kalmanState,
      forwardForecast,
      fsmStatus.state,
      error2D
    );

    // --- STEP 7: RENDER VIEWPORT 2 (Virtual Gimbal View) ---
    this.simulator.render(
      isWebcam,
      this.controller.pan,
      this.controller.tilt,
      kalmanState,
      forwardForecast,
      fsmStatus.state,
      error2D
    );

    this.currentLatency = performance.now() - t0;

    // --- STEP 8: TELEMETRY & LOGGING ---
    this.logger.logFrame({
      gt_x: groundTruth ? groundTruth.x : (primaryTarget ? primaryTarget.x : 0),
      gt_y: groundTruth ? groundTruth.y : (primaryTarget ? primaryTarget.y : 0),
      det_x: primaryTarget ? primaryTarget.x : 0,
      det_y: primaryTarget ? primaryTarget.y : 0,
      kal_x: kalmanState.x,
      kal_y: kalmanState.y,
      kal_vx: kalmanState.vx,
      kal_vy: kalmanState.vy,
      cam_pan: this.controller.pan,
      cam_tilt: this.controller.tilt,
      error: error2D,
      fsm_state: fsmStatus.state,
      lock_status: fsmStatus.isLocked,
      confidence: primaryTarget ? primaryTarget.confidence : 0
    });

    if (this.benchmarkRunner.isRunning) {
      this.benchmarkRunner.recordFrame(
        error2D,
        fsmStatus.isLocked,
        this.currentLatency,
        fsmStatus.reacqTime,
        dt
      );
    }

    // --- STEP 9: DOM READOUTS & CHARTS ---
    this.updateHUDReadouts(fsmStatus, error2D, kalmanState, controlResult, allDetections, primaryTarget);
    this.charts.addDataPoint(error2D, this.currentLatency, this.fps);
    this.charts.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  updateHUDReadouts(fsmStatus, error2D, kalmanState, controlResult, allDetections, primaryTarget) {
    const banner = document.getElementById('hud-banner');
    if (banner) {
      banner.textContent = fsmStatus.state;
      banner.className = `hud-status-banner state-${fsmStatus.state.toLowerCase()}`;
    }

    const statusPillText = document.getElementById('status-pill-text');
    if (statusPillText && this.camera.isWebcamActive) {
      statusPillText.textContent = `SYSTEM ${fsmStatus.state}`;
    }

    // Live Entity Count & Target Readout
    const entityCounter = document.getElementById('entity-counter-badge');
    if (entityCounter) {
      const humans = allDetections.filter(d => d.category === 'HUMAN').length;
      const animals = allDetections.filter(d => d.category === 'ANIMAL').length;
      const objects = allDetections.filter(d => d.category === 'OBJECT').length;
      const beacons = allDetections.filter(d => d.isBeacon).length;
      
      const parts = [];
      if (humans > 0) parts.push(`👤 ${humans} Human${humans > 1 ? 's' : ''}`);
      if (animals > 0) parts.push(`🐾 ${animals} Animal${animals > 1 ? 's' : ''}`);
      if (objects > 0) parts.push(`📱 ${objects} Object${objects > 1 ? 's' : ''}`);
      if (beacons > 0) parts.push(`🔦 ${beacons} Beacon${beacons > 1 ? 's' : ''}`);

      if (parts.length > 0) {
        entityCounter.textContent = `DETECTED: ${parts.join(' • ')}`;
        entityCounter.style.display = 'inline-flex';
      } else {
        entityCounter.textContent = 'SCANNING FOR HUMANS, ANIMALS & OBJECTS...';
      }
    }

    const aiModelStatus = document.getElementById('ai-model-status');
    if (aiModelStatus) {
      if (this.detector.isModelReady) {
        aiModelStatus.textContent = '🟢 AI MODEL: READY (COCO-SSD)';
        aiModelStatus.style.color = 'var(--green-locked)';
      } else if (this.detector.isLoadingModel) {
        aiModelStatus.textContent = '🟡 AI MODEL: DOWNLOADING WEIGHTS...';
        aiModelStatus.style.color = 'var(--amber-coasting)';
      } else {
        aiModelStatus.textContent = '⚡ FAST EDGE DETECTOR ACTIVE';
        aiModelStatus.style.color = 'var(--cyan-primary)';
      }
    }

    const elError = document.getElementById('val-error');
    if (elError) elError.innerHTML = `${error2D.toFixed(1)} <span class="telemetry-unit">px</span>`;

    const elLockRate = document.getElementById('val-lock-rate');
    if (elLockRate) elLockRate.innerHTML = `${fsmStatus.lockRate.toFixed(1)} <span class="telemetry-unit">%</span>`;

    const elLatency = document.getElementById('val-latency');
    if (elLatency) elLatency.innerHTML = `${this.currentLatency.toFixed(1)} <span class="telemetry-unit">ms</span>`;

    const elFps = document.getElementById('val-fps');
    if (elFps) elFps.innerHTML = `${this.fps} <span class="telemetry-unit">FPS</span>`;

    const elVelocity = document.getElementById('val-velocity');
    if (elVelocity) {
      elVelocity.innerHTML = `${kalmanState.speed.toFixed(1)} <span class="telemetry-unit">px/s</span>`;
    }

    const elPanTilt = document.getElementById('val-pantilt');
    if (elPanTilt) {
      const targetName = primaryTarget ? primaryTarget.class : 'CENTER';
      elPanTilt.innerHTML = `${targetName} <span class="telemetry-unit">[${controlResult.pan.toFixed(0)}, ${controlResult.tilt.toFixed(0)}]</span>`;
    }

    const clock = document.getElementById('live-clock');
    if (clock) {
      const now = new Date();
      clock.textContent = now.toTimeString().split(' ')[0] + ' UTC';
    }
  }

  initUI() {
    if (this.benchmarkRunner) {
      this.benchmarkRunner.updateTableUI();
    }

    const maskContainer = document.getElementById('mask-preview-container');
    if (maskContainer) {
      const maskCanvas = this.detector.getMaskCanvas();
      maskCanvas.style.width = '100%';
      maskCanvas.style.borderRadius = '8px';
      maskCanvas.style.border = '1px solid rgba(0, 240, 255, 0.3)';
      maskContainer.appendChild(maskCanvas);
    }
  }

  bindEvents() {
    // Navigation Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
        
        if (window.telemetryAudio) window.telemetryAudio.playClick();
      });
    });

    // Webcam Start / Restart
    const btnStartWebcam = document.getElementById('btn-start-webcam');
    if (btnStartWebcam) {
      btnStartWebcam.addEventListener('click', async () => {
        const ok = await this.camera.enableWebcam();
        this.updateWebcamUIState(ok);
      });
    }

    // Camera Device Switcher
    const camSelect = document.getElementById('camera-device-select');
    if (camSelect) {
      camSelect.addEventListener('change', async (e) => {
        const ok = await this.camera.enableWebcam(e.target.value);
        this.updateWebcamUIState(ok);
      });
    }

    // Mirror Toggle
    const btnMirror = document.getElementById('btn-mirror-toggle');
    if (btnMirror) {
      btnMirror.addEventListener('click', () => {
        const isMirrored = this.camera.toggleMirror();
        btnMirror.classList.toggle('active', isMirrored);
      });
    }

    // AI Category Toggles
    const toggleHuman = document.getElementById('toggle-category-human');
    if (toggleHuman) {
      toggleHuman.addEventListener('click', () => {
        this.detector.detectHumans = !this.detector.detectHumans;
        toggleHuman.classList.toggle('active', this.detector.detectHumans);
      });
    }

    const toggleAnimal = document.getElementById('toggle-category-animal');
    if (toggleAnimal) {
      toggleAnimal.addEventListener('click', () => {
        this.detector.detectAnimals = !this.detector.detectAnimals;
        toggleAnimal.classList.toggle('active', this.detector.detectAnimals);
      });
    }

    const toggleObject = document.getElementById('toggle-category-object');
    if (toggleObject) {
      toggleObject.addEventListener('click', () => {
        this.detector.detectObjects = !this.detector.detectObjects;
        toggleObject.classList.toggle('active', this.detector.detectObjects);
      });
    }

    const toggleBeacon = document.getElementById('toggle-category-beacon');
    if (toggleBeacon) {
      toggleBeacon.addEventListener('click', () => {
        this.detector.detectBeacons = !this.detector.detectBeacons;
        toggleBeacon.classList.toggle('active', this.detector.detectBeacons);
      });
    }

    // Target Selection Dropdown (Auto, Person, Animal, Object, Beacon)
    const targetSelect = document.getElementById('target-priority-select');
    if (targetSelect) {
      targetSelect.addEventListener('change', (e) => {
        this.detector.setTargetSelection(e.target.value);
      });
    }

    // Interactive Click-to-Lock on ANY detected bounding box or light
    this.cameraCanvas.addEventListener('click', (e) => {
      if (!this.camera.isWebcamActive) return;
      const rect = this.cameraCanvas.getBoundingClientRect();
      const scaleX = this.camera.width / rect.width;
      const scaleY = this.camera.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      // Check if clicked inside any detected object bounding box
      const clickedEntity = (this.latestDetectionResult.allDetections || []).find(d => {
        if (!d.bbox) return false;
        return (clickX >= d.bbox.x && clickX <= d.bbox.x + d.bbox.w &&
                clickY >= d.bbox.y && clickY <= d.bbox.y + d.bbox.h);
      });

      if (clickedEntity) {
        this.detector.lockedTargetId = clickedEntity.id;
        if (window.telemetryAudio) window.telemetryAudio.playLockAcquired();
        return;
      }

      // If clicked empty space, auto-sample color pipette
      const sampled = this.detector.sampleColorAt(this.camera.ctx, clickX, clickY);
      if (sampled) {
        this.detector.lockedTargetId = 'BEACON-OPTICAL';
        if (window.telemetryAudio) window.telemetryAudio.playLockAcquired();
        this.syncSliderUI();
      }
    });

    // Sound FX Mute Toggle
    const muteBtn = document.getElementById('btn-mute-toggle');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const isMuted = window.telemetryAudio.toggleMute();
        muteBtn.innerHTML = isMuted ? '🔇' : '🔊';
      });
    }

    // Scenario Select
    const sel = document.getElementById('scenario-select');
    if (sel) {
      sel.addEventListener('change', (e) => this.selectScenario(e.target.value));
    }

    // Play/Pause
    const playBtn = document.getElementById('btn-play-pause');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.isRunning = !this.isRunning;
        playBtn.textContent = this.isRunning ? '⏸ Pause' : '▶ Resume';
      });
    }

    // Reset Simulation
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.controller.reset();
        this.kalman.initialized = false;
        this.fsm.reset();
        this.detector.lockedTargetId = null;
      });
    }

    // Steering Mode: Autonomous vs Manual
    const modeSelect = document.getElementById('steering-mode-select');
    if (modeSelect) {
      modeSelect.addEventListener('change', (e) => {
        this.controller.mode = e.target.value;
      });
    }

    // Keyboard Arrow Controls
    window.addEventListener('keydown', (e) => {
      if (this.controller.mode !== 'MANUAL') return;
      const speed = 200;
      if (e.key === 'ArrowUp') this.controller.setManualVelocity(0, -speed);
      if (e.key === 'ArrowDown') this.controller.setManualVelocity(0, speed);
      if (e.key === 'ArrowLeft') this.controller.setManualVelocity(-speed, 0);
      if (e.key === 'ArrowRight') this.controller.setManualVelocity(speed, 0);
    });

    window.addEventListener('keyup', (e) => {
      if (this.controller.mode === 'MANUAL') {
        this.controller.setManualVelocity(0, 0);
      }
    });

    // Recording Controls
    const recordBtn = document.getElementById('btn-record');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => {
        if (!this.logger.isRecording) {
          const sessId = this.logger.start(this.activeScenario);
          recordBtn.textContent = '⏹ Stop Rec';
          recordBtn.className = 'btn btn-danger';
        } else {
          const count = this.logger.stop();
          recordBtn.textContent = '⏺ Record Run';
          recordBtn.className = 'btn';
          alert(`Session recorded! ${count} frames captured from your laptop camera. Ready for CSV export.`);
        }
      });
    }

    const exportCsvBtn = document.getElementById('btn-export-csv');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        this.logger.exportCSV();
      });
    }

    // Sliders
    this.bindSlider('slider-hue-min', (v) => { this.detector.hueMin = parseInt(v); });
    this.bindSlider('slider-hue-max', (v) => { this.detector.hueMax = parseInt(v); });
    this.bindSlider('slider-sat-min', (v) => { this.detector.satMin = parseInt(v); });
    this.bindSlider('slider-val-min', (v) => { this.detector.valMin = parseInt(v); });
    this.bindSlider('slider-ai-confidence', (v) => { 
      this.detector.setConfidenceThreshold(parseFloat(v) / 100);
      const confLabel = document.getElementById('slider-ai-confidence-val');
      if (confLabel) confLabel.textContent = `${v}%`;
    });
    this.bindSlider('slider-intensity-min', (v) => { this.detector.minIntensity = parseInt(v); });
    this.bindSlider('slider-kalman-q', (v) => { this.kalman.setTuning(parseFloat(v), undefined); });
    this.bindSlider('slider-kalman-r', (v) => { this.kalman.setTuning(undefined, parseFloat(v)); });
    this.bindSlider('slider-kalman-horizon', (v) => { this.kalman.setTuning(undefined, undefined, parseInt(v)); });
    this.bindSlider('slider-pid-kp', (v) => { this.controller.setGains(parseFloat(v), undefined, undefined); });
    this.bindSlider('slider-pid-kd', (v) => { this.controller.setGains(undefined, undefined, parseFloat(v)); });

    // Benchmark Suite Trigger
    const runBenchBtn = document.getElementById('btn-run-all-benchmarks');
    if (runBenchBtn) {
      runBenchBtn.addEventListener('click', () => {
        this.benchmarkRunner.startAllTests();
      });
    }
  }

  syncSliderUI() {
    this.setSliderVal('slider-hue-min', this.detector.hueMin);
    this.setSliderVal('slider-hue-max', this.detector.hueMax);
    this.setSliderVal('slider-sat-min', this.detector.satMin);
    this.setSliderVal('slider-val-min', this.detector.valMin);
    this.setSliderVal('slider-intensity-min', this.detector.minIntensity);
  }

  setSliderVal(id, val) {
    const slider = document.getElementById(id);
    const label = document.getElementById(`${id}-val`);
    if (slider) slider.value = val;
    if (label) label.textContent = val;
  }

  bindSlider(id, callback) {
    const slider = document.getElementById(id);
    const label = document.getElementById(`${id}-val`);
    if (slider && label) {
      slider.addEventListener('input', (e) => {
        label.textContent = e.target.value;
        callback(e.target.value);
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.optiTrackApp = new OptiTrackApplication();
});
