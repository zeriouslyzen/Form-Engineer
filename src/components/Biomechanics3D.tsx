import React, { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * BIOMECHANICS 3D ENGINE - PHYSICAL THERAPY EDITION (V4.0)
 * Performance-optimized: single animation loop, memoized geometry, no Star field.
 * Joint angle readouts for clinical-grade PT analysis.
 */

interface Biomechanics3DProps {
  pose: any[] | null;
  face: any[] | null;
  leftHand: any[] | null;
  rightHand: any[] | null;
  mirror?: boolean;
  skeletonScale: number;
  videoSize: { width: number; height: number };
  cropInfo: { sx: number; sy: number; sw: number; sh: number };
  videoViewport: { width: number; height: number; top: number; left: number };
}

const getAngle = (pA: THREE.Vector3, pB: THREE.Vector3, pC: THREE.Vector3) => {
  const v1 = new THREE.Vector3().subVectors(pA, pB).normalize();
  const v2 = new THREE.Vector3().subVectors(pC, pB).normalize();
  return (v1.angleTo(v2) * 180) / Math.PI;
};

const getAlignmentColor = (error: number, thresholdGood: number, thresholdPerfect: number) => {
  if (error < thresholdPerfect) return '#22c55e'; // Green = good
  if (error < thresholdGood)   return '#eab308'; // Yellow = warning
  return '#ef4444';                              // Red = fix needed
};

// PT-relevant connections: full body, no fluff
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Arms
  [11, 23], [12, 24], [23, 24],                      // Torso/Hips
  [23, 25], [24, 26], [25, 27], [26, 28],            // Legs
  [27, 29], [28, 30], [27, 31], [28, 32],            // Feet
];

const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
];

// Reusable geometry singletons — created once, shared everywhere
const JOINT_GEO   = new THREE.SphereGeometry(0.003, 8, 8);
const HAND_GEO    = new THREE.SphereGeometry(0.002, 6, 6);
const DANTIEN_GEO = new THREE.SphereGeometry(0.008, 16, 16);

// ─── VectorLine: memoized buffer, no per-frame allocation ───────────────────
const VectorLine: React.FC<{ start: THREE.Vector3; end: THREE.Vector3; color: string; opacity?: number }> =
  React.memo(({ start, end, color, opacity = 0.5 }) => {
    const geoRef = useRef<THREE.BufferGeometry>(null);

    useMemo(() => {
      if (geoRef.current) {
        const pos = geoRef.current.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, start.x, start.y, start.z);
        pos.setXYZ(1, end.x, end.y, end.z);
        pos.needsUpdate = true;
      }
    }, [start, end]);

    const positions = useMemo(() =>
      new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]),
    []);

    return (
      <line>
        <bufferGeometry ref={geoRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </line>
    );
  });

// ─── Animated Dantien (single useFrame for whole scene) ─────────────────────
const AnimatedScene: React.FC<{ dantienPos: THREE.Vector3 | null; skeletonScale: number }> = ({ dantienPos, skeletonScale }) => {
  const dantienRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (dantienRef.current && dantienPos) {
      const pulse = Math.sin(clock.elapsedTime * 3) * 0.12 + 1.0;
      dantienRef.current.scale.setScalar(pulse);
      dantienRef.current.position.copy(dantienPos);
      dantienRef.current.visible = true;
    } else if (dantienRef.current) {
      dantienRef.current.visible = false;
    }
  });

  return (
    <mesh ref={dantienRef} geometry={DANTIEN_GEO}>
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={4} transparent opacity={0.7} />
    </mesh>
  );
};

