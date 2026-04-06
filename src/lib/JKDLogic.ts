/**
 * JKD Form Engineering Logic
 * Focused on the "Lead Straight Punch" as a foundation.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface BodyProfile {
  shoulderWidth: number;
  torsoHeight: number;
  armLength: number;
  lastUpdated: number;
}

export interface JKDSessionStats {
  punches: number;
  averageDirectness: number;
  telegraphCount: number;
  bodyProfile: BodyProfile | null;
}

export class JKDLogic {
  private static THRESHOLD_TELEGRAPH = 0.05; 
  private static THRESHOLD_EXTENSION = 0.4;  
  private static VELOCITY_START_THRESHOLD = 0.02;

  private prevWristPos: Landmark | null = null;
  private prevShoulderPos: Landmark | null = null;
  private isPunching = false;
  private punchStartTime = 0;
  private maxWristExtension = 0;
  private telegraphDetected = false;
  
  private bodyProfile: BodyProfile | null = null;
  private calibrationFrames: any[][] = [];

  /**
   * Analyzes a frame of landmarks for JKD Lead Punch mechanics.
   */
  public analyze(landmarks: any[]): { 
    event?: 'PUNCH_START' | 'PUNCH_END' | 'TELEGRAPH';
    metrics?: { directness: number; speed: number; extension: number };
    feedback?: string;
  } {
    if (!landmarks || landmarks.length < 33) return {};

    const wrist = landmarks[16];
    const shoulder = landmarks[12];

    if (wrist.visibility < 0.6 || shoulder.visibility < 0.6) {
      this.prevWristPos = null;
      return {};
    }

    const wristVelocity = this.prevWristPos ? wrist.x - this.prevWristPos.x : 0;
    const extension = Math.abs(wrist.x - shoulder.x);

    let result: any = {};

    if (!this.isPunching && wristVelocity > JKDLogic.VELOCITY_START_THRESHOLD) {
      this.isPunching = true;
      this.punchStartTime = Date.now();
      this.maxWristExtension = 0;
      this.telegraphDetected = false;
      result.event = 'PUNCH_START';

      if (this.prevShoulderPos && shoulder.x < this.prevShoulderPos.x - JKDLogic.THRESHOLD_TELEGRAPH) {
        this.telegraphDetected = true;
        result.event = 'TELEGRAPH';
        result.feedback = "Do not pull back! Directness is key.";
      }
    }

    if (this.isPunching) {
      this.maxWristExtension = Math.max(this.maxWristExtension, extension);

      if (wristVelocity < -0.01 || extension < this.maxWristExtension - 0.05) {
        this.isPunching = false;
        const duration = (Date.now() - this.punchStartTime) / 1000;
        
        result.event = 'PUNCH_END';
        result.metrics = {
          directness: this.telegraphDetected ? 40 : 95, 
          speed: this.maxWristExtension / duration,
          extension: this.maxWristExtension
        };

        if (this.telegraphDetected) {
          result.feedback = "You telegraphed. Strike like a snake – no warning.";
        } else if (this.maxWristExtension > JKDLogic.THRESHOLD_EXTENSION && result.metrics.directness > 90) {
          result.feedback = "Good. Economic. Accurate.";
        }
      }
    }

    this.prevWristPos = { ...wrist };
    this.prevShoulderPos = { ...shoulder };

    return { ...result, bodyProfile: this.bodyProfile };
  }

  /**
   * Calibrates the body profile based on a 5-second sample.
   */
  public registerBody(landmarks: any[]) {
    if (!landmarks || landmarks.length < 33) return;
    this.calibrationFrames.push(landmarks);

    // After ~150 frames (5s at 30fps), calculate averages
    if (this.calibrationFrames.length >= 100) {
      const avgShoulderWidth = this.calibrationFrames.reduce((acc, f) => acc + Math.abs(f[11].x - f[12].x), 0) / this.calibrationFrames.length;
      const avgTorsoHeight = this.calibrationFrames.reduce((acc, f) => acc + Math.abs(f[12].y - f[24].y), 0) / this.calibrationFrames.length;
      const avgArmLength = this.calibrationFrames.reduce((acc, f) => acc + Math.abs(f[14].x - f[12].x) + Math.abs(f[16].x - f[14].x), 0) / this.calibrationFrames.length;

      this.bodyProfile = {
        shoulderWidth: avgShoulderWidth,
        torsoHeight: avgTorsoHeight,
        armLength: avgArmLength,
        lastUpdated: Date.now()
      };
      
      this.calibrationFrames = []; // Clear for next time if needed
      return true; // Calibration complete
    }
    return false;
  }
}
