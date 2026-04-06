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

export interface JKDSessionStats {
  punches: number;
  averageDirectness: number;
  telegraphCount: number;
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

    return result;
  }

  /**
   * Recognizes hand gestures for camera control.
   * Returns: 'FIVE' (Zoom In), 'FIST' (Stop), 'THUMBS_DOWN' (Zoom Out), or null.
   */
  public detectHandGesture(handLandmarks: any[]): 'FIVE' | 'FIST' | 'THUMBS_DOWN' | null {
    if (!handLandmarks || handLandmarks.length < 21) return null;

    // Helper: Is finger extended?
    const isExtended = (tipIdx: number, pipIdx: number) => {
      // In normalized coordinates, Y decreases upwards. 
      // For a standard vertical hand, TIP.y < PIP.y means extended.
      // But we can use distance from wrist for more robustness.
      const wrist = handLandmarks[0];
      const tip = handLandmarks[tipIdx];
      const pip = handLandmarks[pipIdx];
      
      const distTip = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
      const distPip = Math.sqrt(Math.pow(pip.x - wrist.x, 2) + Math.pow(pip.y - wrist.y, 2));
      return distTip > distPip * 1.2; // 20% further means extended
    };

    const fingersExtended = [
      isExtended(8, 6),  // Index
      isExtended(12, 10), // Middle
      isExtended(16, 14), // Ring
      isExtended(20, 18)  // Pinky
    ];

    const extendedCount = fingersExtended.filter(v => v).length;

    // 1. FIVE (Open Palm): Most fingers extended
    if (extendedCount >= 3) return 'FIVE';

    // 2. THUMBS DOWN: 
    // Hand is mostly closed (low extended count) AND thumb tip is below thumb base (higher Y)
    const thumbTip = handLandmarks[4];
    const thumbBase = handLandmarks[2];
    const isThumbDown = thumbTip.y > thumbBase.y + 0.05; // Significant Y difference

    if (extendedCount <= 1 && isThumbDown) return 'THUMBS_DOWN';

    // 3. FIST: All fingers closed
    if (extendedCount === 0) return 'FIST';

    return null;
  }
}