// ─── Main Skeleton ───────────────────────────────────────────────────────────
const Skeleton: React.FC<Biomechanics3DProps> = ({ pose, face, leftHand, rightHand, mirror = true, skeletonScale, videoSize, cropInfo }) => {
  const getPos = useCallback((l: any): THREE.Vector3 => {
    if (!l) return new THREE.Vector3(0, 0, 0);
    const relX = (l.x * videoSize.width  - cropInfo.sx) / cropInfo.sw;
    const relY = (l.y * videoSize.height - cropInfo.sy) / cropInfo.sh;
    const xBase = mirror ? (0.5 - relX) : (relX - 0.5);
    return new THREE.Vector3(xBase, 0.5 - relY, -(l.z || 0));
  }, [videoSize.width, videoSize.height, cropInfo.sx, cropInfo.sy, cropInfo.sw, cropInfo.sh, mirror]);

  // Key PT joint angles — memoized from pose
  const angles = useMemo(() => {
    if (!pose || pose.length < 33) return null;
    const gp = (i: number) => getPos(pose[i]);
    return {
      lShoulder: getAngle(gp(13), gp(11), gp(23)),   // L arm vs torso
      rShoulder: getAngle(gp(14), gp(12), gp(24)),
      lElbow:    getAngle(gp(11), gp(13), gp(15)),
      rElbow:    getAngle(gp(12), gp(14), gp(16)),
      lKnee:     getAngle(gp(23), gp(25), gp(27)),
      rKnee:     getAngle(gp(24), gp(26), gp(28)),
      hipTilt:   Math.abs(getPos(pose[23]).y - getPos(pose[24]).y) * 100,
      shoulderTilt: Math.abs(getPos(pose[11]).y - getPos(pose[12]).y) * 100,
    };
  }, [pose, getPos]);

  // Spine alignment color
  const spineColor = useMemo(() => {
    if (!pose || !pose[0] || !pose[23] || !pose[24]) return '#10b981';
    const nose = getPos(pose[0]);
    const hipC = new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5);
    const spineVec = new THREE.Vector3().subVectors(nose, hipC).normalize();
    const err = Math.abs(spineVec.angleTo(new THREE.Vector3(0, 1, 0)) * 180 / Math.PI);
    return getAlignmentColor(err, 18, 5);
  }, [pose, getPos]);

  const dantienPos = useMemo(() => {
    if (!pose || !pose[23] || !pose[24]) return null;
    return new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5);
  }, [pose, getPos]);

  // PT angle label items: joint index → which angle key to display
  const PT_LABELS: { b: number; label: string; angle?: number; color: string }[] = useMemo(() => {
    if (!angles) return [];
    return [
      { b: 13, label: 'L.ELBOW',    angle: angles.lElbow,    color: getAlignmentColor(Math.abs(angles.lElbow - 90), 25, 8) },
      { b: 14, label: 'R.ELBOW',    angle: angles.rElbow,    color: getAlignmentColor(Math.abs(angles.rElbow - 90), 25, 8) },
      { b: 25, label: 'L.KNEE',     angle: angles.lKnee,     color: getAlignmentColor(Math.abs(angles.lKnee - 170), 20, 8) },
      { b: 26, label: 'R.KNEE',     angle: angles.rKnee,     color: getAlignmentColor(Math.abs(angles.rKnee - 170), 20, 8) },
      { b: 11, label: 'L.SHLD',     angle: angles.lShoulder, color: getAlignmentColor(Math.abs(angles.lShoulder - 90), 30, 10) },
      { b: 12, label: 'R.SHLD',     angle: angles.rShoulder, color: getAlignmentColor(Math.abs(angles.rShoulder - 90), 30, 10) },
    ];
  }, [angles]);

  return (
    <group>
      {/* POSE SKELETON */}
      {pose && (
        <group>
          {/* Joints */}
          {pose.map((l, i) => {
            if ((l.visibility || 0) < 0.4) return null;
            const p = getPos(l);
            const col = i === 0 ? spineColor : '#ffffff';
            return (
              <mesh key={`pj-${i}`} position={p} geometry={JOINT_GEO}>
                <meshStandardMaterial color={col} emissive={col} emissiveIntensity={4} transparent opacity={Math.min(1, (l.visibility || 0) + 0.2)} />
              </mesh>
            );
          })}

          {/* Bones with alignment coloring */}
          {POSE_CONNECTIONS.map(([a, b], i) => {
            if (!pose[a] || !pose[b]) return null;
            if ((pose[a].visibility || 0) < 0.4 || (pose[b].visibility || 0) < 0.4) return null;
            const pA = getPos(pose[a]);
            const pB = getPos(pose[b]);

            let color = '#10b981';
            if (angles) {
              if (a === 11 && b === 12) color = getAlignmentColor(angles.shoulderTilt, 6, 2);
              if (a === 23 && b === 24) color = getAlignmentColor(angles.hipTilt, 6, 2);
              if ((a === 11 && b === 13) || (a === 13 && b === 15)) color = getAlignmentColor(Math.abs(angles.lElbow - 90), 25, 8);
              if ((a === 12 && b === 14) || (a === 14 && b === 16)) color = getAlignmentColor(Math.abs(angles.rElbow - 90), 25, 8);
              if ((a === 23 && b === 25) || (a === 25 && b === 27)) color = getAlignmentColor(Math.abs(angles.lKnee - 170), 20, 8);
              if ((a === 24 && b === 26) || (a === 26 && b === 28)) color = getAlignmentColor(Math.abs(angles.rKnee - 170), 20, 8);
            }

            return (
              <group key={`pb-${i}`}>
                <VectorLine start={pA} end={pB} color={color} opacity={0.6} />
              </group>
            );
          })}

          {/* PT ANGLE LABELS — only on key joints */}
          {PT_LABELS.map(({ b, label, angle, color }) => {
            if (!pose[b] || (pose[b].visibility || 0) < 0.4) return null;
            const p = getPos(pose[b]);
            return (
              <Html key={`pt-${b}`} center position={[p.x + 0.07, p.y + 0.05, 0]}>
                <div className="medical-label" style={{ borderColor: color, color }}>
                  <span style={{ fontSize: '9px', opacity: 0.7 }}>{label}</span>
                  <br />
                  <span style={{ fontSize: '13px', fontWeight: 900 }}>{angle?.toFixed(0)}°</span>
                </div>
              </Html>
            );
          })}

          {/* Neck line */}
          {pose[11] && pose[12] && face && face[0] && (
            <VectorLine
              start={new THREE.Vector3().lerpVectors(getPos(pose[11]), getPos(pose[12]), 0.5)}
              end={getPos(face[0])}
              color={spineColor}
              opacity={0.4}
            />
          )}
        </group>
      )}

      {/* HANDS */}
      {[leftHand, rightHand].map((hand, hIdx) => hand && (
        <group key={`h-${hIdx}`}>
          {hand.map((l, i) => (
            <mesh key={`hj-${hIdx}-${i}`} position={getPos(l)} geometry={HAND_GEO}>
              <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={3} />
            </mesh>
          ))}
          {HAND_CONNECTIONS.map(([a, b], i) => (
            <VectorLine key={`hl-${hIdx}-${i}`} start={getPos(hand[a])} end={getPos(hand[b])} color="#00e5ff" opacity={0.45} />
          ))}
        </group>
      ))}

      {/* Dantien pulsing center — single consolidated useFrame */}
      <AnimatedScene dantienPos={dantienPos} skeletonScale={skeletonScale} />
    </group>
  );
};

// ─── Root Export ─────────────────────────────────────────────────────────────
export const Biomechanics3D: React.FC<Biomechanics3DProps> = (props) => {
  return (
    <div
      className="biomechanics-3d-overlay"
      style={{
        width:  `${props.videoViewport.width}px`,
        height: `${props.videoViewport.height}px`,
        top:    `${props.videoViewport.top}px`,
        left:   `${props.videoViewport.left}px`,
      }}
    >
      <Canvas
        gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
        dpr={1}                        // Lock to 1x — no 2x Retina upscaling on the overlay
        frameloop="demand"             // Only re-render when props change, not 60fps constant
        style={{ width: '100%', height: '100%' }}
      >
        <OrthographicCamera makeDefault left={-0.5} right={0.5} top={0.5} bottom={-0.5} near={0.1} far={100} position={[0, 0, 10]} />
        <ambientLight intensity={0.6} />
        <pointLight position={[5, 5, 10]} intensity={1.5} />
        <Skeleton {...props} />
      </Canvas>
    </div>
  );
};
