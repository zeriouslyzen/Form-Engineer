/**
 * NERVOUS SYSTEM — ANATOMICAL PRECISION ENGINE (V2.0)
 * "The nervous system is tiny but vast."
 *
 * Maps the complete peripheral and central nervous system onto pose landmarks:
 *   CNS:         Spinal cord (cervical → sacral)
 *   Autonomic:   Bilateral sympathetic ganglia chain
 *   Cranial:     CN V Trigeminal (3 divisions), CN VII Facial, CN X Vagus
 *   Cervical:    C1–C5 plexus branches (occipital, auricular, transverse, supraclavicular)
 *   Brachial:    C5–T1 — musculocutaneous, radial, median, ulnar + all digital branches
 *   Thoracic:    T1–T12 intercostal fan (12 pairs)
 *   Lumbar:      L1–L4 — femoral, lateral femoral cutaneous, obturator
 *   Sacral:      L4–S3 — sciatic → common peroneal + tibial → plantar/dorsal
 *   Peripheral:  Digital finger nerves, plantar toe nerves
 */

import * as THREE from 'three';

export interface NerveSegment {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  speed: number;      // pulse travel speed (motor=fast, sensory=slow)
  offset: number;     // 0-1 stagger
  opacity: number;    // line opacity (trunk=high, fine branch=low)
  type: 'cns' | 'autonomic' | 'cranial' | 'motor' | 'sensory' | 'peripheral';
}

// ─── Anatomical Color Palette ─────────────────────────────────────────────────
export const NERVE_COLORS = {
  cns:       '#f0f9ff', // Bright white-blue — spinal cord
  autonomic: '#c084fc', // Purple — sympathetic chain
  cranial:   '#e879f9', // Magenta — cranial nerves
  motor:     '#00e5ff', // Cyan — efferent motor fibers
  sensory:   '#bae6fd', // Ice blue — afferent sensory fibers
  peripheral:'#6ee7b7', // Green — fine distal branches
};

// ─── Helper: lerp with anatomical offset ──────────────────────────────────────
function lerpOffset(a: THREE.Vector3, b: THREE.Vector3, t: number, offset?: THREE.Vector3): THREE.Vector3 {
  const p = new THREE.Vector3().lerpVectors(a, b, t);
  if (offset) p.add(offset);
  return p;
}

function midpoint(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().lerpVectors(a, b, 0.5);
}

