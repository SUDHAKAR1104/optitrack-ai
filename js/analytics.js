/**
 * OptiTrack AI - Real-time Performance & Telemetry Charting Engine
 * Zero-dependency HTML5 Canvas timeseries renderer optimized for 60 FPS update.
 */
class TelemetryCharts {
  constructor(errorCanvasId, latencyCanvasId) {
    this.errorCanvas = document.getElementById(errorCanvasId);
    this.latencyCanvas = document.getElementById(latencyCanvasId);
    
    this.errorCtx = this.errorCanvas ? this.errorCanvas.getContext('2d') : null;
    this.latencyCtx = this.latencyCanvas ? this.latencyCanvas.getContext('2d') : null;

    // Rolling history buffers (max 120 samples)
    this.maxSamples = 100;
    this.errorHistory = [];
    this.latencyHistory = [];
    this.fpsHistory = [];
  }

  addDataPoint(errorPx, latencyMs, fps) {
    this.errorHistory.push(Math.max(0, errorPx));
    if (this.errorHistory.length > this.maxSamples) {
      this.errorHistory.shift();
    }

    this.latencyHistory.push(Math.max(0, latencyMs));
    if (this.latencyHistory.length > this.maxSamples) {
      this.latencyHistory.shift();
    }

    this.fpsHistory.push(Math.max(0, fps));
    if (this.fpsHistory.length > this.maxSamples) {
      this.fpsHistory.shift();
    }
  }

  clear() {
    this.errorHistory = [];
    this.latencyHistory = [];
    this.fpsHistory = [];
  }

  render() {
    this.renderErrorChart();
    this.renderLatencyChart();
  }

  renderErrorChart() {
    if (!this.errorCtx || !this.errorCanvas) return;
    const ctx = this.errorCtx;
    const w = this.errorCanvas.width = this.errorCanvas.parentElement.clientWidth || 400;
    const h = this.errorCanvas.height = 200;

    // Dark background
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, w, h);

    // Gridlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 30; y < h; y += 35) {
      ctx.beginPath();
      ctx.moveTo(35, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }

    // ISRO Coarse Alignment Threshold line (10 px)
    const maxVal = 25.0; // scale up to 25 px
    const thresholdY = h - (10.0 / maxVal) * (h - 40) - 20;

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(35, thresholdY);
    ctx.lineTo(w - 10, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = '9px JetBrains Mono';
    ctx.fillText('ISRO SPEC (10 px)', w - 95, thresholdY - 4);

    // Y-Axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px JetBrains Mono';
    ctx.fillText('20px', 5, h - (20.0 / maxVal) * (h - 40) - 16);
    ctx.fillText('10px', 5, thresholdY + 3);
    ctx.fillText('0px', 10, h - 18);

    if (this.errorHistory.length < 2) return;

    // Draw Error Curve
    const stepX = (w - 45) / (this.maxSamples - 1);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    this.errorHistory.forEach((val, idx) => {
      const x = 35 + idx * stepX;
      const clampedVal = Math.min(maxVal, val);
      const y = h - (clampedVal / maxVal) * (h - 40) - 20;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Subtle area glow
    ctx.lineTo(35 + (this.errorHistory.length - 1) * stepX, h - 20);
    ctx.lineTo(35, h - 20);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.fill();

    // Current latest value
    const latestVal = this.errorHistory[this.errorHistory.length - 1] || 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px JetBrains Mono';
    ctx.fillText(`CURRENT ERROR: ${latestVal.toFixed(2)} px`, 40, 22);
  }

  renderLatencyChart() {
    if (!this.latencyCtx || !this.latencyCanvas) return;
    const ctx = this.latencyCtx;
    const w = this.latencyCanvas.width = this.latencyCanvas.parentElement.clientWidth || 300;
    const h = this.latencyCanvas.height = 200;

    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, w, h);

    // Gridlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 30; y < h; y += 35) {
      ctx.beginPath();
      ctx.moveTo(35, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }

    const maxLatency = 50.0; // 50 ms scale
    if (this.latencyHistory.length < 2) return;

    const stepX = (w - 45) / (this.maxSamples - 1);

    // Draw Latency Curve (Orange/Amber)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    this.latencyHistory.forEach((val, idx) => {
      const x = 35 + idx * stepX;
      const clampedVal = Math.min(maxLatency, val);
      const y = h - (clampedVal / maxLatency) * (h - 40) - 20;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Current latest latency and FPS
    const latestLat = this.latencyHistory[this.latencyHistory.length - 1] || 0;
    const latestFps = this.fpsHistory[this.fpsHistory.length - 1] || 0;

    ctx.fillStyle = '#f59e0b';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(`LATENCY: ${latestLat.toFixed(1)} ms`, 38, 20);
    ctx.fillStyle = '#10b981';
    ctx.fillText(`FPS: ${latestFps.toFixed(0)}`, w - 75, 20);
  }
}

window.TelemetryCharts = TelemetryCharts;
