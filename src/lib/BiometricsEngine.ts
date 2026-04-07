/**
 * BIOMETRICS ENGINE — RAW rPPG implementation
 * Uses true pixel-level color tracking (Remote Photoplethysmography) for Heart Rate
 * and landmark kinematics for Respiratory Rate.
 */

export class BiometricsEngine {
  // Respiration Rate (RPM) measured via clavicle/shoulder Y-axis micro-displacement
  private shoulderHistory: { t: number, y: number }[] = [];
  private currentRpm: number = 0; 
  private lastRpmUpdate: number = 0;

  // Real rPPG (Heart Rate) via Green Channel face pixel tracking
  private rppgBuffer: { t: number, g: number }[] = [];
  private currentBpm: number = 0;
  private lastBpmUpdate: number = 0;

  public updateVitals(pose: any[] | null, greenChannelAvg: number | null): { bpm: number, rpm: number } {
    const now = Date.now();

    // ─── 1. RAW rPPG (HEART RATE) ──────────────────────────────────────────
    if (greenChannelAvg !== null) {
      this.rppgBuffer.push({ t: now, g: greenChannelAvg });
      
      // Keep ~10 seconds of color history for rPPG
      const tenSecAgo = now - 10000;
      while (this.rppgBuffer.length > 0 && this.rppgBuffer[0].t < tenSecAgo) {
        this.rppgBuffer.shift();
      }

      // Compute BPM every 2 seconds if we have at least 3 seconds of data
      if (now - this.lastBpmUpdate > 2000 && this.rppgBuffer.length > 50) {
        this.calculateBpmFromPulse();
        this.lastBpmUpdate = now;
      }
    }

    // ─── 2. TRUE RESPIRATION RATE (RPM) ───────────────────────────────────
    if (pose && pose.length > 12) {
      const avgShoulderY = (pose[11].y + pose[12].y) / 2.0;
      this.shoulderHistory.push({ t: now, y: avgShoulderY });

      const tenSecAgo = now - 10000;
      while (this.shoulderHistory.length > 0 && this.shoulderHistory[0].t < tenSecAgo) {
        this.shoulderHistory.shift();
      }

      if (now - this.lastRpmUpdate > 2000 && this.shoulderHistory.length > 30) {
        this.calculateRpmFromBuffer();
        this.lastRpmUpdate = now;
      }
    }

    return { bpm: this.currentBpm, rpm: this.currentRpm };
  }

  private calculateBpmFromPulse() {
    // 1. Detrending: We subtract the rolling average to center the pulse wave
    const sumG = this.rppgBuffer.reduce((acc, p) => acc + p.g, 0);
    const meanG = sumG / this.rppgBuffer.length;
    
    // We isolate the AC (pulsatile) component
    const acSignal = this.rppgBuffer.map(p => ({ t: p.t, val: p.g - meanG }));

    // 2. Band-pass filtering logic conceptually (Find peaks in 0.8Hz to 3.0Hz bounds -> 48 to 180 BPM)
    let peaks = 0;
    // Simple zero-crossing or local maxima counting
    let isAscending = false;
    for (let i = 1; i < acSignal.length - 1; i++) {
        if (acSignal[i].val > acSignal[i-1].val) {
            isAscending = true;
        } else if (isAscending && acSignal[i].val < acSignal[i-1].val) {
            // Found a local peak
            isAscending = false;
            // Only count significant peaks above a noise threshold
            if (acSignal[i-1].val > 0.5) { // Threshold for color variance
                peaks++;
            }
        }
    }

    // Extrapolate peaks in our buffer to 60 seconds
    const timeSpanSec = (this.rppgBuffer[this.rppgBuffer.length - 1].t - this.rppgBuffer[0].t) / 1000.0;
    if (timeSpanSec > 0) {
       const rawBpm = Math.round((peaks / timeSpanSec) * 60);
       
       // Clamp to biological realism if noisy (filtering bad lighting data)
       if (rawBpm > 40 && rawBpm < 200) {
          // Smooth the display
          if (this.currentBpm === 0) this.currentBpm = rawBpm;
          else this.currentBpm = Math.round(this.currentBpm * 0.6 + rawBpm * 0.4);
       }
    }
  }

  private calculateRpmFromBuffer() {
    const sum = this.shoulderHistory.reduce((acc, p) => acc + p.y, 0);
    const mean = sum / this.shoulderHistory.length;

    let breaths = 0;
    let isAbove = this.shoulderHistory[0].y > mean;

    for (let i = 1; i < this.shoulderHistory.length; i++) {
      const currentAbove = this.shoulderHistory[i].y > mean;
      if (currentAbove && !isAbove) {
        if (Math.abs(this.shoulderHistory[i].y - mean) > 0.001) {
          breaths++;
        }
      }
      isAbove = currentAbove;
    }

    const timeSpanSec = (this.shoulderHistory[this.shoulderHistory.length - 1].t - this.shoulderHistory[0].t) / 1000.0;
    if (timeSpanSec > 0) {
        const rawRpm = Math.round((breaths / timeSpanSec) * 60);
        if (this.currentRpm === 0) this.currentRpm = rawRpm;
        else this.currentRpm = Math.round(this.currentRpm * 0.7 + rawRpm * 0.3);
    }
  }
}
