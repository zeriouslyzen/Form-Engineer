/**
 * JKD MEDICAL PRECISION — TRACKING ENGINE (V4.0)
 * Tuned Kalman Filter for physical therapy: smoother, less jitter, better occlusion handling.
 * Lower process noise (q) = trusts predictions more = smoother motion.
 * Higher measurement noise (r) = less reactive to single noisy frames.
 */

interface State {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
}

class KalmanFilter {
  state: State | null = null;
  // PT-tuned: very smooth, filters out micro-jitter from breathing/muscle tremor
  q = 0.001;   // Low process noise → trust the model trajectory
  r = 0.08;    // Higher measurement noise → less reactive to single bad frames
  p = 1.0;

  update(measured: { x: number; y: number; z: number }, visibility: number) {
    if (!this.state) {
      this.state = { pos: { ...measured }, vel: { x: 0, y: 0, z: 0 } };
      return { ...measured };
    }

    // Scale noise by visibility — occluded joints = trust prediction more
    const dynamicR = visibility < 0.4 ? this.r * 20
                   : visibility < 0.6 ? this.r * 4
                   : this.r;

    // Predict
    this.state.pos.x += this.state.vel.x;
    this.state.pos.y += this.state.vel.y;
    this.state.pos.z += this.state.vel.z;
    this.p += this.q;

    // Kalman gain
    const k = this.p / (this.p + dynamicR);

    const dx = k * (measured.x - this.state.pos.x);
    const dy = k * (measured.y - this.state.pos.y);
    const dz = k * (measured.z - this.state.pos.z);

    this.state.pos.x += dx;
    this.state.pos.y += dy;
    this.state.pos.z += dz;

    // Velocity as smoothed delta (helps dead-reckon during occlusions)
    this.state.vel.x = this.state.vel.x * 0.8 + dx * 0.2;
    this.state.vel.y = this.state.vel.y * 0.8 + dy * 0.2;
    this.state.vel.z = this.state.vel.z * 0.8 + dz * 0.2;

    this.p *= (1 - k);

    return { ...this.state.pos };
  }

  reset() {
    this.state = null;
    this.p = 1.0;
  }
}

export class TrackingEngine {
  private poseFilters: Map<number, KalmanFilter> = new Map();
  private lastGoodPose: any[] | null = null;

  /**
   * Returns Kalman-smoothed pose landmarks.
   * If a frame has no pose detected, returns the last known good pose (dead reckoning).
   */
  smooth(results: any) {
    if (!results) return results;

    if (!results.poseLandmarks) {
      // Dead reckon: return last good pose if available (prevents skeleton flicker)
      if (this.lastGoodPose) {
        return { ...results, poseLandmarks: this.lastGoodPose };
      }
      return results;
    }

    const smoothedPose = results.poseLandmarks.map((l: any, i: number) => {
      if (!this.poseFilters.has(i)) this.poseFilters.set(i, new KalmanFilter());
      const filter = this.poseFilters.get(i)!;
      const vis = l.visibility ?? 0;
      const smoothedPos = filter.update({ x: l.x, y: l.y, z: l.z ?? 0 }, vis);
      return {
        ...l,
        x: smoothedPos.x,
        y: smoothedPos.y,
        z: smoothedPos.z,
        // Preserve true visibility for rendering decisions
        visibility: vis,
      };
    });

    this.lastGoodPose = smoothedPose;
    return { ...results, poseLandmarks: smoothedPose };
  }

  /** Call when switching cameras or resetting a session */
  reset() {
    this.poseFilters.forEach(f => f.reset());
    this.lastGoodPose = null;
  }
}

export const tracking = new TrackingEngine();
