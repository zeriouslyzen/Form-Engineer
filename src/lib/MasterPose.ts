/**
 * JKD Master Pose Library
 * Perfect geometric alignment for JKD Lead Stance and Straight Lead.
 */

export interface MasterPoseFrame {
  name: string;
  landmarks: { [index: number]: { x: number, y: number, z: number } };
}

export const MASTER_LEAD_STANCE: MasterPoseFrame = {
  name: "Lead Stance",
  landmarks: {
    11: { x: 0.45, y: 0.35, z: 0.1 },  // Left Shoulder
    12: { x: 0.55, y: 0.35, z: -0.1 }, // Right Shoulder
    13: { x: 0.40, y: 0.55, z: 0.2 },  // Left Elbow
    14: { x: 0.60, y: 0.50, z: 0.05 }, // Right Elbow
    15: { x: 0.38, y: 0.45, z: 0.3 },  // Left Wrist (Lead)
    16: { x: 0.62, y: 0.45, z: 0.1 },  // Right Wrist (Rear)
    23: { x: 0.46, y: 0.70, z: 0.05 }, // Left Hip
    24: { x: 0.54, y: 0.70, z: -0.05 },// Right Hip
    25: { x: 0.44, y: 0.85, z: 0.15 }, // Left Knee
    26: { x: 0.56, y: 0.88, z: 0.0 },  // Right Knee
    27: { x: 0.42, y: 0.98, z: 0.2 },  // Left Foot
    28: { x: 0.58, y: 0.98, z: -0.1 }, // Right Foot
    0: { x: 0.5, y: 0.2, z: 0.0 }      // Face
  }
};

export function calculateSyncScore(live: any[], master: MasterPoseFrame): number {
  if (!live || live.length < 33) return 0;
  
  let totalError = 0;
  let count = 0;
  
  // Weights (Shoulders, Hips, Lead Hand are most critical)
  const weights: { [idx: number]: number } = {
    11: 1.5, 12: 1.5, 23: 1.2, 24: 1.2, 15: 2.0, 16: 1.0, 25: 1.0, 26: 1.0
  };

  for (const idxStr in master.landmarks) {
    const idx = parseInt(idxStr);
    if (!live[idx]) continue;
    
    const m = master.landmarks[idx];
    const l = live[idx];
    
    // Geometric distance (normalized coords)
    const dist = Math.sqrt(
      Math.pow(l.x - m.x, 2) + 
      Math.pow(l.y - m.y, 2)
    );
    
    const weight = weights[idx] || 1.0;
    totalError += dist * weight;
    count += weight;
  }

  if (count === 0) return 0;
  
  // 100% being 0 error, decaying towards 0% at 0.4 total distance
  const avgError = totalError / count;
  const score = Math.max(0, 100 - (avgError * 250)); // 0.1 error = 75 score
  
  return Math.round(score);
}
