/**
 * OptiTrack AI - Ultra-Precision Universal AI Detection Engine
 * Deep Learning 80-Class Detection (Humans, Animals, Objects, Electronics)
 * Features:
 *  - Native Canvas Ingestion (Zero coordinate distortion or mirror misalignment)
 *  - High-Precision MobileNet-v2 Engine with Dynamic Confidence Tuning
 *  - Temporal EMA Bounding Box Smoothing (Eliminates jitter)
 *  - Non-Maximum Suppression (NMS) to eliminate duplicate boxes
 *  - Sub-pixel Optical Moments for Light Beacons & Lasers
 */
class UniversalAIDetector {
  constructor() {
    this.model = null;
    this.isLoadingModel = false;
    this.isModelReady = false;
    this.modelError = null;
    this.modelType = 'mobilenet_v2'; // High-precision full model

    // Category Toggles
    this.detectHumans = true;
    this.detectAnimals = true;
    this.detectObjects = true;
    this.detectBeacons = true;

    // Detection Sensitivity (Tunable via slider: 0.15 - 0.85)
    this.minObjectConfidence = 0.35; // Tuned for high sensitivity and precision
    this.maxDetections = 20;

    // Target Selection: 'AUTO', 'PERSON', 'ANIMAL', 'OBJECT', 'BEACON', or specific ID
    this.targetSelection = 'AUTO';
    this.lockedTargetId = null;

    // Temporal Smoothing Memory (EMA)
    this.previousTracks = new Map(); // id -> smoothed bbox
    this.cachedAIPredictions = [];
    this.isDetecting = false;
    this.lastInferenceTime = 0;

    // Optical Beacon Parameters
    this.activePreset = 'PHONE_FLASHLIGHT';
    this.hueMin = 0;
    this.hueMax = 360;
    this.satMin = 0;
    this.valMin = 65;
    this.minIntensity = 160;
    this.minArea = 8;
    this.maxArea = 20000;

    // Off-screen canvas for binary mask preview
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });

    // Comprehensive 80-Class COCO Dictionary with Icons & Metadata
    this.classMetadata = this.initClassMetadata();

    // Start loading high-precision model
    this.initCocoModel();
  }

  initClassMetadata() {
    return {
      // Humans
      'person': { category: 'HUMAN', icon: '👤', label: 'HUMAN / PERSON', color: '#00f0ff' },
      
      // Animals
      'dog': { category: 'ANIMAL', icon: '🐶', label: 'DOG', color: '#f59e0b' },
      'cat': { category: 'ANIMAL', icon: '🐱', label: 'CAT', color: '#f59e0b' },
      'bird': { category: 'ANIMAL', icon: '🦜', label: 'BIRD', color: '#f59e0b' },
      'horse': { category: 'ANIMAL', icon: '🐴', label: 'HORSE', color: '#f59e0b' },
      'sheep': { category: 'ANIMAL', icon: '🐑', label: 'SHEEP', color: '#f59e0b' },
      'cow': { category: 'ANIMAL', icon: '🐮', label: 'COW', color: '#f59e0b' },
      'elephant': { category: 'ANIMAL', icon: '🐘', label: 'ELEPHANT', color: '#f59e0b' },
      'bear': { category: 'ANIMAL', icon: '🐻', label: 'BEAR', color: '#f59e0b' },
      'zebra': { category: 'ANIMAL', icon: '🦓', label: 'ZEBRA', color: '#f59e0b' },
      'giraffe': { category: 'ANIMAL', icon: '🦒', label: 'GIRAFFE', color: '#f59e0b' },

      // Electronics & Gadgets
      'cell phone': { category: 'OBJECT', icon: '📱', label: 'SMARTPHONE', color: '#a855f7' },
      'laptop': { category: 'OBJECT', icon: '💻', label: 'LAPTOP', color: '#a855f7' },
      'mouse': { category: 'OBJECT', icon: '🖱️', label: 'MOUSE', color: '#a855f7' },
      'remote': { category: 'OBJECT', icon: '📺', label: 'REMOTE', color: '#a855f7' },
      'keyboard': { category: 'OBJECT', icon: '⌨️', label: 'KEYBOARD', color: '#a855f7' },
      'tv': { category: 'OBJECT', icon: '🖥️', label: 'TV / MONITOR', color: '#a855f7' },
      'clock': { category: 'OBJECT', icon: '⏰', label: 'CLOCK', color: '#a855f7' },
      'microwave': { category: 'OBJECT', icon: '📻', label: 'MICROWAVE', color: '#a855f7' },
      'toaster': { category: 'OBJECT', icon: '🍞', label: 'TOASTER', color: '#a855f7' },

      // Food & Drink Items
      'bottle': { category: 'OBJECT', icon: '🍾', label: 'BOTTLE', color: '#f43f5e' },
      'cup': { category: 'OBJECT', icon: '☕', label: 'CUP / MUG', color: '#f43f5e' },
      'wine glass': { category: 'OBJECT', icon: '🍷', label: 'WINE GLASS', color: '#f43f5e' },
      'fork': { category: 'OBJECT', icon: '🍴', label: 'FORK', color: '#f43f5e' },
      'knife': { category: 'OBJECT', icon: '🔪', label: 'KNIFE', color: '#f43f5e' },
      'spoon': { category: 'OBJECT', icon: '🥄', label: 'SPOON', color: '#f43f5e' },
      'bowl': { category: 'OBJECT', icon: '🥣', label: 'BOWL', color: '#f43f5e' },
      'banana': { category: 'OBJECT', icon: '🍌', label: 'BANANA', color: '#f43f5e' },
      'apple': { category: 'OBJECT', icon: '🍎', label: 'APPLE', color: '#f43f5e' },
      'sandwich': { category: 'OBJECT', icon: '🥪', label: 'SANDWICH', color: '#f43f5e' },
      'orange': { category: 'OBJECT', icon: '🍊', label: 'ORANGE', color: '#f43f5e' },
      'broccoli': { category: 'OBJECT', icon: '🥦', label: 'BROCCOLI', color: '#f43f5e' },
      'carrot': { category: 'OBJECT', icon: '🥕', label: 'CARROT', color: '#f43f5e' },
      'pizza': { category: 'OBJECT', icon: '🍕', label: 'PIZZA', color: '#f43f5e' },
      'donut': { category: 'OBJECT', icon: '🍩', label: 'DONUT', color: '#f43f5e' },
      'cake': { category: 'OBJECT', icon: '🎂', label: 'CAKE', color: '#f43f5e' },

      // Tools & Personal Items
      'book': { category: 'OBJECT', icon: '📖', label: 'BOOK', color: '#10b981' },
      'scissors': { category: 'OBJECT', icon: '✂️', label: 'SCISSORS', color: '#10b981' },
      'backpack': { category: 'OBJECT', icon: '🎒', label: 'BACKPACK', color: '#10b981' },
      'umbrella': { category: 'OBJECT', icon: '☂️', label: 'UMBRELLA', color: '#10b981' },
      'handbag': { category: 'OBJECT', icon: '👜', label: 'HANDBAG', color: '#10b981' },
      'suitcase': { category: 'OBJECT', icon: '🧳', label: 'SUITCASE', color: '#10b981' },
      'teddy bear': { category: 'OBJECT', icon: '🧸', label: 'TOY', color: '#10b981' },
      'toothbrush': { category: 'OBJECT', icon: '🪥', label: 'TOOTHBRUSH', color: '#10b981' },
      'vase': { category: 'OBJECT', icon: '🏺', label: 'VASE', color: '#10b981' },

      // Furniture & Indoor
      'chair': { category: 'OBJECT', icon: '🪑', label: 'CHAIR', color: '#06b6d4' },
      'couch': { category: 'OBJECT', icon: '🛋️', label: 'SOFA', color: '#06b6d4' },
      'potted plant': { category: 'OBJECT', icon: '🪴', label: 'PLANT', color: '#06b6d4' },
      'bed': { category: 'OBJECT', icon: '🛏️', label: 'BED', color: '#06b6d4' },
      'dining table': { category: 'OBJECT', icon: '🪵', label: 'TABLE', color: '#06b6d4' },

      // Vehicles
      'car': { category: 'OBJECT', icon: '🚗', label: 'CAR', color: '#38bdf8' },
      'bicycle': { category: 'OBJECT', icon: '🚲', label: 'BICYCLE', color: '#38bdf8' },
      'motorcycle': { category: 'OBJECT', icon: '🏍️', label: 'MOTORCYCLE', color: '#38bdf8' },
      'airplane': { category: 'OBJECT', icon: '✈️', label: 'AIRPLANE', color: '#38bdf8' },
      'bus': { category: 'OBJECT', icon: '🚌', label: 'BUS', color: '#38bdf8' },
      'train': { category: 'OBJECT', icon: '🚆', label: 'TRAIN', color: '#38bdf8' },
      'truck': { category: 'OBJECT', icon: '🚚', label: 'TRUCK', color: '#38bdf8' },
      'boat': { category: 'OBJECT', icon: '⛵', label: 'BOAT', color: '#38bdf8' }
    };
  }

  async initCocoModel() {
    if (this.isLoadingModel || this.isModelReady) return;
    this.isLoadingModel = true;

    try {
      if (typeof cocoSsd !== 'undefined') {
        console.log('[AI Detector] Loading High-Precision MobileNet-v2 Model...');
        // Load high-precision mobilenet_v2
        this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
        this.isModelReady = true;
        this.isLoadingModel = false;
        console.log('[AI Detector] High-Precision COCO-SSD Model Ready!');
        if (window.telemetryAudio) window.telemetryAudio.playLockAcquired();
      } else {
        setTimeout(() => this.initCocoModel(), 1200);
      }
    } catch (err) {
      console.warn('[AI Detector] Trying fallback to lite_mobilenet_v2:', err);
      try {
        this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        this.isModelReady = true;
        this.isLoadingModel = false;
      } catch (e2) {
        this.modelError = e2.message;
        this.isLoadingModel = false;
      }
    }
  }

  setConfidenceThreshold(threshold) {
    this.minObjectConfidence = Math.max(0.1, Math.min(0.9, threshold));
  }

  setPreset(preset) {
    this.activePreset = preset;
    if (preset === 'PHONE_FLASHLIGHT') {
      this.hueMin = 0; this.hueMax = 360; this.satMin = 0; this.valMin = 65;
      this.minIntensity = 160;
    } else if (preset === 'GREEN_LASER') {
      this.hueMin = 70; this.hueMax = 170; this.satMin = 35; this.valMin = 50;
      this.minIntensity = 75;
    } else if (preset === 'RED_LASER') {
      this.hueMin = 330; this.hueMax = 30; this.satMin = 40; this.valMin = 50;
      this.minIntensity = 75;
    } else if (preset === 'BLUE_LIGHT') {
      this.hueMin = 175; this.hueMax = 245; this.satMin = 35; this.valMin = 50;
      this.minIntensity = 75;
    }
  }

  setCategoryFilter(category, enabled) {
    if (category === 'HUMAN') this.detectHumans = enabled;
    if (category === 'ANIMAL') this.detectAnimals = enabled;
    if (category === 'OBJECT') this.detectObjects = enabled;
    if (category === 'BEACON') this.detectBeacons = enabled;
  }

  setTargetSelection(type) {
    this.targetSelection = type;
    this.lockedTargetId = null;
  }

  /**
   * Main multi-modal detection loop
   * Note: Ingests the rendered canvas directly for 100% pixel-perfect alignment!
   */
  async detect(canvas, width, height, predictedPos = null) {
    const rawDetections = [];
    const t0 = performance.now();

    // --- TIER 1: SUB-PIXEL OPTICAL BEACON & FLASHLIGHT DETECTOR ---
    if (this.detectBeacons) {
      const beaconDet = this.detectOpticalBeacon(canvas, width, height, predictedPos);
      if (beaconDet) {
        rawDetections.push(beaconDet);
      }
    }

    // --- TIER 2: TENSORFLOW.JS COCO-SSD DEEP LEARNING ---
    // Ingests canvas directly: no scaling mismatch, no mirror discrepancy!
    if (this.isModelReady && canvas && !this.isDetecting) {
      const now = performance.now();
      // Run inference at ~15-20 FPS; EMA smoothing maintains smooth 60 FPS visual boxes
      if (now - this.lastInferenceTime > 55) {
        this.isDetecting = true;
        this.lastInferenceTime = now;

        try {
          const predictions = await this.model.detect(canvas, this.maxDetections, this.minObjectConfidence);
          this.cachedAIPredictions = predictions;
        } catch (err) {
          console.warn('AI inference error:', err);
        } finally {
          this.isDetecting = false;
        }
      }
    }

    // Process and filter AI predictions
    if (this.cachedAIPredictions && this.cachedAIPredictions.length > 0) {
      this.cachedAIPredictions.forEach((pred, index) => {
        const rawClass = pred.class.toLowerCase();
        const meta = this.classMetadata[rawClass] || {
          category: 'OBJECT',
          icon: '📦',
          label: pred.class.toUpperCase(),
          color: '#10b981'
        };

        // Category filter check
        if (meta.category === 'HUMAN' && !this.detectHumans) return;
        if (meta.category === 'ANIMAL' && !this.detectAnimals) return;
        if (meta.category === 'OBJECT' && !this.detectObjects) return;

        // Bounding Box (Already in exact canvas pixels!)
        const bbox = {
          x: Math.max(0, Math.round(pred.bbox[0])),
          y: Math.max(0, Math.round(pred.bbox[1])),
          w: Math.round(pred.bbox[2]),
          h: Math.round(pred.bbox[3])
        };

        // Discard absurd / out-of-frame dimensions
        if (bbox.w < 10 || bbox.h < 10) return;

        const cx = bbox.x + bbox.w / 2;
        const cy = bbox.y + bbox.h / 2;

        rawDetections.push({
          id: `AI-${meta.category}-${rawClass}-${index}`,
          category: meta.category,
          class: meta.label,
          rawClass: rawClass,
          icon: meta.icon,
          color: meta.color,
          confidence: pred.score,
          x: cx,
          y: cy,
          bbox: bbox,
          isBeacon: false
        });
      });
    }

    // --- TIER 3: NON-MAXIMUM SUPPRESSION (NMS) ---
    const nmsDetections = this.applyNMS(rawDetections, 0.65);

    // --- TIER 4: TEMPORAL EMA SMOOTHING (Eliminates jitter) ---
    const smoothedDetections = this.applyTemporalSmoothing(nmsDetections);

    // --- TIER 5: RESOLVE PRIMARY TARGET FOR KALMAN FILTER ---
    const primaryTarget = this.resolvePrimaryTarget(smoothedDetections, predictedPos);

    return {
      allDetections: smoothedDetections,
      primaryTarget: primaryTarget,
      processingTimeMs: performance.now() - t0,
      isModelReady: this.isModelReady,
      isLoadingModel: this.isLoadingModel
    };
  }

  /**
   * Non-Maximum Suppression to eliminate overlapping duplicate boxes
   */
  applyNMS(detections, iouThreshold) {
    if (detections.length <= 1) return detections;

    // Sort by confidence descending
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const selected = [];

    while (sorted.length > 0) {
      const best = sorted.shift();
      selected.push(best);

      for (let i = sorted.length - 1; i >= 0; i--) {
        const other = sorted[i];
        // Calculate IoU (Intersection over Union)
        const iou = this.calculateIoU(best.bbox, other.bbox);
        if (iou > iouThreshold && best.category === other.category) {
          sorted.splice(i, 1); // Discard redundant duplicate
        }
      }
    }

    return selected;
  }

  calculateIoU(boxA, boxB) {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
    const yB = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    if (interArea <= 0) return 0;

    const areaA = boxA.w * boxA.h;
    const areaB = boxB.w * boxB.h;
    return interArea / (areaA + areaB - interArea);
  }

  /**
   * Temporal Exponential Moving Average (EMA) Smoothing
   * Prevents neural network bounding box flickering between frames
   */
  applyTemporalSmoothing(detections) {
    const alpha = 0.70; // 70% new frame, 30% previous frame for crisp reaction with zero jitter
    const newTrackMap = new Map();

    const smoothed = detections.map(det => {
      // Find nearest previous track of same class
      let matchId = null;
      let minDistance = 45; // Pixel radius match

      for (const [prevId, prevBox] of this.previousTracks.entries()) {
        const prevCx = prevBox.x + prevBox.w / 2;
        const prevCy = prevBox.y + prevBox.h / 2;
        const dist = Math.hypot(det.x - prevCx, det.y - prevCy);
        if (dist < minDistance && prevBox.class === det.class) {
          minDistance = dist;
          matchId = prevId;
        }
      }

      if (matchId && this.previousTracks.has(matchId)) {
        const prev = this.previousTracks.get(matchId);
        // Exponential moving average
        const smoothBbox = {
          x: Math.round(alpha * det.bbox.x + (1 - alpha) * prev.x),
          y: Math.round(alpha * det.bbox.y + (1 - alpha) * prev.y),
          w: Math.round(alpha * det.bbox.w + (1 - alpha) * prev.w),
          h: Math.round(alpha * det.bbox.h + (1 - alpha) * prev.h)
        };

        const smoothCx = smoothBbox.x + smoothBbox.w / 2;
        const smoothCy = smoothBbox.y + smoothBbox.h / 2;

        newTrackMap.set(matchId, { ...smoothBbox, class: det.class });

        return {
          ...det,
          x: smoothCx,
          y: smoothCy,
          bbox: smoothBbox
        };
      } else {
        // New track
        newTrackMap.set(det.id, { ...det.bbox, class: det.class });
        return det;
      }
    });

    this.previousTracks = newTrackMap;
    return smoothed;
  }

  /**
   * Select primary target for Kalman Filter & Viewport Gimbal
   */
  resolvePrimaryTarget(detections, predictedPos) {
    if (detections.length === 0) return null;

    // 1. Specific locked target ID
    if (this.lockedTargetId) {
      const locked = detections.find(d => d.id === this.lockedTargetId);
      if (locked) return locked;
    }

    // 2. Filtered target category
    if (this.targetSelection === 'PERSON') {
      const human = detections.find(d => d.category === 'HUMAN');
      if (human) return human;
    } else if (this.targetSelection === 'ANIMAL') {
      const animal = detections.find(d => d.category === 'ANIMAL');
      if (animal) return animal;
    } else if (this.targetSelection === 'OBJECT') {
      const obj = detections.find(d => d.category === 'OBJECT');
      if (obj) return obj;
    } else if (this.targetSelection === 'BEACON') {
      const beacon = detections.find(d => d.isBeacon);
      if (beacon) return beacon;
    }

    // 3. AUTO: Spatial Gating / Data Association with Kalman Prediction
    if (predictedPos && predictedPos.x !== undefined) {
      let closest = null;
      let minDist = Infinity;
      detections.forEach(d => {
        const dist = Math.hypot(d.x - predictedPos.x, d.y - predictedPos.y);
        if (dist < minDist) {
          minDist = dist;
          closest = d;
        }
      });
      if (closest && minDist < 200) return closest;
    }

    // 4. Default: Highest confidence entity
    return detections.reduce((best, curr) => curr.confidence > best.confidence ? curr : best, detections[0]);
  }

  /**
   * Sub-pixel optical beacon & flashlight detection
   */
  detectOpticalBeacon(canvas, width, height, predictedPos = null) {
    const ctx = canvas.getContext('2d');
    const rw = width, rh = height;
    const imgData = ctx.getImageData(0, 0, rw, rh);
    const data = imgData.data;

    if (this.maskCanvas.width !== rw || this.maskCanvas.height !== rh) {
      this.maskCanvas.width = rw;
      this.maskCanvas.height = rh;
    }
    const maskData = this.maskCtx.createImageData(rw, rh);
    const maskPixels = maskData.data;

    const step = 2;
    let totalMom00 = 0, totalMom10 = 0, totalMom01 = 0, matchingPixels = 0;
    let minX = rw, maxX = 0, minY = rh, maxY = 0;

    for (let y = 0; y < rh; y += step) {
      for (let x = 0; x < rw; x += step) {
        const idx = (y * rw + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const intensity = 0.299 * r + 0.587 * g + 0.114 * b;

        if (intensity < this.minIntensity) continue;

        const [h, s, v] = this.rgbToHsv(r, g, b);
        let colorMatch = false;
        if (this.hueMin <= this.hueMax) {
          colorMatch = (h >= this.hueMin && h <= this.hueMax);
        } else {
          colorMatch = (h >= this.hueMin || h <= this.hueMax);
        }

        if (colorMatch && s >= this.satMin && v >= this.valMin) {
          const maskIdx = (y * rw + x) * 4;
          maskPixels[maskIdx] = 236;
          maskPixels[maskIdx + 1] = 72;
          maskPixels[maskIdx + 2] = 153;
          maskPixels[maskIdx + 3] = 255;

          const weight = intensity * intensity;
          totalMom00 += weight;
          totalMom10 += x * weight;
          totalMom01 += y * weight;
          matchingPixels++;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    this.maskCtx.putImageData(maskData, 0, 0);

    if (totalMom00 <= 0 || matchingPixels < this.minArea / 4) {
      return null;
    }

    const cx = totalMom10 / totalMom00;
    const cy = totalMom01 / totalMom00;
    const bboxW = (maxX - minX) + 1;
    const bboxH = (maxY - minY) + 1;
    const area = matchingPixels * step * step;
    const perimeter = 2 * (bboxW + bboxH);
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter);

    const sizeScore = Math.min(1.0, area / 50);
    const circScore = Math.min(1.0, circularity / 0.6);
    const confidence = Math.min(1.0, 0.5 * sizeScore + 0.5 * circScore);

    return {
      id: 'BEACON-OPTICAL',
      category: 'BEACON',
      class: 'OPTICAL BEACON',
      rawClass: 'optical beacon',
      icon: '🔦',
      color: '#ec4899',
      confidence: confidence,
      x: cx,
      y: cy,
      bbox: {
        x: Math.max(0, minX - 4),
        y: Math.max(0, minY - 4),
        w: bboxW + 8,
        h: bboxH + 8
      },
      isBeacon: true,
      circularity: circularity
    };
  }

  sampleColorAt(ctx, x, y) {
    try {
      const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      const r = pixel[0], g = pixel[1], b = pixel[2];
      const intensity = 0.299 * r + 0.587 * g + 0.114 * b;
      const [h, s, v] = this.rgbToHsv(r, g, b);

      if (intensity > 210 && s < 25) {
        this.setPreset('PHONE_FLASHLIGHT');
      } else {
        this.hueMin = Math.max(0, Math.round(h - 30));
        this.hueMax = Math.min(360, Math.round(h + 30));
        this.satMin = Math.max(15, Math.round(s - 25));
        this.valMin = Math.max(40, Math.round(v - 30));
        this.minIntensity = Math.max(60, Math.round(intensity * 0.7));
      }

      return {
        rgb: [r, g, b],
        hsv: [Math.round(h), Math.round(s), Math.round(v)],
        intensity: Math.round(intensity)
      };
    } catch (err) {
      console.warn('Color sampling error:', err);
      return null;
    }
  }

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h * 360, s * 100, v * 100];
  }

  getMaskCanvas() {
    return this.maskCanvas;
  }
}

window.UniversalAIDetector = UniversalAIDetector;
window.OpticalBeaconDetector = UniversalAIDetector;
