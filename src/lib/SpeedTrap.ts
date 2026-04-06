/**
 * JKD "Speed Trap" Module (V2)
 * High-precision temporal analysis for telegraph detection and reaction speed.
 */

export interface PoseFrame {
  timestamp: number;
  landmarks: any[];
}

export interface SpeedTrapInsight {
  peakSpeed: number;           // Max velocity in m/s (normalized approx)
  reactionTime: number | null; // Milliseconds from cue to punch-start
  telegraphScore: number;     // 0-100 (higher means more wind-up)
  isTelegraphing: boolean;
  velocityTrend: number[];    // Last 10 velocity points for HUD sparkline
}

export class SpeedTrap {
  private buffer: PoseFrame[] = [];
  private readonly MAX_BUFFER_SIZE = 30; // 1 second @ 30fps
  
  private cueTimestamp: number | null = null;
  private reactionTime: number | null = null;
  
  private peakVelocity = 0;
  private velocityHistory: number[] = [];

  /**
   * Pushes a new frame into the temporal window and performs analysis.
   */
  public update(landmarks: any[]): SpeedTrapInsight {
    const now = Date.now();
    this.buffer.push({ timestamp: now, landmarks });
    if (this.buffer.length > this.MAX_BUFFER_SIZE) this.buffer.shift();

    if (this.buffer.length < 2) return this.getEmptyInsight();

    const current = this.buffer[this.buffer.length - 1];
    const previous = this.buffer[this.buffer.length - 2];

    const currentLeadHand = current.landmarks[16] || current.landmarks[15]; // Right or Left
    const previousLeadHand = previous.landmarks[16] || previous.landmarks[15];
    const currentShoulder = current.landmarks[12] || current.landmarks[11];

    if (!currentLeadHand || !previousLeadHand || !currentShoulder) return this.getEmptyInsight();

    // 1. Calculate Instantaneous Velocity
    const dt = (current.timestamp - previous.timestamp) / 1000;
    const dx = currentLeadHand.x - previousLeadHand.x;
    const dy = currentLeadHand.y - previousLeadHand.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const velocity = dist / (dt || 0.033);

    this.velocityHistory.push(velocity);
    if (this.velocityHistory.length > 10) this.velocityHistory.shift();

    // 2. Detect "Telegraph" (Pre-motion retraction)
    // We look for a move AWAY from the target (shoulder) just before velocity spikes
    let telegraphDetected = false;
    let telegraphScore = 0;

    if (this.buffer.length >= 5) {
      const recentFrames = this.buffer.slice(-5);
      // Check if hand moved towards body (negative extension change) while starting motion
      const startExtension = Math.abs(recentFrames[0].landmarks[16].x - recentFrames[0].landmarks[12].x);
      const currentExtension = Math.abs(currentLeadHand.x - currentShoulder.x);
      
      // If extension decreased before it increased -> wind-up detected
      if (velocity > 0.5 && currentExtension < startExtension - 0.02) {
        telegraphDetected = true;
        telegraphScore = 80;
      }
    }

    // 3. Peak Velocity & Reaction Time
    if (velocity > this.peakVelocity) {
      this.peakVelocity = velocity;
      
      // If we are in "Reaction Test" mode and this is the start of a burst
      if (this.cueTimestamp && velocity > 1.5 && !this.reactionTime) {
        this.reactionTime = now - this.cueTimestamp;
      }
    }

    // Decay peak if not striking
    if (velocity < 0.5) {
      this.peakVelocity *= 0.98;
    }

    return {
      peakSpeed: this.peakVelocity,
      reactionTime: this.reactionTime,
      telegraphScore,
      isTelegraphing: telegraphDetected,
      velocityTrend: [...this.velocityHistory]
    };
  }

  /**
   * Resets the current reaction test.
   */
  public resetReaction() {
    this.cueTimestamp = null;
    this.reactionTime = null;
  }

  public triggerCue() {
    this.cueTimestamp = Date.now();
    this.reactionTime = null;
  }

  private getEmptyInsight(): SpeedTrapInsight {
    return {
      peakSpeed: 0,
      reactionTime: null,
      telegraphScore: 0,
      isTelegraphing: false,
      velocityTrend: []
    };
  }
}
