/**
 * OptiTrack AI - Synthetic Aerospace Audio System
 * Uses Browser Web Audio API to synthesize telemetry beeps, lock tones, and alerts
 */
class TelemetryAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastToneTime = 0;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, type = 'sine', duration = 0.08, gain = 0.1) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      gainNode.gain.setValueAtTime(gain, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  playLockAcquired() {
    if (this.muted) return;
    const now = Date.now();
    if (now - this.lastToneTime < 500) return;
    this.lastToneTime = now;
    
    // Ascending dual-tone confirmation
    this.playTone(880, 'sine', 0.09, 0.12);
    setTimeout(() => this.playTone(1760, 'sine', 0.14, 0.15), 90);
  }

  playWarningCoasting() {
    if (this.muted) return;
    const now = Date.now();
    if (now - this.lastToneTime < 700) return;
    this.lastToneTime = now;
    
    // Intermittent pulse tone
    this.playTone(440, 'triangle', 0.12, 0.1);
  }

  playTargetLost() {
    if (this.muted) return;
    const now = Date.now();
    if (now - this.lastToneTime < 1000) return;
    this.lastToneTime = now;
    
    // Descending alert tone
    this.playTone(330, 'sawtooth', 0.15, 0.08);
    setTimeout(() => this.playTone(220, 'sawtooth', 0.2, 0.08), 120);
  }

  playClick() {
    this.playTone(1200, 'sine', 0.03, 0.05);
  }
}

window.telemetryAudio = new TelemetryAudio();
