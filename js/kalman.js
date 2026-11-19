/**
 * OptiTrack AI - 4-State Discrete Kinematic Kalman Filter
 * State: x = [x, y, vx, vy]^T
 * Observation: z = [zx, zy]^T
 */
class KinematicKalmanFilter {
  constructor(processNoise = 1.2, measurementNoise = 3.5) {
    this.q = processNoise;
    this.r = measurementNoise;
    
    // State: [x, y, vx, vy]
    this.x = [0, 0, 0, 0];
    
    // Covariance matrix P (4x4)
    this.P = [
      [20, 0, 0, 0],
      [0, 20, 0, 0],
      [0, 0, 50, 0],
      [0, 0, 0, 50]
    ];
    
    this.initialized = false;
    this.predictionHorizon = 12; // Frames into the future to predict
  }

  setTuning(q, r, horizon) {
    if (q !== undefined) this.q = Math.max(0.01, q);
    if (r !== undefined) this.r = Math.max(0.1, r);
    if (horizon !== undefined) this.predictionHorizon = Math.max(1, Math.min(60, horizon));
  }

  init(x, y, vx = 0, vy = 0) {
    this.x = [x, y, vx, vy];
    this.P = [
      [10, 0, 0, 0],
      [0, 10, 0, 0],
      [0, 0, 25, 0],
      [0, 0, 0, 25]
    ];
    this.initialized = true;
  }

  predict(dt) {
    if (!this.initialized) return;
    dt = Math.max(0.001, Math.min(0.2, dt));

    // x_prior = F * x
    const x = this.x[0] + this.x[2] * dt;
    const y = this.x[1] + this.x[3] * dt;
    const vx = this.x[2];
    const vy = this.x[3];
    this.x = [x, y, vx, vy];

    // Q matrix for continuous white noise acceleration model
    const dt2 = dt * dt;
    const dt3 = dt2 * dt / 2;
    const dt4 = dt2 * dt2 / 4;
    const q = this.q;

    const Q00 = dt4 * q;
    const Q02 = dt3 * q;
    const Q11 = dt4 * q;
    const Q13 = dt3 * q;
    const Q22 = dt2 * q;
    const Q33 = dt2 * q;

    // P_prior = F * P * F^T + Q
    const P = this.P;
    const P00 = P[0][0] + dt * (P[2][0] + P[0][2] + dt * P[2][2]) + Q00;
    const P01 = P[0][1] + dt * (P[2][1] + P[0][3] + dt * P[2][3]);
    const P02 = P[0][2] + dt * P[2][2] + Q02;
    const P03 = P[0][3] + dt * P[2][3];

    const P10 = P[1][0] + dt * (P[3][0] + P[1][2] + dt * P[3][2]);
    const P11 = P[1][1] + dt * (P[3][1] + P[1][3] + dt * P[3][3]) + Q11;
    const P12 = P[1][2] + dt * P[3][2];
    const P13 = P[1][3] + dt * P[3][3] + Q13;

    const P20 = P[2][0] + dt * P[2][2] + Q02;
    const P21 = P[2][1] + dt * P[2][3];
    const P22 = P[2][2] + Q22;
    const P23 = P[2][3];

    const P30 = P[3][0] + dt * P[3][2];
    const P31 = P[3][1] + dt * P[3][3] + Q13;
    const P32 = P[3][2];
    const P33 = P[3][3] + Q33;

    this.P = [
      [P00, P01, P02, P03],
      [P10, P11, P12, P13],
      [P20, P21, P22, P23],
      [P30, P31, P32, P33]
    ];
  }

  update(zx, zy) {
    if (!this.initialized) {
      this.init(zx, zy);
      return;
    }

    const P = this.P;
    const r = this.r;

    // Innovation S = H * P * H^T + R
    // Since H = [[1, 0, 0, 0], [0, 1, 0, 0]], S is a 2x2 matrix
    const S00 = P[0][0] + r;
    const S01 = P[0][1];
    const S10 = P[1][0];
    const S11 = P[1][1] + r;

    // Inverse of 2x2 matrix S
    const det = S00 * S11 - S01 * S10;
    if (Math.abs(det) < 1e-9) return;
    const invDet = 1.0 / det;
    const invS00 = S11 * invDet;
    const invS01 = -S01 * invDet;
    const invS10 = -S10 * invDet;
    const invS11 = S00 * invDet;

    // Kalman Gain K = P * H^T * invS (4x2)
    // P * H^T is the first two columns of P
    const K = [
      [P[0][0] * invS00 + P[0][1] * invS10, P[0][0] * invS01 + P[0][1] * invS11],
      [P[1][0] * invS00 + P[1][1] * invS10, P[1][0] * invS01 + P[1][1] * invS11],
      [P[2][0] * invS00 + P[2][1] * invS10, P[2][0] * invS01 + P[2][1] * invS11],
      [P[3][0] * invS00 + P[3][1] * invS10, P[3][0] * invS01 + P[3][1] * invS11]
    ];

    // Residual y = z - H * x
    const y0 = zx - this.x[0];
    const y1 = zy - this.x[1];

    // State update: x = x + K * y
    this.x[0] += K[0][0] * y0 + K[0][1] * y1;
    this.x[1] += K[1][0] * y0 + K[1][1] * y1;
    this.x[2] += K[2][0] * y0 + K[2][1] * y1;
    this.x[3] += K[3][0] * y0 + K[3][1] * y1;

    // Covariance update: P = (I - K * H) * P
    // I_KH = 4x4 matrix
    const newP = [];
    for (let i = 0; i < 4; i++) {
      newP[i] = [];
      for (let j = 0; j < 4; j++) {
        let sum = P[i][j];
        sum -= K[i][0] * P[0][j];
        sum -= K[i][1] * P[1][j];
        newP[i][j] = sum;
      }
    }
    this.P = newP;
  }

  // Multi-step forward extrapolation
  forecast(dt) {
    if (!this.initialized) return [];
    const path = [];
    let curX = this.x[0];
    let curY = this.x[1];
    const vx = this.x[2];
    const vy = this.x[3];

    for (let k = 1; k <= this.predictionHorizon; k++) {
      path.push({
        step: k,
        x: curX + vx * (k * dt),
        y: curY + vy * (k * dt)
      });
    }
    return path;
  }

  getState() {
    return {
      x: this.x[0],
      y: this.x[1],
      vx: this.x[2],
      vy: this.x[3],
      speed: Math.sqrt(this.x[2] * this.x[2] + this.x[3] * this.x[3]),
      posCovariance: Math.sqrt(Math.max(0, this.P[0][0] + this.P[1][1]))
    };
  }
}

window.KinematicKalmanFilter = KinematicKalmanFilter;
