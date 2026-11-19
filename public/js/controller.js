/**
 * OptiTrack AI - Digital PID Closed-Loop Camera Viewport Controller
 * Controls Virtual Camera Pan and Tilt to maintain optical beacon centering.
 */
class CameraPIDController {
  constructor() {
    // PID Gains (Tuned for FSOC coarse alignment)
    this.kp = 0.45;
    this.ki = 0.04;
    this.kd = 0.18;

    // Error accumulators
    this.integralX = 0;
    this.integralY = 0;
    this.prevErrorX = 0;
    this.prevErrorY = 0;

    // Actuator constraints
    this.maxIntegral = 200.0;    // Anti-windup clamp
    this.maxSlewRate = 450.0;     // Max px/s angular slew rate
    this.deadband = 1.5;          // Sub-pixel deadband to suppress actuator hunting jitter

    // Current camera position (relative to world origin)
    this.pan = 0.0;
    this.tilt = 0.0;
    
    // Control mode: 'AUTONOMOUS' or 'MANUAL'
    this.mode = 'AUTONOMOUS';
    this.manualVelocity = { x: 0, y: 0 };

    // Spiral search state for SEARCHING mode
    this.searchAngle = 0;
    this.searchRadius = 0;
  }

  setGains(kp, ki, kd, slewRate) {
    if (kp !== undefined) this.kp = Math.max(0, kp);
    if (ki !== undefined) this.ki = Math.max(0, ki);
    if (kd !== undefined) this.kd = Math.max(0, kd);
    if (slewRate !== undefined) this.maxSlewRate = Math.max(50, slewRate);
  }

  reset() {
    this.integralX = 0;
    this.integralY = 0;
    this.prevErrorX = 0;
    this.prevErrorY = 0;
    this.pan = 0;
    this.tilt = 0;
    this.searchAngle = 0;
    this.searchRadius = 0;
  }

  setManualVelocity(vx, vy) {
    this.manualVelocity.x = vx;
    this.manualVelocity.y = vy;
  }

  /**
   * Update controller step
   * @param {object|null} targetPos - Measured/Estimated target position in camera frame {x, y}
   * @param {number} viewWidth - Camera frame width (640)
   * @param {number} viewHeight - Camera frame height (480)
   * @param {string} fsmState - FSM tracking state
   * @param {number} dt - Elapsed seconds
   */
  update(targetPos, viewWidth, viewHeight, fsmState, dt) {
    dt = Math.max(0.001, Math.min(0.1, dt));

    if (this.mode === 'MANUAL') {
      this.pan += this.manualVelocity.x * dt;
      this.tilt += this.manualVelocity.y * dt;
      return {
        pan: this.pan,
        tilt: this.tilt,
        errorX: 0,
        errorY: 0,
        errorMagnitude: 0,
        controlSignalX: this.manualVelocity.x,
        controlSignalY: this.manualVelocity.y
      };
    }

    // Autonomous Mode
    const centerX = viewWidth / 2;
    const centerY = viewHeight / 2;

    if (fsmState === 'SEARCHING') {
      // Execute Archimedean spiral search
      this.searchAngle += 2.5 * dt;
      this.searchRadius = Math.min(300, this.searchRadius + 18 * dt);
      
      const searchTargetX = Math.cos(this.searchAngle) * this.searchRadius;
      const searchTargetY = Math.sin(this.searchAngle) * this.searchRadius;

      this.pan += (searchTargetX - this.pan) * 0.1;
      this.tilt += (searchTargetY - this.tilt) * 0.1;

      return {
        pan: this.pan,
        tilt: this.tilt,
        errorX: 0,
        errorY: 0,
        errorMagnitude: 0,
        controlSignalX: 0,
        controlSignalY: 0
      };
    }

    if (!targetPos) {
      // Coast with zero input / maintain current orientation
      return {
        pan: this.pan,
        tilt: this.tilt,
        errorX: 0,
        errorY: 0,
        errorMagnitude: 0,
        controlSignalX: 0,
        controlSignalY: 0
      };
    }

    // Reset search counters when tracking
    this.searchAngle = 0;
    this.searchRadius = 0;

    // Optical Boresight Error
    const errorX = targetPos.x - centerX;
    const errorY = targetPos.y - centerY;
    const errorMag = Math.hypot(errorX, errorY);

    if (errorMag < this.deadband) {
      return {
        pan: this.pan,
        tilt: this.tilt,
        errorX: errorX,
        errorY: errorY,
        errorMagnitude: errorMag,
        controlSignalX: 0,
        controlSignalY: 0
      };
    }

    // Integral with Anti-Windup Clamping
    this.integralX = Math.max(-this.maxIntegral, Math.min(this.maxIntegral, this.integralX + errorX * dt));
    this.integralY = Math.max(-this.maxIntegral, Math.min(this.maxIntegral, this.integralY + errorY * dt));

    // Derivative term
    const derivX = (errorX - this.prevErrorX) / dt;
    const derivY = (errorY - this.prevErrorY) / dt;

    this.prevErrorX = errorX;
    this.prevErrorY = errorY;

    // PID Control Output
    let uX = this.kp * errorX + this.ki * this.integralX + this.kd * derivX;
    let uY = this.kp * errorY + this.ki * this.integralY + this.kd * derivY;

    // Slew Rate Limiter (Max px/s)
    const maxDelta = this.maxSlewRate * dt;
    uX = Math.max(-maxDelta, Math.min(maxDelta, uX * dt * 30));
    uY = Math.max(-maxDelta, Math.min(maxDelta, uY * dt * 30));

    // Update Camera Gimbal Pan & Tilt
    this.pan += uX;
    this.tilt += uY;

    return {
      pan: this.pan,
      tilt: this.tilt,
      errorX: errorX,
      errorY: errorY,
      errorMagnitude: errorMag,
      controlSignalX: uX,
      controlSignalY: uY
    };
  }
}

window.CameraPIDController = CameraPIDController;
