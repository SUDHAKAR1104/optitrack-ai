/**
 * OptiTrack AI - 5-State Finite State Machine (FSM)
 * States: SEARCHING -> ACQUIRING -> TRACKING -> COASTING -> REACQUIRING
 */
class TrackingFSM {
  constructor() {
    this.STATE = {
      SEARCHING: 'SEARCHING',
      ACQUIRING: 'ACQUIRING',
      TRACKING: 'TRACKING',
      COASTING: 'COASTING',
      REACQUIRING: 'REACQUIRING'
    };

    this.currentState = this.STATE.SEARCHING;
    this.consecutiveDetections = 0;
    this.consecutiveMisses = 0;
    this.stateTimer = 0; // seconds in current state
    this.coastingTimer = 0;
    this.reacqStartTime = 0;
    this.lastReacqDuration = 0.0;

    // Tuning thresholds
    this.acquireThreshold = 3;   // Frames of consistent detection needed to lock
    this.coastingTimeout = 2.5;  // Max seconds to dead-reckon before declaring LOST/SEARCHING
    this.lostThreshold = 4;      // Frames of missing detection to enter COASTING
    
    // Performance accumulators
    this.totalFrames = 0;
    this.lockedFrames = 0;
  }

  reset() {
    this.currentState = this.STATE.SEARCHING;
    this.consecutiveDetections = 0;
    this.consecutiveMisses = 0;
    this.stateTimer = 0;
    this.coastingTimer = 0;
    this.totalFrames = 0;
    this.lockedFrames = 0;
    this.lastReacqDuration = 0.0;
  }

  update(hasDetection, confidence, dt) {
    this.totalFrames++;
    this.stateTimer += dt;

    const prevState = this.currentState;

    if (hasDetection && confidence > 0.35) {
      this.consecutiveDetections++;
      this.consecutiveMisses = 0;
    } else {
      this.consecutiveMisses++;
      this.consecutiveDetections = 0;
    }

    switch (this.currentState) {
      case this.STATE.SEARCHING:
        if (hasDetection) {
          this.transitionTo(this.STATE.ACQUIRING);
        }
        break;

      case this.STATE.ACQUIRING:
        if (this.consecutiveDetections >= this.acquireThreshold) {
          this.transitionTo(this.STATE.TRACKING);
          if (window.telemetryAudio) window.telemetryAudio.playLockAcquired();
        } else if (this.consecutiveMisses > 2) {
          this.transitionTo(this.STATE.SEARCHING);
        }
        break;

      case this.STATE.TRACKING:
        this.lockedFrames++;
        if (this.consecutiveMisses >= this.lostThreshold) {
          // Optical signal dropped / occluded -> enter COASTING
          this.transitionTo(this.STATE.COASTING);
          this.coastingTimer = 0;
          if (window.telemetryAudio) window.telemetryAudio.playWarningCoasting();
        }
        break;

      case this.STATE.COASTING:
        this.coastingTimer += dt;
        if (hasDetection) {
          // Re-emergence during coasting
          this.reacqStartTime = performance.now();
          this.transitionTo(this.STATE.REACQUIRING);
        } else if (this.coastingTimer > this.coastingTimeout) {
          // Coasting window expired without signal recovery
          this.transitionTo(this.STATE.SEARCHING);
          if (window.telemetryAudio) window.telemetryAudio.playTargetLost();
        }
        break;

      case this.STATE.REACQUIRING:
        if (hasDetection) {
          if (this.consecutiveDetections >= 2) {
            this.lastReacqDuration = (performance.now() - this.reacqStartTime) / 1000;
            this.transitionTo(this.STATE.TRACKING);
            if (window.telemetryAudio) window.telemetryAudio.playLockAcquired();
          }
        } else {
          this.transitionTo(this.STATE.COASTING);
        }
        break;
    }

    return {
      state: this.currentState,
      changed: prevState !== this.currentState,
      lockRate: this.totalFrames > 0 ? (this.lockedFrames / this.totalFrames) * 100 : 0,
      reacqTime: this.lastReacqDuration,
      isLocked: this.currentState === this.STATE.TRACKING,
      isCoasting: this.currentState === this.STATE.COASTING
    };
  }

  transitionTo(newState) {
    this.currentState = newState;
    this.stateTimer = 0;
  }
}

window.TrackingFSM = TrackingFSM;
