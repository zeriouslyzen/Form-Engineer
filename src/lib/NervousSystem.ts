/**
 * NERVOUS SYSTEM MODE — V1.0
 * Renders a dermatome-inspired neural pathway map over the skeleton.
 * 
 * What this visualizes:
 * - Spinal cord pathway (cervical → lumbar → sacral) down the spine
 * - Peripheral nerve branches radiating from spine to limbs
 * - Animated "signal pulse" that travels along nerve paths
 * - Each nerve branch color-coded by dermatome region (C1-S5)
 * - Joint ganglion nodes that pulse based on joint ROM health
 * - Breathing rate estimation from thorax expansion
 */

import * as THREE from 'three';

export interface NervousSystemData {
  spinePoints: THREE.Vector3[];          // Nose → neck → T-spine → L-spine → sacrum
  nerveSegments: NerveSegment[];
  ganglionNodes: GanglionNode[];
  breathingPhase: number;                // 0-1 sine wave estimated from shoulder movement
}

export interface NerveSegment {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  region: 'cervical' | 'thoracic' | 'lumbar' | 'sacral' | 'peripheral';
  pulseOffset: number;                   // 0-1, stagger the signal timing
}

export interface GanglionNode {
  position: THREE.Vector3;
  color: string;
  intensity: number;                     // 0-1 based on joint ROM health
  label: string;
}

// Dermatome color palette (clinical reference, C1=white → S5=deep red)
export const DERMATOME_COLORS = {
  cervical:   '#e0f2fe', // Icy blue-white — C1-C8 (neck, arms)
  thoracic:   '#a5f3fc', // Cyan — T1-T12 (chest, upper back)
  lumbar:     '#67e8f9', // Blue-teal — L1-L5 (lower back, quads)
  sacral:     '#22d3ee', // Deep cyan — S1-S5 (glutes, hamstrings)
  peripheral: '#6ee7b7', // Green — distal nerve branches to hands/feet
};

/**
 * Compute the nervous system data from pose landmarks each frame.
 * Uses known anatomical relationships between MediaPipe landmarks.
 */
export function computeNervousSystem(
  pose: any[] | null,
  getPos: (l: any) => THREE.Vector3
): NervousSystemData | null {
  if (!pose || pose.length < 33) return null;

  // ── SPINE PATHWAY ─────────────────────────────────────────────────────────
  // Approximate: Nose(0) → Midpoint shoulders → Mid upper back (estimated) 
  //              → Midpoint hips → Below hips (sacrum estimate)
  const nose      = getPos(pose[0]);
  const neck      = new THREE.Vector3().lerpVectors(getPos(pose[11]), getPos(pose[12]), 0.5);
  const midBack   = new THREE.Vector3().lerpVectors(neck, new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5), 0.4);
  const lowerBack = new THREE.Vector3().lerpVectors(neck, new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5), 0.75);
  const sacrum    = new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5);
  const tailbone  = sacrum.clone().add(new THREE.Vector3(0, -0.06, 0));

  const spinePoints = [nose, neck, midBack, lowerBack, sacrum, tailbone];

  // ── NERVE SEGMENTS ────────────────────────────────────────────────────────
  const nerveSegments: NerveSegment[] = [];

  // Cervical: neck → shoulders → elbows (brachial plexus)
  nerveSegments.push({ from: neck.clone(), to: getPos(pose[11]), color: DERMATOME_COLORS.cervical, region: 'cervical', pulseOffset: 0.0 });
  nerveSegments.push({ from: neck.clone(), to: getPos(pose[12]), color: DERMATOME_COLORS.cervical, region: 'cervical', pulseOffset: 0.15 });
  nerveSegments.push({ from: getPos(pose[11]), to: getPos(pose[13]), color: DERMATOME_COLORS.cervical, region: 'cervical', pulseOffset: 0.1 });
  nerveSegments.push({ from: getPos(pose[12]), to: getPos(pose[14]), color: DERMATOME_COLORS.cervical, region: 'cervical', pulseOffset: 0.25 });

  // Peripheral arm: elbows → wrists → hands
  nerveSegments.push({ from: getPos(pose[13]), to: getPos(pose[15]), color: DERMATOME_COLORS.peripheral, region: 'peripheral', pulseOffset: 0.2 });
  nerveSegments.push({ from: getPos(pose[14]), to: getPos(pose[16]), color: DERMATOME_COLORS.peripheral, region: 'peripheral', pulseOffset: 0.35 });

  // Thoracic: neck → mid-back ribs
  nerveSegments.push({ from: neck.clone(), to: midBack.clone(), color: DERMATOME_COLORS.thoracic, region: 'thoracic', pulseOffset: 0.05 });

  // Lumbar: lower back → knees (femoral / sciatic)
  nerveSegments.push({ from: lowerBack.clone(), to: getPos(pose[23]), color: DERMATOME_COLORS.lumbar, region: 'lumbar', pulseOffset: 0.3 });
  nerveSegments.push({ from: lowerBack.clone(), to: getPos(pose[24]), color: DERMATOME_COLORS.lumbar, region: 'lumbar', pulseOffset: 0.45 });
  nerveSegments.push({ from: getPos(pose[23]), to: getPos(pose[25]), color: DERMATOME_COLORS.lumbar, region: 'lumbar', pulseOffset: 0.4 });
  nerveSegments.push({ from: getPos(pose[24]), to: getPos(pose[26]), color: DERMATOME_COLORS.lumbar, region: 'lumbar', pulseOffset: 0.55 });

  // Sacral: hips → ankles → feet
  nerveSegments.push({ from: getPos(pose[25]), to: getPos(pose[27]), color: DERMATOME_COLORS.sacral, region: 'sacral', pulseOffset: 0.5 });
  nerveSegments.push({ from: getPos(pose[26]), to: getPos(pose[28]), color: DERMATOME_COLORS.sacral, region: 'sacral', pulseOffset: 0.65 });

  // ── GANGLION NODES (spinal column nerve roots) ────────────────────────────
  const ganglionNodes: GanglionNode[] = spinePoints.slice(1).map((p, i) => {
    const regions = ['C3', 'T4', 'T10', 'L3', 'S1'];
    return {
      position: p.clone(),
      color: Object.values(DERMATOME_COLORS)[Math.min(i, 4)],
      intensity: 0.8,
      label: regions[i] || 'S',
    };
  });

  // ── BREATHING ESTIMATION (shoulder Y-axis oscillation) ────────────────────
  // We just pass a placeholder; actual breathing detection happens in the component
  const breathingPhase = 0;

  return { spinePoints, nerveSegments, ganglionNodes, breathingPhase };
}
