/**
 * OneEuroFilter.ts
 * A 1€ Filter (One Euro Filter) for noise reduction in real-time tracking.
 * Provides "surgical precision" and predictive stabilization.
 */

export class OneEuroFilter {
  private lastTime: number | null = null;
  private xPrev: number | null = null;
  private dxPrev = 0;

  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(
    minCutoff: number = 1.0, 
    beta: number = 0.007, 
    dCutoff: number = 1.0
  ) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }

  public filter(x: number, timestamp: number | null = null): number {
    const t = timestamp || Date.now() / 1000;
    
    if (this.lastTime === null || t <= this.lastTime) {
      this.lastTime = t;
      this.xPrev = x;
      return x;
    }

    const dt = t - this.lastTime;
    this.lastTime = t;

    // Filter the derivative
    const dx = (x - (this.xPrev ?? x)) / dt;
    const edx = this.dxPrev + this.alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = edx;

    // Use the derivative to adjust the cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    
    // Filter the signal
    const result = (this.xPrev ?? x) + this.alpha(cutoff, dt) * (x - (this.xPrev ?? x));
    this.xPrev = result;

    return result;
  }

  public reset() {
    this.lastTime = null;
    this.xPrev = null;
    this.dxPrev = 0;
  }
}
