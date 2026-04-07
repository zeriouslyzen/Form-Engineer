import React, { useRef, useMemo, useCallback, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { computeNervousSystem, NERVE_COLORS } from '../lib/NervousSystem';

/**
 * BIOMECHANICS 3D ENGINE — V5.0
 * Three visualization modes:
 *   1. SKELETON  — clinical joint angles with alignment coloring
 *   2. NERVOUS   — animated dermatome/nerve pathway map
 *   3. JOINTS    — animated ROM circles that breathe open/closed per joint health
 */

export type VisualizationMode = 'SKELETON' | 'NERVOUS' | 'JOINTS';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getAngle = (pA: THREE.Vector3, pB: THREE.Vector3, pC: THREE.Vector3) => {
  const v1 = new THREE.Vector3().subVectors(pA, pB).normalize();
  const v2 = new THREE.Vector3().subVectors(pC, pB).normalize();
  return (v1.angleTo(v2) * 180) / Math.PI;
};

const getAlignmentColor = (error: number, thresholdGood: number, thresholdPerfect: number): string => {
  if (error < thresholdPerfect) return '#22c55e';
  if (error < thresholdGood)   return '#eab308';
  return '#ef4444';
};

// Shared geometry singletons
const JOINT_GEO = new THREE.SphereGeometry(0.003, 8, 8);
const HAND_GEO  = new THREE.SphereGeometry(0.0022, 6, 6);
const RING_GEO  = new THREE.RingGeometry(0.8, 1.0, 48);

const POSE_CONNECTIONS: [number, number][] = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[24,26],[25,27],[26,28],
  [27,29],[28,30],[27,31],[28,32],
];

const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
];

// ─── Memoized VectorLine ──────────────────────────────────────────────────────
const VectorLine = React.memo(({ start, end, color, opacity = 0.5 }: {
  start: THREE.Vector3; end: THREE.Vector3; color: string; opacity?: number
}) => {
  const positions = useMemo(
    () => new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]),
    [start.x, start.y, start.z, end.x, end.y, end.z]
  );
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </line>
  );
});

// ─── MODE 2: ALL nerve pulses in ONE useFrame ────────────────────────────────
// Single AnimatedPulses component — one useFrame drives all dots
const AnimatedPulses: React.FC<{ segments: import('../lib/NervousSystem').NerveSegment[] }> = ({ segments }) => {
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    segments.forEach((seg, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const progress = ((t * seg.speed + seg.offset) % 1.0);
      mesh.position.lerpVectors(seg.from, seg.to, progress);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = Math.sin(progress * Math.PI) * 8 + 0.3;
    });
  });

  return (
    <>
      {segments.map((seg, i) => {
        // Size of pulse dot scales with nerve type: trunk=bigger, peripheral=tiny
        const r = seg.type === 'cns' ? 0.005 : seg.type === 'motor' ? 0.0035 : 0.002;
        return (
          <mesh key={i} ref={el => { refs.current[i] = el; }}>
            <sphereGeometry args={[r, 5, 5]} />
            <meshStandardMaterial color={seg.color} emissive={seg.color} emissiveIntensity={4} transparent opacity={0.95} />
          </mesh>
        );
      })}
    </>
  );
};



