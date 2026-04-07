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
   * Returns: Gestures for Zoom and Skeleton Scale.
   */
  public detectHandGesture(handLandmarks: any[]): 'FIVE' | 'FIST' | 'THUMBS_DOWN' | 'THUMBS_UP' | 'ONE' | 'TWO' | 'THREE' | 'PINCH' | null {
    if (!handLandmarks || handLandmarks.length < 21) return null;

    const wrist   = handLandmarks[0];
    const thumbTip = handLandmarks[4];
    const indexTip = handLandmarks[8];

    // Helper: distance between two landmarks
    const dist = (a: any, b: any) =>
      Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

    // Helper: Is finger extended (tip further from wrist than PIP joint)?
    const isExtended = (tipIdx: number, pipIdx: number) => {
      const tip = handLandmarks[tipIdx];
      const pip = handLandmarks[pipIdx];
      const distTip = dist(tip, wrist);
      const distPip = dist(pip, wrist);
      return distTip > distPip * 1.2;
    };

    // PINCH / CIRCLE: Thumb tip very close to index tip (< 12% of hand span)
    const handSpan = dist(wrist, handLandmarks[12]); // wrist to middle MCP
    const pinchDist = dist(thumbTip, indexTip);
    if (pinchDist < handSpan * 0.35) return 'PINCH';

    const fingersExtended = [
      isExtended(8, 6),   // Index
      isExtended(12, 10), // Middle
      isExtended(16, 14), // Ring
      isExtended(20, 18), // Pinky
    ];
    const extendedCount = fingersExtended.filter(Boolean).length;

    // FIVE: 4 fingers all extended
    if (extendedCount >= 4) return 'FIVE';

    // THREE: Index + Middle + Ring (no pinky)
    if (fingersExtended[0] && fingersExtended[1] && fingersExtended[2] && extendedCount === 3) return 'THREE';

    // TWO: Index + Middle only
    if (fingersExtended[0] && fingersExtended[1] && extendedCount === 2) return 'TWO';

    // ONE: Index only
    if (fingersExtended[0] && extendedCount === 1) return 'ONE';

    // THUMBS DOWN: thumb tip well below thumb base, fingers closed
    const thumbBase = handLandmarks[2];
    const isThumbDown = thumbTip.y > thumbBase.y + 0.05;
    if (extendedCount <= 1 && isThumbDown) return 'THUMBS_DOWN';

    // THUMBS UP: thumb tip well above thumb base, fingers closed
    const isThumbUp = thumbTip.y < thumbBase.y - 0.05;
    if (extendedCount <= 1 && isThumbUp) return 'THUMBS_UP';

    // FIST: all closed
    if (extendedCount === 0) return 'FIST';

    return null;
  }
}

