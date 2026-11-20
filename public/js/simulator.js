/**
 * OptiTrack AI - World Simulator & Virtual FSOC Receiver Gimbal Engine
 * Provides dual rendering:
 * 1. LIVE WEBCAM MODE: Renders the Virtual FSOC Receiver Gimbal, closed-loop line-of-sight
 *    tracking reticle, Kalman kinematic velocity vectors, and occlusion dead-reckoning.
 * 2. SYNTHETIC MODE: Renders the procedural orbital space, remote satellite, and cloud occlusions.
 */
class WorldSimulator {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.worldWidth = 1400;
    this.worldHeight = 1000;
    
    // Remote FSOC Terminal (Used in Synthetic Mode)
    this.beacon = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      heading: 0,
      intensity: 1.0,
      isOccluded: false,
      color: '#00ff66'
    };

    this.cameraFOV = { width: 640, height: 480 };
    this.scenario = 'T2';
    this.simTime = 0.0;
    
    // Synthetic disturbances
    this.noiseEnabled = false;
    this.scintillationEnabled = false;
    this.blurEnabled = false;
    this.occlusionEnabled = false;
    this.distractorsEnabled = false;
    this.distractors = [];

    this.occluder = { x: 0, y: 0, vx: 35, radius: 65, active: false };
    this.stars = [];
    this.initStars();
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < 160; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * this.worldWidth,
        y: (Math.random() - 0.5) * this.worldHeight,
        size: Math.random() * 1.8 + 0.5,
        alpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 2 + 1
      });
    }
  }

  initDistractors() {
    this.distractors = [
      { x: -140, y: -80, size: 4, intensity: 0.85, color: '#ffffff' },
      { x: 120, y: 160, size: 5, intensity: 0.9, color: '#e0f2fe' },
      { x: -220, y: 130, size: 3.5, intensity: 0.8, color: '#fef08a' }
    ];
  }

  setScenario(scenarioId) {
    this.scenario = scenarioId;
    this.simTime = 0.0;
    this.noiseEnabled = (scenarioId === 'T4');
    this.scintillationEnabled = (scenarioId === 'T4');
    this.blurEnabled = (scenarioId === 'T5');
    this.occlusionEnabled = (scenarioId === 'T6');
    this.distractorsEnabled = (scenarioId === 'T8');
    
    if (this.distractorsEnabled) this.initDistractors();
    else this.distractors = [];

    this.occluder.active = (scenarioId === 'T6');
    this.resetTrajectory();
  }

  resetTrajectory() {
    this.simTime = 0.0;
    switch (this.scenario) {
      case 'T1': this.beacon.x = 0; this.beacon.y = 0; this.beacon.vx = 0; this.beacon.vy = 0; break;
      case 'T2': this.beacon.x = -240; this.beacon.y = -60; this.beacon.vx = 60; this.beacon.vy = 20; break;
      case 'T3': this.beacon.x = -180; this.beacon.y = 0; this.beacon.vx = 0; this.beacon.vy = 0; break;
      case 'T4': this.beacon.x = -150; this.beacon.y = -40; this.beacon.vx = 45; this.beacon.vy = 15; break;
      case 'T5': this.beacon.x = -180; this.beacon.y = 50; this.beacon.vx = 50; this.beacon.vy = -18; break;
      case 'T6': this.beacon.x = -200; this.beacon.y = -20; this.beacon.vx = 50; this.beacon.vy = 8; break;
      case 'T7': this.beacon.x = -180; this.beacon.y = -80; this.beacon.vx = 65; this.beacon.vy = 0; break;
      case 'T8': this.beacon.x = -180; this.beacon.y = -50; this.beacon.vx = 55; this.beacon.vy = 22; break;
      default: this.beacon.x = -100; this.beacon.y = 0; this.beacon.vx = 40; this.beacon.vy = 10; break;
    }
  }

  update(dt) {
    this.simTime += dt;
    const t = this.simTime;

    switch (this.scenario) {
      case 'T1': this.beacon.x = 0; this.beacon.y = 0; break;
      case 'T2':
        this.beacon.x += this.beacon.vx * dt;
        this.beacon.y += this.beacon.vy * dt;
        if (Math.abs(this.beacon.x) > 300) this.beacon.vx *= -1;
        if (Math.abs(this.beacon.y) > 160) this.beacon.vy *= -1;
        break;
      case 'T3':
        this.beacon.x = 220 * Math.cos(0.9 * t);
        this.beacon.y = 130 * Math.sin(1.6 * t);
        this.beacon.vx = -220 * 0.9 * Math.sin(0.9 * t);
        this.beacon.vy = 130 * 1.6 * Math.cos(1.6 * t);
        break;
      case 'T6':
        this.beacon.x += this.beacon.vx * dt;
        this.beacon.y += this.beacon.vy * dt;
        if (Math.abs(this.beacon.x) > 300) this.beacon.vx *= -1;
        const cycle = t % 6.0;
        this.beacon.isOccluded = (cycle >= 2.0 && cycle <= 3.5);
        break;
      case 'T7':
        // Abrupt 90-Degree Step Acceleration at t = 2.0s
        if (t < 2.0) {
          this.beacon.x += this.beacon.vx * dt;
          this.beacon.y += this.beacon.vy * dt;
        } else if (t < 2.05) {
          this.beacon.vx = 0;
          this.beacon.vy = 65;
          this.beacon.x += this.beacon.vx * dt;
          this.beacon.y += this.beacon.vy * dt;
        } else {
          this.beacon.x += this.beacon.vx * dt;
          this.beacon.y += this.beacon.vy * dt;
          if (Math.abs(this.beacon.y) > 170) this.beacon.vy *= -1;
        }
        break;
      default:
        this.beacon.x += this.beacon.vx * dt;
        this.beacon.y += this.beacon.vy * dt;
        if (Math.abs(this.beacon.x) > 300) this.beacon.vx *= -1;
        if (Math.abs(this.beacon.y) > 160) this.beacon.vy *= -1;
        break;
    }
  }

  /**
   * Render either Virtual Gimbal Viewport (Live Webcam) or Space Simulator (Synthetic)
   */
  render(isWebcamMode, camPan = 0, camTilt = 0, kalmanState = null, forecast = [], fsmState = 'SEARCHING', errorMag = 0) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    if (isWebcamMode) {
      this.renderVirtualGimbalView(ctx, w, h, cx, cy, camPan, camTilt, kalmanState, forecast, fsmState, errorMag);
    } else {
      this.renderSpaceSimulatorView(ctx, w, h, cx, cy, camPan, camTilt);
    }
  }

  /**
   * Render Virtual Camera Tracking System (The ISRO SIH26169 Solution)
   */
  renderVirtualGimbalView(ctx, w, h, cx, cy, camPan, camTilt, kalmanState, forecast, fsmState, errorMag) {
    ctx.save();

    // Dark Obsidian Cockpit Background
    ctx.fillStyle = '#040714';
    ctx.fillRect(0, 0, w, h);

    // Coordinate Polar Reticle & Azimuth Scale
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 1;
    [60, 120, 180, 240].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Azimuth axes (0°, 90°, 180°, 270°)
    ctx.beginPath();
    ctx.moveTo(cx, 20); ctx.lineTo(cx, h - 20);
    ctx.moveTo(20, cy); ctx.lineTo(w - 20, cy);
    ctx.stroke();

    // Degrees labels
    ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.font = '9px JetBrains Mono';
    ctx.fillText('0° (ZENITH)', cx + 6, 32);
    ctx.fillText('90°', w - 45, cy - 6);
    ctx.fillText('180°', cx + 6, h - 26);
    ctx.fillText('270°', 26, cy - 6);

    // Concentric Boresight Locking Rings
    // Coarse Alignment Cone (50 px)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.fillText('COARSE CONE (50px)', cx + 55, cy - 4);

    // Fine Alignment Target Cone (15 px)
    const isFineLocked = (errorMag <= 10 && fsmState === 'TRACKING');
    ctx.strokeStyle = isFineLocked ? '#10b981' : 'rgba(0, 240, 255, 0.5)';
    ctx.lineWidth = isFineLocked ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.stroke();

    // Virtual Camera Gimbal Actuation Line-of-Sight
    // Virtual camera moves by [camPan, camTilt]
    const gimbalX = cx + (camPan * 0.4);
    const gimbalY = cy + (camTilt * 0.4);

    // Gimbal crosshair reticle
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(gimbalX, gimbalY, 28, 0, Math.PI * 2);
    ctx.stroke();

    // Gimbal vector from center
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(gimbalX, gimbalY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Kalman Filter Target Kinematics (Physical Beacon projected in virtual gimbal)
    if (kalmanState && kalmanState.x !== undefined) {
      // Map camera coordinate (0..640, 0..480) relative to center
      const targetRelX = cx + (kalmanState.x - 320) * 0.7;
      const targetRelY = cy + (kalmanState.y - 240) * 0.7;

      // Draw Trajectory Lead Forecast (Violet)
      if (forecast && forecast.length > 0) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(targetRelX, targetRelY);
        forecast.forEach(pt => {
          ctx.lineTo(cx + (pt.x - 320) * 0.7, cy + (pt.y - 240) * 0.7);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Target Marker Diamond
      const targetColor = (fsmState === 'COASTING') ? '#f59e0b' : '#10b981';
      ctx.strokeStyle = targetColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(targetRelX, targetRelY - 8);
      ctx.lineTo(targetRelX + 8, targetRelY);
      ctx.lineTo(targetRelX, targetRelY + 8);
      ctx.lineTo(targetRelX - 8, targetRelY);
      ctx.closePath();
      ctx.stroke();

      // Velocity Arrow
      if (Math.hypot(kalmanState.vx, kalmanState.vy) > 3) {
        const vxScale = kalmanState.vx * 0.35;
        const vyScale = kalmanState.vy * 0.35;
        ctx.strokeStyle = targetColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(targetRelX, targetRelY);
        ctx.lineTo(targetRelX + vxScale, targetRelY + vyScale);
        ctx.stroke();
      }

      // Target Label
      ctx.fillStyle = targetColor;
      ctx.font = '10px JetBrains Mono';
      const label = (fsmState === 'COASTING') ? 'KALMAN DEAD-RECKONING (COASTING)' : `BEACON SPEED: ${kalmanState.speed.toFixed(1)} px/s`;
      ctx.fillText(label, targetRelX + 12, targetRelY - 4);
    }

    // Top Status Pill inside canvas
    ctx.fillStyle = 'rgba(5, 8, 17, 0.85)';
    ctx.fillRect(16, 16, 260, 48);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.strokeRect(16, 16, 260, 48);

    ctx.fillStyle = '#00f0ff';
    ctx.font = '700 11px JetBrains Mono';
    ctx.fillText('VIRTUAL CAMERA GIMBAL CONTROLLER', 26, 33);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(`PID ACTUATION: [${camPan.toFixed(0)}, ${camTilt.toFixed(0)}] px`, 26, 50);

    ctx.restore();
  }

  /**
   * Render Synthetic Orbital Environment (Used in Synthetic Space Mode)
   */
  renderSpaceSimulatorView(ctx, w, h, cx, cy, camPan, camTilt) {
    ctx.save();
    ctx.fillStyle = '#03050c';
    ctx.fillRect(0, 0, w, h);

    const scale = 0.75;

    // Starfield
    this.stars.forEach(s => {
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.beginPath();
      ctx.arc(cx + s.x * scale, cy + s.y * scale, s.size * scale, 0, Math.PI * 2);
      ctx.fill();
    });

    // Cloud occluder
    if (this.occlusionEnabled || this.occluder.active) {
      const ocX = cx + this.occluder.x * scale;
      const ocY = cy + this.occluder.y * scale;
      const ocR = this.occluder.radius * scale;
      const grad = ctx.createRadialGradient(ocX, ocY, 5, ocX, ocY, ocR);
      grad.addColorStop(0, 'rgba(71, 85, 105, 0.95)');
      grad.addColorStop(1, 'rgba(30, 41, 59, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ocX, ocY, ocR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Remote satellite beacon
    const bx = cx + this.beacon.x * scale;
    const by = cy + this.beacon.y * scale;
    if (!this.beacon.isOccluded) {
      ctx.fillStyle = '#00ff66';
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px JetBrains Mono';
      ctx.fillText('REMOTE SATELLITE BEACON', bx + 10, by - 6);
    }

    // Camera FOV frustum
    const fovW = 640 * scale * 0.7;
    const fovH = 480 * scale * 0.7;
    ctx.strokeStyle = '#00f0ff';
    ctx.strokeRect(cx + camPan * scale - fovW/2, cy + camTilt * scale - fovH/2, fovW, fovH);

    ctx.restore();
  }

  getBeaconState() { return this.beacon; }
  getDistractors() { return this.distractors; }
}

window.WorldSimulator = WorldSimulator;