// ─── MODE 3: Joint ROM Circle ────────────────────────────────────────────────
// Circles that breathe open (full ROM) or close (restricted) based on joint angle health
const JointCircle: React.FC<{
  position: THREE.Vector3;
  angle: number;          // actual measured angle
  idealAngle: number;     // target angle for good PT
  rangeTolerance: number; // how many degrees = "good"
  color: string;
  label: string;
  size?: number;
}> = ({ position, angle, idealAngle, rangeTolerance, color, label, size = 1 }) => {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  // Health 0-1: how close to ideal
  const health = useMemo(() => {
    const err = Math.abs(angle - idealAngle);
    return Math.max(0, 1 - err / rangeTolerance);
  }, [angle, idealAngle, rangeTolerance]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Outer ring breathes at rate proportional to health (healthy = faster, calm breathing)
    const breatheSpeed = 1.2 + health * 1.5;
    const breathe = Math.sin(t * breatheSpeed) * 0.08 + 1.0;

    if (outerRef.current) {
      const s = (0.018 + health * 0.008) * breathe * size;
      outerRef.current.scale.set(s, s, s);
      const mat = outerRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.2 + health * 0.35;
    }
    if (innerRef.current) {
      const s = (0.010 + health * 0.005) * size;
      innerRef.current.scale.set(s, s, s);
      const mat = innerRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2 + health * 5;
    }
  });

  return (
    <group position={position}>
      {/* Outer breathing ring */}
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]} geometry={RING_GEO}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {/* Inner core dot */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.8, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.85} />
      </mesh>
      {/* Arc indicator showing current vs ideal */}
      <Html center position={[0.06, 0.04, 0]}>
        <div style={{
          background: 'rgba(0,0,0,0.85)',
          border: `1px solid ${color}`,
          color,
          fontFamily: 'monospace',
          fontSize: '10px',
          fontWeight: 900,
          padding: '3px 8px',
          letterSpacing: '0.05em',
          textShadow: `0 0 8px ${color}55`,
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}>
          <div style={{ fontSize: '8px', opacity: 0.65 }}>{label}</div>
          <div>{angle.toFixed(0)}° <span style={{ opacity: 0.5 }}>/{idealAngle}°</span></div>
          <div style={{
            height: '2px',
            width: '100%',
            background: 'rgba(255,255,255,0.1)',
            marginTop: '2px',
            borderRadius: '1px',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, health * 100)}%`,
              background: color,
              borderRadius: '1px',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      </Html>
    </group>
  );
};

// ─── Single Dantien (consolidated animation) ─────────────────────────────────
const Dantien: React.FC<{ pos: THREE.Vector3 | null }> = ({ pos }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !pos) { if (ref.current) ref.current.visible = false; return; }
    ref.current.visible = true;
    ref.current.position.copy(pos);
    ref.current.scale.setScalar(Math.sin(clock.elapsedTime * 3) * 0.12 + 1.0);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.008, 16, 16]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={4} transparent opacity={0.7} />
    </mesh>
  );
};

// ─── SCENE: all three modes ───────────────────────────────────────────────────
const Scene: React.FC<Biomechanics3DProps & { mode: VisualizationMode }> = (props) => {
  const { pose, face, leftHand, rightHand, mirror = true, skeletonScale, videoSize, cropInfo, mode } = props;

  const getPos = useCallback((l: any): THREE.Vector3 => {
    if (!l) return new THREE.Vector3(0, 0, 0);
    const relX = (l.x * videoSize.width  - cropInfo.sx) / cropInfo.sw;
    const relY = (l.y * videoSize.height - cropInfo.sy) / cropInfo.sh;
    return new THREE.Vector3(
      mirror ? (0.5 - relX) : (relX - 0.5),
      0.5 - relY,
      -(l.z || 0)
    );
  }, [videoSize.width, videoSize.height, cropInfo.sx, cropInfo.sy, cropInfo.sw, cropInfo.sh, mirror]);

  const angles = useMemo(() => {
    if (!pose || pose.length < 33) return null;
    const gp = (i: number) => getPos(pose[i]);
    return {
      lShoulder: getAngle(gp(13), gp(11), gp(23)),
      rShoulder: getAngle(gp(14), gp(12), gp(24)),
      lElbow:    getAngle(gp(11), gp(13), gp(15)),
      rElbow:    getAngle(gp(12), gp(14), gp(16)),
      lKnee:     getAngle(gp(23), gp(25), gp(27)),
      rKnee:     getAngle(gp(24), gp(26), gp(28)),
      lHip:      getAngle(gp(11), gp(23), gp(25)),
      rHip:      getAngle(gp(12), gp(24), gp(26)),
      shoulderTilt: Math.abs(getPos(pose[11]).y - getPos(pose[12]).y) * 100,
      hipTilt:      Math.abs(getPos(pose[23]).y - getPos(pose[24]).y) * 100,
    };
  }, [pose, getPos]);

  const nervousData = useMemo(() =>
    mode === 'NERVOUS' ? computeNervousSystem(pose, getPos, leftHand, rightHand) : null,
  [pose, getPos, leftHand, rightHand, mode]);

  const dantienPos = useMemo(() => {
    if (!pose || !pose[23] || !pose[24]) return null;
    return new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5);
  }, [pose, getPos]);

  const spineColor = useMemo(() => {
    if (!pose || !pose[0] || !pose[23] || !pose[24]) return '#10b981';
    const nose = getPos(pose[0]);
    const hipC = new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5);
    const spineVec = new THREE.Vector3().subVectors(nose, hipC).normalize();
    const err = Math.abs(spineVec.angleTo(new THREE.Vector3(0, 1, 0)) * 180 / Math.PI);
    return getAlignmentColor(err, 18, 5);
  }, [pose, getPos]);

  // ── MODE 1: SKELETON ───────────────────────────────────────────────────────
  const renderSkeleton = () => pose && (
    <group>
      {pose.map((l, i) => {
        if ((l.visibility || 0) < 0.4) return null;
        const p = getPos(l);
        const col = i === 0 ? spineColor : '#ffffff';
        return (
          <mesh key={`sj-${i}`} position={p} geometry={JOINT_GEO}>
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={4} transparent opacity={Math.min(1, (l.visibility || 0) + 0.3)} />
          </mesh>
        );
      })}
      {POSE_CONNECTIONS.map(([a, b], i) => {
        if (!pose[a] || !pose[b] || (pose[a].visibility || 0) < 0.4 || (pose[b].visibility || 0) < 0.4) return null;
        let color = '#10b981';
        if (angles) {
          if (a === 11 && b === 12) color = getAlignmentColor(angles.shoulderTilt, 6, 2);
          if (a === 23 && b === 24) color = getAlignmentColor(angles.hipTilt, 6, 2);
          if ((a === 11 && b === 13) || (a === 13 && b === 15)) color = getAlignmentColor(Math.abs(angles.lElbow - 90), 25, 8);
          if ((a === 12 && b === 14) || (a === 14 && b === 16)) color = getAlignmentColor(Math.abs(angles.rElbow - 90), 25, 8);
        }
        return <VectorLine key={`sb-${i}`} start={getPos(pose[a])} end={getPos(pose[b])} color={color} opacity={0.65} />;
      })}

      {/* PT angle labels */}
      {angles && pose && [
        { idx: 13, label: 'L.ELBOW', angle: angles.lElbow, ideal: 90, tol: 40 },
        { idx: 14, label: 'R.ELBOW', angle: angles.rElbow, ideal: 90, tol: 40 },
        { idx: 25, label: 'L.KNEE',  angle: angles.lKnee,  ideal: 170, tol: 30 },
        { idx: 26, label: 'R.KNEE',  angle: angles.rKnee,  ideal: 170, tol: 30 },
      ].map(({ idx, label, angle, ideal, tol }) => {
        if (!pose[idx] || (pose[idx].visibility || 0) < 0.4) return null;
        const color = getAlignmentColor(Math.abs(angle - ideal), tol, tol * 0.25);
        const p = getPos(pose[idx]);
        return (
          <Html key={`sl-${idx}`} center position={[p.x + 0.07, p.y + 0.05, 0]}>
            <div className="medical-label" style={{ borderColor: color, color }}>
              <span style={{ fontSize: '8px', opacity: 0.7 }}>{label}</span>
              <br /><span style={{ fontSize: '13px', fontWeight: 900 }}>{angle.toFixed(0)}°</span>
            </div>
          </Html>
        );
      })}

      {/* Neck */}
      {pose[11] && pose[12] && face && face[0] && (
        <VectorLine
          start={new THREE.Vector3().lerpVectors(getPos(pose[11]), getPos(pose[12]), 0.5)}
          end={getPos(face[0])}
          color={spineColor} opacity={0.4}
        />
      )}
    </group>
  );

  // ── MODE 2: NERVOUS SYSTEM ─────────────────────────────────────────────────
  const renderNervous = () => nervousData && (
    <group>
      {/* All static nerve lines — differentiated by type/opacity */}
      {nervousData.map((seg, i) => (
        <VectorLine key={`ns-${i}`} start={seg.from} end={seg.to} color={seg.color} opacity={seg.opacity} />
      ))}

      {/* Single consolidated animation loop for ALL pulse dots */}
      <AnimatedPulses segments={nervousData} />

      {/* Nerve type legend */}
      {pose && pose[12] && (pose[12].visibility || 0) > 0.4 && (
        <Html position={[getPos(pose[12]).x + 0.20, getPos(pose[12]).y + 0.05, 0]}>
          <div style={{ fontFamily: 'monospace', fontSize: '8px', lineHeight: 2.0, userSelect: 'none' }}>
            {(Object.entries(NERVE_COLORS) as [string, string][]).map(([type, color]) => (
              <div key={type} style={{ color, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ letterSpacing: '0.1em' }}>{type.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </Html>
      )}
    </group>
  );

  // ── MODE 3: JOINT MAPPING (ROM circles) ────────────────────────────────────
  const renderJoints = () => angles && pose && (
    <group>
      {/* Core skeleton ghost (faint) for reference */}
      {POSE_CONNECTIONS.map(([a, b], i) => {
        if (!pose[a] || !pose[b] || (pose[a].visibility || 0) < 0.4 || (pose[b].visibility || 0) < 0.4) return null;
        return <VectorLine key={`jg-${i}`} start={getPos(pose[a])} end={getPos(pose[b])} color="#ffffff" opacity={0.08} />;
      })}

      {/* Animated ROM circles on key joints */}
      {[
        { idx: 13, label: 'L.SHOULDER', angle: angles.lShoulder, ideal: 90,  tol: 60 },
        { idx: 14, label: 'R.SHOULDER', angle: angles.rShoulder, ideal: 90,  tol: 60 },
        { idx: 13, label: 'L.ELBOW',    angle: angles.lElbow,    ideal: 160, tol: 40 },
        { idx: 14, label: 'R.ELBOW',    angle: angles.rElbow,    ideal: 160, tol: 40 },
        { idx: 23, label: 'L.HIP',      angle: angles.lHip,      ideal: 170, tol: 30 },
        { idx: 24, label: 'R.HIP',      angle: angles.rHip,      ideal: 170, tol: 30 },
        { idx: 25, label: 'L.KNEE',     angle: angles.lKnee,     ideal: 175, tol: 20 },
        { idx: 26, label: 'R.KNEE',     angle: angles.rKnee,     ideal: 175, tol: 20 },
      ].map(({ idx, label, angle, ideal, tol }, i) => {
        if (!pose[idx] || (pose[idx].visibility || 0) < 0.45) return null;
        const err = Math.abs(angle - ideal);
        const color = getAlignmentColor(err, tol * 0.6, tol * 0.2);
        return (
          <JointCircle
            key={`jc-${i}`}
            position={getPos(pose[idx])}
            angle={angle}
            idealAngle={ideal}
            rangeTolerance={tol}
            color={color}
            label={label}
            size={skeletonScale}
          />
        );
      })}
    </group>
  );

  return (
    <group>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 10]} intensity={1.5} />

      {mode === 'SKELETON' && renderSkeleton()}
      {mode === 'NERVOUS'  && renderNervous()}
      {mode === 'JOINTS'   && renderJoints()}

      {/* Hands always shown (behind the mode) */}
      {mode === 'SKELETON' && [leftHand, rightHand].map((hand, hIdx) => hand && (
        <group key={`h-${hIdx}`}>
          {hand.map((l: any, i: number) => (
            <mesh key={`hj-${hIdx}-${i}`} position={getPos(l)} geometry={HAND_GEO}>
              <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={3} />
            </mesh>
          ))}
          {HAND_CONNECTIONS.map(([a, b], i) => (
            <VectorLine key={`hl-${hIdx}-${i}`} start={getPos(hand[a])} end={getPos(hand[b])} color="#00e5ff" opacity={0.4} />
          ))}
        </group>
      ))}

      {/* Dantien always */}
      <Dantien pos={dantienPos} />
    </group>
  );
};

// ─── Mode Switcher HUD ────────────────────────────────────────────────────────
const ModeSwitcher: React.FC<{ mode: VisualizationMode; onChange: (m: VisualizationMode) => void }> = ({ mode, onChange }) => {
  const modes: { key: VisualizationMode; label: string; icon: string; desc: string }[] = [
    { key: 'SKELETON', label: 'SKELETON', icon: '⬡', desc: 'Joint angles & alignment' },
    { key: 'NERVOUS',  label: 'NERVOUS',  icon: '⚡', desc: 'Neural pathway map' },
    { key: 'JOINTS',   label: 'JOINTS',   icon: '◎', desc: 'ROM breathing circles' },
  ];

  return (
    <div style={{
      position: 'absolute',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '8px',
      zIndex: 1000,
      pointerEvents: 'auto',
    }} onMouseDown={e => e.stopPropagation()}>
      {modes.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          style={{
            background: mode === m.key ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.7)',
            border: `1px solid ${mode === m.key ? '#10b981' : 'rgba(16,185,129,0.2)'}`,
            color: mode === m.key ? '#10b981' : 'rgba(16,185,129,0.4)',
            fontFamily: 'monospace',
            fontSize: '10px',
            letterSpacing: '0.2em',
            padding: '8px 16px',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            transition: 'all 0.2s ease',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: '16px' }}>{m.icon}</div>
          <div>{m.label}</div>
          <div style={{ fontSize: '8px', opacity: 0.6, marginTop: '2px' }}>{m.desc}</div>
        </button>
      ))}
    </div>
  );
};

// ─── Root Export ─────────────────────────────────────────────────────────────
export const Biomechanics3D: React.FC<Biomechanics3DProps> = (props) => {
  const [mode, setMode] = useState<VisualizationMode>('SKELETON');

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
        dpr={1}
        frameloop="always"
        style={{ width: '100%', height: '100%' }}
      >
        <OrthographicCamera makeDefault left={-0.5} right={0.5} top={0.5} bottom={-0.5} near={0.1} far={100} position={[0, 0, 10]} />
        <Scene {...props} mode={mode} />
      </Canvas>

      <ModeSwitcher mode={mode} onChange={setMode} />
    </div>
  );
};
