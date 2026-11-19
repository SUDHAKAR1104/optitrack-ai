/**
 * OptiTrack AI - Live Webcam & Multi-Class Sensor Viewport
 * Captures live physical laptop camera feed or synthetic FSOC scenes,
 * renders aerospace HUD overlays for Humans, Animals, Objects, and Beacons.
 */
class CameraViewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Resolution: Standard 640x480 for ultra-fast 60 FPS CV processing
    this.width = 640;
    this.height = 480;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Default to Live Laptop Camera mode
    this.sourceMode = 'WEBCAM';
    this.videoElement = null;
    this.webcamStream = null;
    this.mirror = true; // Natural mirror flip for webcam
    this.isWebcamActive = false;
    this.webcamError = null;

    // HUD Display Options
    this.showDetections = true;
    this.showKalmanPrediction = true;
    this.showCrosshairs = true;
    this.showTelemetryHUD = true;

    // Impairments
    this.noiseSigma = 0;
    this.blurRadius = 0;

    // Canvas click listener
    this.canvas.addEventListener('click', (e) => {
      if (!this.isWebcamActive && this.sourceMode === 'WEBCAM') {
        this.enableWebcam();
      }
    });
  }

  async enableWebcam(deviceId = null) {
    this.webcamError = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported in this browser. Please use Google Chrome or Microsoft Edge on http://localhost:8080');
      }

      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, facingMode: 'user' }
          : { width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, facingMode: 'user' }
      };

      this.webcamStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
      }

      this.videoElement.srcObject = this.webcamStream;
      await this.videoElement.play();

      this.isWebcamActive = true;
      this.sourceMode = 'WEBCAM';

      if (window.telemetryAudio) {
        window.telemetryAudio.playLockAcquired();
      }

      return true;
    } catch (err) {
      console.error('Camera access failed:', err);
      this.webcamError = err.message;
      this.isWebcamActive = false;
      return false;
    }
  }

  toggleMirror() {
    this.mirror = !this.mirror;
    return this.mirror;
  }

  setSyntheticMode() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
    }
    this.isWebcamActive = false;
    this.sourceMode = 'SYNTHETIC';
  }

  loadVideoFile(file) {
    if (!this.videoElement) {
      this.videoElement = document.createElement('video');
      this.videoElement.autoplay = true;
      this.videoElement.loop = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
    }
    this.videoElement.src = URL.createObjectURL(file);
    this.videoElement.play();
    this.isWebcamActive = true;
    this.sourceMode = 'VIDEO';
  }

  /**
   * Render sensor video frame
   */
  renderSensorFrame(beaconWorld = null, camPan = 0, camTilt = 0, distractors = []) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // --- CASE A: WEBCAM OR VIDEO FEED ---
    if (this.sourceMode === 'WEBCAM' || this.sourceMode === 'VIDEO') {
      if (this.isWebcamActive && this.videoElement && this.videoElement.readyState >= 2) {
        ctx.save();
        if (this.mirror) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(this.videoElement, 0, 0, w, h);
        ctx.restore();

        if (this.noiseSigma > 0) {
          this.applyNoiseOverlay(ctx, w, h, this.noiseSigma);
        }
        return null;
      }

      // Waiting / Unstarted State
      ctx.fillStyle = '#060a17';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 40; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 40; y < h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const cx = w / 2;
      const cy = h / 2;

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 160, cy - 70, 320, 140);

      ctx.fillStyle = '#00f0ff';
      ctx.font = '700 15px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('🔴 CLICK TO ACTIVATE CAMERA', cx, cy - 25);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '12px Space Grotesk';
      ctx.fillText('Live AI Detection: Humans, Animals & Objects', cx, cy);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
      ctx.font = '11px JetBrains Mono';
      ctx.fillText('Detects all persons, pets, electronics & light beacons', cx, cy + 24);

      if (this.webcamError) {
        ctx.fillStyle = '#ef4444';
        ctx.font = '11px JetBrains Mono';
        ctx.fillText(`Error: ${this.webcamError}`, cx, cy + 48);
      }

      ctx.textAlign = 'left';
      return null;
    }

    // --- CASE B: SYNTHETIC SIMULATION MODE ---
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, w, h);

    if (distractors) {
      distractors.forEach(d => {
        const projX = (w / 2) + (d.x - camPan);
        const projY = (h / 2) + (d.y - camTilt);
        if (projX >= -20 && projX <= w + 20 && projY >= -20 && projY <= h + 20) {
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(projX, projY, d.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    let groundTruthImagePos = null;
    if (beaconWorld) {
      const projX = (w / 2) + (beaconWorld.x - camPan);
      const projY = (h / 2) + (beaconWorld.y - camTilt);

      groundTruthImagePos = {
        x: projX,
        y: projY,
        inFOV: (projX >= 0 && projX <= w && projY >= 0 && projY <= h),
        isOccluded: beaconWorld.isOccluded
      };

      if (groundTruthImagePos.inFOV && !beaconWorld.isOccluded) {
        const intensity = beaconWorld.intensity || 1.0;
        const baseRadius = 8 + this.blurRadius * 2;

        const haloGrad = ctx.createRadialGradient(projX, projY, 2, projX, projY, baseRadius * 3.5);
        haloGrad.addColorStop(0, `rgba(0, 255, 120, ${0.9 * intensity})`);
        haloGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(projX, projY, baseRadius * 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(projX, projY, baseRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return groundTruthImagePos;
  }

  applyNoiseOverlay(ctx, w, h, sigma) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const s = sigma * 2;
    for (let i = 0; i < data.length; i += 8) {
      const noise = (Math.random() - 0.5) * s;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
      data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Render Aerospace HUD Overlays for ALL Detected Objects
   */
  renderHUD(allDetections = [], primaryTarget = null, kalmanState = null, forwardForecast = [], fsmState = 'SEARCHING', errorMag = 0) {
    if (!this.showTelemetryHUD) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();

    // 1. Center Optical Boresight Crosshairs
    if (this.showCrosshairs) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1;

      // Fine lock target ring (r = 15 px)
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.stroke();

      // Coarse acquisition threshold ring (r = 50 px)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, 50, 0, Math.PI * 2);
      ctx.stroke();

      // Boresight lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.beginPath();
      ctx.moveTo(cx - 25, cy); ctx.lineTo(cx - 12, cy);
      ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 25, cy);
      ctx.moveTo(cx, cy - 25); ctx.lineTo(cx, cy - 12);
      ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + 25);
      ctx.stroke();

      // Reticle corner brackets
      const bracketLen = 20;
      const margin = 14;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.beginPath();
      ctx.moveTo(margin, margin + bracketLen); ctx.lineTo(margin, margin); ctx.lineTo(margin + bracketLen, margin);
      ctx.moveTo(w - margin - bracketLen, margin); ctx.lineTo(w - margin, margin); ctx.lineTo(w - margin, margin + bracketLen);
      ctx.moveTo(margin, h - margin - bracketLen); ctx.lineTo(margin, h - margin); ctx.lineTo(margin + bracketLen, h - margin);
      ctx.moveTo(w - margin - bracketLen, h - margin); ctx.lineTo(w - margin, h - margin); ctx.lineTo(w - margin, h - margin - bracketLen);
      ctx.stroke();
    }

    // 2. Render All Detected Entities (Humans, Animals, Objects, Beacons)
    if (this.showDetections && allDetections && allDetections.length > 0) {
      allDetections.forEach(det => {
        const isPrimary = (primaryTarget && primaryTarget.id === det.id);
        const color = det.color || '#00f0ff';
        const bbox = det.bbox;

        ctx.strokeStyle = color;
        ctx.lineWidth = isPrimary ? 2.5 : 1.5;

        // Bounding Box with Corner Brackets
        if (bbox) {
          ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);

          // Corner brackets for high-tech HUD look
          const cLen = Math.min(12, bbox.w / 4, bbox.h / 4);
          ctx.beginPath();
          ctx.moveTo(bbox.x, bbox.y + cLen); ctx.lineTo(bbox.x, bbox.y); ctx.lineTo(bbox.x + cLen, bbox.y);
          ctx.moveTo(bbox.x + bbox.w - cLen, bbox.y); ctx.lineTo(bbox.x + bbox.w, bbox.y); ctx.lineTo(bbox.x + bbox.w, bbox.y + cLen);
          ctx.moveTo(bbox.x, bbox.y + bbox.h - cLen); ctx.lineTo(bbox.x, bbox.y + bbox.h); ctx.lineTo(bbox.x + cLen, bbox.y + bbox.h);
          ctx.moveTo(bbox.x + bbox.w - cLen, bbox.y + bbox.h); ctx.lineTo(bbox.x + bbox.w, bbox.y + bbox.h); ctx.lineTo(bbox.x + bbox.w, bbox.y + bbox.h - cLen);
          ctx.stroke();

          // Label Pill above bounding box
          const label = `${det.icon || '🎯'} ${det.class} ${(det.confidence * 100).toFixed(0)}%`;
          ctx.font = 'bold 10px JetBrains Mono';
          const textWidth = ctx.measureText(label).width;

          const pillY = Math.max(16, bbox.y - 6);
          ctx.fillStyle = 'rgba(5, 8, 17, 0.88)';
          ctx.fillRect(bbox.x, pillY - 12, textWidth + 10, 16);
          ctx.strokeStyle = color;
          ctx.strokeRect(bbox.x, pillY - 12, textWidth + 10, 16);

          ctx.fillStyle = color;
          ctx.fillText(label, bbox.x + 5, pillY);

          // If this is the active tracking target, add LOCKED banner
          if (isPrimary) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
            ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 9px JetBrains Mono';
            ctx.fillText('★ LOCKED TARGET', bbox.x + 5, bbox.y + bbox.h - 6);
          }
        }

        // Centroid Mark
        ctx.beginPath();
        ctx.arc(det.x, det.y, isPrimary ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }

    // 3. Kalman Filter Kinematics & Velocity Arrow (Attached to Primary Target)
    if (this.showKalmanPrediction && kalmanState && kalmanState.x !== undefined && primaryTarget) {
      const kx = kalmanState.x;
      const ky = kalmanState.y;

      // Position diamond
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(kx, ky - 7);
      ctx.lineTo(kx + 7, ky);
      ctx.lineTo(kx, ky + 7);
      ctx.lineTo(kx - 7, ky);
      ctx.closePath();
      ctx.stroke();

      // Velocity Arrow
      if (Math.hypot(kalmanState.vx, kalmanState.vy) > 2) {
        const arrowScale = 0.35;
        const arrowEndX = kx + kalmanState.vx * arrowScale;
        const arrowEndY = ky + kalmanState.vy * arrowScale;

        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(kx, ky);
        ctx.lineTo(arrowEndX, arrowEndY);
        ctx.stroke();
      }

      // 12-Frame Forward Forecast Curve (Violet Dotted)
      if (forwardForecast && forwardForecast.length > 0) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(kx, ky);
        forwardForecast.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 4. Telemetry Footer inside canvas
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '10px JetBrains Mono';
    const totalCount = allDetections.length;
    const targetLabel = primaryTarget ? `${primaryTarget.class}` : 'SEARCHING';
    ctx.fillText(`DETECTED ENTITIES: ${totalCount} | ACTIVE TARGET: ${targetLabel}`, 14, h - 16);
    ctx.fillText(`BORESIGHT OFFSET: ${errorMag.toFixed(1)} px`, 14, h - 30);

    ctx.restore();
  }
}

window.CameraViewport = CameraViewport;