// ─── Main Computation ─────────────────────────────────────────────────────────
export function computeNervousSystem(
  pose: any[] | null,
  getPos: (l: any) => THREE.Vector3,
  leftHand: any[] | null,
  rightHand: any[] | null
): NerveSegment[] {
  if (!pose || pose.length < 33) return [];

  const segs: NerveSegment[] = [];
  let pulseOffset = 0;
  const nextOffset = (step = 0.04) => { pulseOffset = (pulseOffset + step) % 1.0; return pulseOffset; };

  const add = (from: THREE.Vector3, to: THREE.Vector3, type: NerveSegment['type'], opacity = 0.35, speed?: number, offset?: number) => {
    const color = NERVE_COLORS[type];
    const defaultSpeed = type === 'motor' ? 1.4 : type === 'sensory' ? 0.5 : type === 'cns' ? 2.0 : type === 'autonomic' ? 0.8 : 0.9;
    segs.push({ from, to, color, speed: speed ?? defaultSpeed, offset: offset ?? nextOffset(), opacity, type });
  };

  // ── Key anatomical landmarks ───────────────────────────────────────────────
  const nose     = getPos(pose[0]);
  const lShoulder= getPos(pose[11]);
  const rShoulder= getPos(pose[12]);
  const lElbow   = getPos(pose[13]);
  const rElbow   = getPos(pose[14]);
  const lWrist   = getPos(pose[15]);
  const rWrist   = getPos(pose[16]);
  const lHip     = getPos(pose[23]);
  const rHip     = getPos(pose[24]);
  const lKnee    = getPos(pose[25]);
  const rKnee    = getPos(pose[26]);
  const lAnkle   = getPos(pose[27]);
  const rAnkle   = getPos(pose[28]);
  const lFoot    = getPos(pose[31]);
  const rFoot    = getPos(pose[32]);

  const neck       = midpoint(lShoulder, rShoulder);
  const midBack    = lerpOffset(neck, midpoint(lHip, rHip), 0.35);
  const thoracic   = lerpOffset(neck, midpoint(lHip, rHip), 0.60);
  const lumbar     = lerpOffset(neck, midpoint(lHip, rHip), 0.80);
  const sacrum     = midpoint(lHip, rHip);
  const tailbone   = sacrum.clone().add(new THREE.Vector3(0, -0.055, 0));
  const brainstem  = lerpOffset(nose, neck, 0.35);

  // ─── [1] SPINAL CORD (CNS) ────────────────────────────────────────────────
  // Main cord runs: brainstem → neck → mid-thoracic → lumbar → sacrum → tailbone
  const spineNodes = [brainstem, neck, midBack, thoracic, lumbar, sacrum, tailbone];
  for (let i = 0; i < spineNodes.length - 1; i++) {
    add(spineNodes[i], spineNodes[i + 1], 'cns', 0.75, 2.5, nextOffset(0.08));
  }

  // ─── [2] AUTONOMIC SYMPATHETIC CHAIN (bilateral paravertebral ganglia) ────
  // ~22 ganglia each side, approximated along spine with lateral offset
  const autonomicLOffset = new THREE.Vector3(0.022, 0, 0.01);
  const autonomicROffset = new THREE.Vector3(-0.022, 0, 0.01);
  for (let i = 0; i < spineNodes.length - 1; i++) {
    const aL0 = spineNodes[i].clone().add(autonomicLOffset);
    const aL1 = spineNodes[i + 1].clone().add(autonomicLOffset);
    const aR0 = spineNodes[i].clone().add(autonomicROffset);
    const aR1 = spineNodes[i + 1].clone().add(autonomicROffset);
    add(aL0, aL1, 'autonomic', 0.35, 0.7, nextOffset(0.06));
    add(aR0, aR1, 'autonomic', 0.35, 0.7, nextOffset(0.06));
    // Ramus communicans (connecting white rami between chain and spinal nerve)
    if (i % 2 === 0) {
      add(spineNodes[i].clone().add(new THREE.Vector3(0, 0, 0)), aL0, 'autonomic', 0.15, 0.5, nextOffset(0.03));
      add(spineNodes[i].clone().add(new THREE.Vector3(0, 0, 0)), aR0, 'autonomic', 0.15, 0.5, nextOffset(0.03));
    }
  }

  // ─── [3] CRANIAL NERVES ───────────────────────────────────────────────────
  // CN V — Trigeminal (3 divisions: ophthalmic, maxillary, mandibular)
  const ganglion = brainstem.clone().add(new THREE.Vector3(0, 0.01, 0.02));
  // V1 Ophthalmic — forehead
  const forehead = nose.clone().add(new THREE.Vector3(0, 0.05, 0));
  add(ganglion, forehead, 'cranial', 0.30, 0.9, nextOffset());
  // V2 Maxillary — cheek level (approximate from nose level)
  const lCheek = nose.clone().add(new THREE.Vector3(0.06, 0, 0.01));
  const rCheek = nose.clone().add(new THREE.Vector3(-0.06, 0, 0.01));
  add(ganglion, lCheek, 'cranial', 0.28, 0.9, nextOffset());
  add(ganglion, rCheek, 'cranial', 0.28, 0.9, nextOffset());
  // V3 Mandibular — jaw
  const lJaw = nose.clone().add(new THREE.Vector3(0.05, -0.06, 0));
  const rJaw = nose.clone().add(new THREE.Vector3(-0.05, -0.06, 0));
  add(ganglion, lJaw, 'cranial', 0.26, 0.9, nextOffset());
  add(ganglion, rJaw, 'cranial', 0.26, 0.9, nextOffset());
  // Fine terminal branches of trigeminal across face
  const facePoints = [
    nose.clone().add(new THREE.Vector3(0.03, 0.04, 0)),
    nose.clone().add(new THREE.Vector3(-0.03, 0.04, 0)),
    nose.clone().add(new THREE.Vector3(0.08, 0.02, 0)),
    nose.clone().add(new THREE.Vector3(-0.08, 0.02, 0)),
    nose.clone().add(new THREE.Vector3(0.04, -0.03, 0)),
    nose.clone().add(new THREE.Vector3(-0.04, -0.03, 0)),
  ];
  facePoints.forEach(fp => add(ganglion, fp, 'cranial', 0.12, 1.2, nextOffset(0.02)));

  // CN VII — Facial nerve (5 branches: temporal, zygomatic, buccal, marginal mandibular, cervical)
  const facialOrigin = brainstem.clone().add(new THREE.Vector3(0.03, 0.01, 0.015));
  const facialBranches = [
    nose.clone().add(new THREE.Vector3(0.08, 0.07, 0)),    // temporal
    nose.clone().add(new THREE.Vector3(0.09, 0.02, 0)),    // zygomatic
    nose.clone().add(new THREE.Vector3(0.08, -0.01, 0)),   // buccal
    nose.clone().add(new THREE.Vector3(0.06, -0.05, 0)),   // marginal mandibular
    neck.clone().add(new THREE.Vector3(0.04, 0.03, 0)),    // cervical
  ];
  facialBranches.forEach((fb) => add(facialOrigin, fb, 'cranial', 0.20, 1.0, nextOffset(0.03)));

  // CN X — Vagus (runs down neck to thorax & abdomen — the "highway" of the ANS)
  const vagusL = [brainstem, neck.clone().add(new THREE.Vector3(0.015, 0, 0)), midBack.clone().add(new THREE.Vector3(0.02, 0, 0))];
  const vagusR = [brainstem, neck.clone().add(new THREE.Vector3(-0.015, 0, 0)), midBack.clone().add(new THREE.Vector3(-0.02, 0, 0))];
  for (let i = 0; i < vagusL.length - 1; i++) {
    add(vagusL[i], vagusL[i+1], 'autonomic', 0.45, 0.6, nextOffset(0.05));
    add(vagusR[i], vagusR[i+1], 'autonomic', 0.45, 0.6, nextOffset(0.05));
  }

  // ─── [4] CERVICAL PLEXUS (C1–C5) ─────────────────────────────────────────
  const cervicalRoot = neck.clone().add(new THREE.Vector3(0, 0.02, 0));
  // Minor occipital — up to scalp (behind ear)
  add(cervicalRoot, brainstem.clone().add(new THREE.Vector3(0.04, 0.04, 0)), 'sensory', 0.22, 0.6, nextOffset());
  add(cervicalRoot, brainstem.clone().add(new THREE.Vector3(-0.04, 0.04, 0)), 'sensory', 0.22, 0.6, nextOffset());
  // Great auricular — to ear / lateral neck
  add(cervicalRoot, neck.clone().add(new THREE.Vector3(0.06, 0.04, 0)), 'sensory', 0.20, 0.6, nextOffset());
  add(cervicalRoot, neck.clone().add(new THREE.Vector3(-0.06, 0.04, 0)), 'sensory', 0.20, 0.6, nextOffset());
  // Transverse cervical — across front of neck
  const neckL = neck.clone().add(new THREE.Vector3(0.08, 0, 0));
  const neckR = neck.clone().add(new THREE.Vector3(-0.08, 0, 0));
  add(neckL, neckR, 'sensory', 0.25, 0.7, nextOffset());
  // Supraclavicular — across collar to shoulder
  add(cervicalRoot, lShoulder.clone().add(new THREE.Vector3(0.01, 0.02, 0)), 'sensory', 0.22, 0.6, nextOffset());
  add(cervicalRoot, rShoulder.clone().add(new THREE.Vector3(-0.01, 0.02, 0)), 'sensory', 0.22, 0.6, nextOffset());
  // Phrenic nerve (C3-C5) — runs anterior thorax to diaphragm (approximated to thoracic)
  add(cervicalRoot, thoracic.clone().add(new THREE.Vector3(0.015, 0, 0)), 'motor', 0.30, 1.2, nextOffset());
  add(cervicalRoot, thoracic.clone().add(new THREE.Vector3(-0.015, 0, 0)), 'motor', 0.30, 1.2, nextOffset());

  // ─── [5] BRACHIAL PLEXUS (C5–T1) ─────────────────────────────────────────
  // Roots emerge from neck vertebrae and form trunks, divisions, cords, then named nerves
  const brachialL = lerpOffset(neck, lShoulder, 0.4).add(new THREE.Vector3(0, 0.02, 0));
  const brachialR = lerpOffset(neck, rShoulder, 0.4).add(new THREE.Vector3(0, 0.02, 0));

  // Roots C5-T1 approximated as radiating lines from neck to brachial point
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const lRoot = lerpOffset(neck.clone().add(new THREE.Vector3(0, 0.015 - t * 0.03, 0)), brachialL, 0.7);
    const rRoot = lerpOffset(neck.clone().add(new THREE.Vector3(0, 0.015 - t * 0.03, 0)), brachialR, 0.7);
    add(neck.clone().add(new THREE.Vector3(0, 0.015 - t * 0.03, 0)), lRoot, 'motor', 0.28, 1.3, nextOffset(0.025));
    add(neck.clone().add(new THREE.Vector3(0, 0.015 - t * 0.03, 0)), rRoot, 'motor', 0.28, 1.3, nextOffset(0.025));
  }

  // Musculocutaneous nerve (C5-C7) — lateral, anterior of biceps
  const lMusc = lerpOffset(lShoulder, lElbow, 0.5).add(new THREE.Vector3(0.012, 0, 0));
  const rMusc = lerpOffset(rShoulder, rElbow, 0.5).add(new THREE.Vector3(-0.012, 0, 0));
  add(brachialL, lMusc, 'motor', 0.32, 1.4, nextOffset());
  add(lMusc, lElbow, 'motor', 0.28, 1.4, nextOffset(0.02));
  add(brachialR, rMusc, 'motor', 0.32, 1.4, nextOffset());
  add(rMusc, rElbow, 'motor', 0.28, 1.4, nextOffset(0.02));

  // Radial nerve (C5-T1) — spirals posterior around humerus → lateral forearm
  const lRadialMid = lerpOffset(lShoulder, lElbow, 0.55).add(new THREE.Vector3(-0.015, 0.01, 0));
  const rRadialMid = lerpOffset(rShoulder, rElbow, 0.55).add(new THREE.Vector3(0.015, 0.01, 0));
  add(brachialL, lRadialMid, 'motor', 0.33, 1.5, nextOffset());
  add(lRadialMid, lWrist.clone().add(new THREE.Vector3(-0.012, 0, 0)), 'motor', 0.28, 1.5, nextOffset(0.02));
  add(brachialR, rRadialMid, 'motor', 0.33, 1.5, nextOffset());
  add(rRadialMid, rWrist.clone().add(new THREE.Vector3(0.012, 0, 0)), 'motor', 0.28, 1.5, nextOffset(0.02));

  // Median nerve (C6-T1) — midline anterior forearm → carpal tunnel → thumb/index/middle
  const lMedianMid = lerpOffset(lElbow, lWrist, 0.5).add(new THREE.Vector3(0.006, 0, 0));
  const rMedianMid = lerpOffset(rElbow, rWrist, 0.5).add(new THREE.Vector3(-0.006, 0, 0));
  add(brachialL, lMedianMid, 'motor', 0.34, 1.3, nextOffset());
  add(lMedianMid, lWrist, 'motor', 0.30, 1.3, nextOffset(0.02));
  add(brachialR, rMedianMid, 'motor', 0.34, 1.3, nextOffset());
  add(rMedianMid, rWrist, 'motor', 0.30, 1.3, nextOffset(0.02));

  // Ulnar nerve (C8-T1) — medial forearm → hypothenar → ring+pinky
  const lUlnarMid = lerpOffset(lElbow, lWrist, 0.5).add(new THREE.Vector3(-0.012, 0, 0));
  const rUlnarMid = lerpOffset(rElbow, rWrist, 0.5).add(new THREE.Vector3(0.012, 0, 0));
  add(brachialL, lUlnarMid, 'motor', 0.32, 1.2, nextOffset());
  add(lUlnarMid, lWrist.clone().add(new THREE.Vector3(-0.01, 0, 0)), 'motor', 0.28, 1.2, nextOffset(0.02));
  add(brachialR, rUlnarMid, 'motor', 0.32, 1.2, nextOffset());
  add(rUlnarMid, rWrist.clone().add(new THREE.Vector3(0.01, 0, 0)), 'motor', 0.28, 1.2, nextOffset(0.02));

  // Digital finger nerves (from hand landmarks if available)
  const addDigitalNerves = (hand: any[]) => {
    const gp = (i: number) => getPos(hand[i]);
    const wrist = gp(0);
    // Palmar digital nerves: 4 fingers, 2 nerves each side
    const fingerGroups = [[5,8],[9,12],[13,16],[17,20]]; // index, middle, ring, pinky
    fingerGroups.forEach(([mcp, tip]) => {
      const mcpPos = gp(mcp);
      const tipPos = gp(tip);
      const off1 = new THREE.Vector3(0.006, 0, 0);
      const off2 = new THREE.Vector3(-0.006, 0, 0);
      add(wrist, mcpPos.clone().add(off1), 'peripheral', 0.18, 1.5, nextOffset(0.015));
      add(mcpPos.clone().add(off1), tipPos.clone().add(off1), 'peripheral', 0.14, 1.5, nextOffset(0.01));
      add(wrist, mcpPos.clone().add(off2), 'peripheral', 0.18, 1.5, nextOffset(0.015));
      add(mcpPos.clone().add(off2), tipPos.clone().add(off2), 'peripheral', 0.14, 1.5, nextOffset(0.01));
    });
    // Thumb — recurrent branch median → thenar
    add(wrist, gp(2), 'peripheral', 0.18, 1.5, nextOffset(0.02));
    add(gp(2), gp(4), 'peripheral', 0.14, 1.5, nextOffset(0.01));
  };
  if (leftHand && leftHand.length >= 21)  addDigitalNerves(leftHand);
  if (rightHand && rightHand.length >= 21) addDigitalNerves(rightHand);

  // ─── [6] THORACIC INTERCOSTAL NERVES (T1–T12) ────────────────────────────
  // 12 pairs of horizontal nerves fanning out from spine across the rib cage
  // Approximate the thorax as the region between neck and hips
  const numIntercostals = 10;
  for (let i = 1; i <= numIntercostals; i++) {
    const t = i / (numIntercostals + 1);
    const spinePoint = lerpOffset(neck, sacrum, t);
    // Width fans out then narrows based on chest shape
    const lateralWidth = 0.10 + Math.sin(t * Math.PI) * 0.08;
    const lEnd = spinePoint.clone().add(new THREE.Vector3(lateralWidth, 0, 0));
    const rEnd = spinePoint.clone().add(new THREE.Vector3(-lateralWidth, 0, 0));
    add(spinePoint, lEnd, 'sensory', 0.20, 0.8, nextOffset(0.04));
    add(spinePoint, rEnd, 'sensory', 0.20, 0.8, nextOffset(0.04));
    // Anterior branch continues toward midline (anterior cutaneous)
    const lAnterior = lEnd.clone().add(new THREE.Vector3(0.04, 0, 0));
    const rAnterior = rEnd.clone().add(new THREE.Vector3(-0.04, 0, 0));
    add(lEnd, lAnterior, 'sensory', 0.12, 0.7, nextOffset(0.02));
    add(rEnd, rAnterior, 'sensory', 0.12, 0.7, nextOffset(0.02));
  }

  // Lateral cutaneous branches (from mid-axillary line)
  for (let i = 2; i <= 8; i++) {
    const t = i / 10;
    const baseL = lerpOffset(lShoulder, lHip, t);
    const baseR = lerpOffset(rShoulder, rHip, t);
    const tipL = baseL.clone().add(new THREE.Vector3(0.05, 0, 0));
    const tipR = baseR.clone().add(new THREE.Vector3(-0.05, 0, 0));
    add(baseL, tipL, 'sensory', 0.13, 0.75, nextOffset(0.025));
    add(baseR, tipR, 'sensory', 0.13, 0.75, nextOffset(0.025));
  }

  // ─── [7] LUMBAR PLEXUS (L1–L4) ───────────────────────────────────────────
  const lumbarRoot = lumbar.clone().add(new THREE.Vector3(0, 0, 0));
  // Iliohypogastric / Ilioinguinal — across lower abdomen
  const lInguinal = lumbarRoot.clone().add(new THREE.Vector3(0.09, -0.02, 0));
  const rInguinal = lumbarRoot.clone().add(new THREE.Vector3(-0.09, -0.02, 0));
  add(lumbarRoot, lInguinal, 'sensory', 0.22, 0.7, nextOffset());
  add(lumbarRoot, rInguinal, 'sensory', 0.22, 0.7, nextOffset());

  // Femoral nerve (L2-L4) — anterior thigh (hip → knee, slightly anterior/medial)
  const lFemoralMid = lerpOffset(lHip, lKnee, 0.5).add(new THREE.Vector3(0.02, 0, 0));
  const rFemoralMid = lerpOffset(rHip, rKnee, 0.5).add(new THREE.Vector3(-0.02, 0, 0));
  add(lumbarRoot, lFemoralMid, 'motor', 0.35, 1.3, nextOffset());
  add(lFemoralMid, lKnee.clone().add(new THREE.Vector3(0.015, 0, 0)), 'motor', 0.30, 1.3, nextOffset(0.02));
  add(lumbarRoot, rFemoralMid, 'motor', 0.35, 1.3, nextOffset());
  add(rFemoralMid, rKnee.clone().add(new THREE.Vector3(-0.015, 0, 0)), 'motor', 0.30, 1.3, nextOffset(0.02));

  // Saphenous nerve (sensory, continues below knee medially to ankle)
  add(lKnee.clone().add(new THREE.Vector3(0.015, 0, 0)), lAnkle.clone().add(new THREE.Vector3(0.01, 0, 0)), 'sensory', 0.22, 0.6, nextOffset());
  add(rKnee.clone().add(new THREE.Vector3(-0.015, 0, 0)), rAnkle.clone().add(new THREE.Vector3(-0.01, 0, 0)), 'sensory', 0.22, 0.6, nextOffset());

  // Lateral femoral cutaneous (L2-L3) — pure sensory, lateral thigh
  add(lumbarRoot, lerpOffset(lHip, lKnee, 0.4).add(new THREE.Vector3(-0.03, 0, 0)), 'sensory', 0.20, 0.6, nextOffset());
  add(lumbarRoot, lerpOffset(rHip, rKnee, 0.4).add(new THREE.Vector3(0.03, 0, 0)), 'sensory', 0.20, 0.6, nextOffset());

  // Obturator (L2-L4) — medial thigh
  add(lumbarRoot, lerpOffset(lHip, lKnee, 0.45).add(new THREE.Vector3(0.005, 0, 0)), 'motor', 0.25, 1.1, nextOffset());
  add(lumbarRoot, lerpOffset(rHip, rKnee, 0.45).add(new THREE.Vector3(-0.005, 0, 0)), 'motor', 0.25, 1.1, nextOffset());

  // ─── [8] SACRAL PLEXUS (L4–S3) ───────────────────────────────────────────
  const sacralRoot = sacrum.clone().add(new THREE.Vector3(0, 0.01, 0));

  // Superior / inferior gluteal nerves
  const lGlute = lHip.clone().add(new THREE.Vector3(-0.03, -0.01, 0));
  const rGlute = rHip.clone().add(new THREE.Vector3(0.03, -0.01, 0));
  add(sacralRoot, lGlute, 'motor', 0.28, 1.2, nextOffset());
  add(sacralRoot, rGlute, 'motor', 0.28, 1.2, nextOffset());

  // Sciatic nerve (L4-S3) — largest nerve in the body
  // Exits piriformis, runs posterior to hip, down middle of thigh
  const lSciaticHip = lerpOffset(lHip, lKnee, 0.0).add(new THREE.Vector3(-0.01, 0, 0));
  const rSciaticHip = lerpOffset(rHip, rKnee, 0.0).add(new THREE.Vector3(0.01, 0, 0));
  const lSciaticMid = lerpOffset(lHip, lKnee, 0.5).add(new THREE.Vector3(-0.005, 0, 0));
  const rSciaticMid = lerpOffset(rHip, rKnee, 0.5).add(new THREE.Vector3(0.005, 0, 0));
  // Trunk segments — slightly thicker/brighter (higher opacity)
  add(sacralRoot, lSciaticHip, 'motor', 0.45, 1.6, nextOffset());
  add(lSciaticHip, lSciaticMid, 'motor', 0.42, 1.6, nextOffset(0.02));
  add(lSciaticMid, lKnee, 'motor', 0.40, 1.6, nextOffset(0.02));
  add(sacralRoot, rSciaticHip, 'motor', 0.45, 1.6, nextOffset());
  add(rSciaticHip, rSciaticMid, 'motor', 0.42, 1.6, nextOffset(0.02));
  add(rSciaticMid, rKnee, 'motor', 0.40, 1.6, nextOffset(0.02));

  // Sciatic bifurcation at popliteal fossa:
  //   (A) Common Peroneal → anterior leg → dorsal foot
  //   (B) Tibial → posterior leg → plantar foot

  // A: Common Peroneal (wraps fibular head — lateral)
  const lPeronealMid = lerpOffset(lKnee, lAnkle, 0.5).add(new THREE.Vector3(-0.02, 0, 0));
  const rPeronealMid = lerpOffset(rKnee, rAnkle, 0.5).add(new THREE.Vector3(0.02, 0, 0));
  add(lKnee, lPeronealMid, 'motor', 0.32, 1.4, nextOffset());
  add(lPeronealMid, lAnkle.clone().add(new THREE.Vector3(-0.015, 0, 0)), 'motor', 0.28, 1.4, nextOffset(0.02));
  add(rKnee, rPeronealMid, 'motor', 0.32, 1.4, nextOffset());
  add(rPeronealMid, rAnkle.clone().add(new THREE.Vector3(0.015, 0, 0)), 'motor', 0.28, 1.4, nextOffset(0.02));
  // Deep peroneal → dorsum of foot
  add(lAnkle.clone().add(new THREE.Vector3(-0.01, 0, 0)), lFoot, 'peripheral', 0.20, 1.3, nextOffset());
  add(rAnkle.clone().add(new THREE.Vector3(0.01, 0, 0)), rFoot, 'peripheral', 0.20, 1.3, nextOffset());

  // B: Tibial nerve (posterior/medial leg → plantar and calcaneal branches)
  const lTibialMid = lerpOffset(lKnee, lAnkle, 0.5).add(new THREE.Vector3(0.01, 0, 0));
  const rTibialMid = lerpOffset(rKnee, rAnkle, 0.5).add(new THREE.Vector3(-0.01, 0, 0));
  add(lKnee, lTibialMid, 'sensory', 0.30, 0.7, nextOffset());
  add(lTibialMid, lAnkle.clone().add(new THREE.Vector3(0.01, 0, 0)), 'sensory', 0.26, 0.7, nextOffset(0.02));
  add(rKnee, rTibialMid, 'sensory', 0.30, 0.7, nextOffset());
  add(rTibialMid, rAnkle.clone().add(new THREE.Vector3(-0.01, 0, 0)), 'sensory', 0.26, 0.7, nextOffset(0.02));
  // Medial / lateral plantar nerves (plantar foot)
  const lHeel = getPos(pose[29]);
  const rHeel = getPos(pose[30]);
  add(lAnkle.clone().add(new THREE.Vector3(0.01, 0, 0)), lHeel, 'peripheral', 0.18, 0.7, nextOffset());
  add(rAnkle.clone().add(new THREE.Vector3(-0.01, 0, 0)), rHeel, 'peripheral', 0.18, 0.7, nextOffset());
  add(lHeel, lFoot, 'peripheral', 0.15, 0.7, nextOffset());
  add(rHeel, rFoot, 'peripheral', 0.15, 0.7, nextOffset());

  // Sural nerve (S1-S2) — purely sensory, posterior calf to lateral foot
  add(lKnee.clone().add(new THREE.Vector3(-0.01, 0, 0)), lAnkle.clone().add(new THREE.Vector3(-0.01, 0, 0)), 'sensory', 0.18, 0.6, nextOffset());
  add(rKnee.clone().add(new THREE.Vector3(0.01, 0, 0)), rAnkle.clone().add(new THREE.Vector3(0.01, 0, 0)), 'sensory', 0.18, 0.6, nextOffset());

  return segs;
}
