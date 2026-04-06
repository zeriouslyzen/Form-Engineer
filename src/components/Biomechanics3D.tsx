import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';

/**
 * BIOMECHANICS 3D ENGINE - CHI GONG EDITION (RESTORED)
 * Full skeletal tracking with integrated alignment-color logic.
 */

interface Biomechanics3DProps {
  pose: any[] | null;
  face: any[] | null;
  leftHand: any[] | null;
  rightHand: any[] | null;
  mirror?: boolean;
  zoom: number;
  pan: { x: number; y: number };
  videoSize: { width: number; height: number };
}

// Helper: Calculate angle between three points (A-B-C) at point B
const getAngle = (pA: THREE.Vector3, pB: THREE.Vector3, pC: THREE.Vector3) => {
  const v1 = new THREE.Vector3().subVectors(pA, pB).normalize();
  const v2 = new THREE.Vector3().subVectors(pC, pB).normalize();
  return (v1.angleTo(v2) * 180) / Math.PI;
};

// Helper: Map error to Red -> Orange -> Neon Green
const getAlignmentColor = (error: number, thresholdGood: number, thresholdPerfect: number) => {
  if (error < thresholdPerfect) return { color: '#22c55e', intensity: 8 }; // Neon Green
  if (error < thresholdGood) return { color: '#eab308', intensity: 3 };    // Orange/Yellow
  return { color: '#ef4444', intensity: 0.8 };                            // Red
};

// FULL POSE SKELETON CONNECTIONS
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Arms
  [11, 23], [12, 24], [23, 24],                     // Torso/Hips
  [23, 25], [24, 26], [25, 27], [26, 28],           // Legs
  [27, 29], [28, 30], [27, 31], [28, 32]            // Feet
];

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [0, 9], [9, 10], [10, 11], [11, 12], // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
];

const Skeleton: React.FC<Biomechanics3DProps> = ({ pose, face, leftHand, rightHand, mirror = true, zoom, pan, videoSize }) => {
  const getPos = (l: any) => {
    if (!l) return new THREE.Vector3(0, 0, 0);
    const w = videoSize.width;
    const h = videoSize.height;
    const baseSW = Math.min(w, h / 2.0);
    const sw = baseSW / zoom;
    const sh = (baseSW * 2.0) / zoom;
    const cx = w / 2 + (pan.x * (w / 1000));
    const cy = h / 2 + (pan.y * (h / 2000));
    const sx = cx - sw / 2;
    const sy = cy - sh / 2;
    const relX = (l.x * w - sx) / sw;
    const relY = (l.y * h - sy) / sh;
    const xBase = mirror ? (0.5 - relX) : (relX - 0.5);
    const yBase = 1.0 - (relY * 2.0);
    return new THREE.Vector3(xBase, yBase, -l.z);
  };

  // 1. Calculate Core Alignments for whole-skeleton coloring
  const alignments = useMemo(() => {
    if (!pose) return null;
    const p11 = getPos(pose[11]);
    const p12 = getPos(pose[12]);
    const p23 = getPos(pose[23]);
    const p24 = getPos(pose[24]);
    
    return {
      shoulders: Math.abs(p11.y - p12.y) * 100,
      hips: Math.abs(p23.y - p24.y) * 100,
      lElbow: pose[11]&&pose[13]&&pose[15] ? Math.abs(getAngle(getPos(pose[11]), getPos(pose[13]), getPos(pose[15])) - 90) : 100,
      rElbow: pose[12]&&pose[14]&&pose[16] ? Math.abs(getAngle(getPos(pose[12]), getPos(pose[14]), getPos(pose[16])) - 90) : 100,
    };
  }, [pose, getPos]);

  return (
    <group>
      <VectorLine start={new THREE.Vector3(-0.5, 0, -0.5)} end={new THREE.Vector3(0.5, 0, -0.5)} color="#ffffff" opacity={0.05} />

      {/* POSE SKELETON */}
      {pose && (
        <group>
          {/* Joints */}
          {pose.map((l, i) => (
            l.visibility > 0.5 && (
              <mesh key={`p-${i}`} position={getPos(l)}>
                <sphereGeometry args={[0.012, 16, 16]} />
                <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2} />
              </mesh>
            )
          ))}
          {/* Main Connections with Alignment Coloring */}
          {POSE_CONNECTIONS.map(([a, b], i) => {
            if (!pose[a] || !pose[b] || pose[a].visibility < 0.5 || pose[b].visibility < 0.5) return null;
            const pA = getPos(pose[a]);
            const pB = getPos(pose[b]);
            
            let color = "#10b981";
            let opacity = 0.4;
            
            if (alignments) {
              if ((a === 11 && b === 12)) color = getAlignmentColor(alignments.shoulders, 6, 1.5).color;
              if ((a === 23 && b === 24)) color = getAlignmentColor(alignments.hips, 6, 1.5).color;
              if ((a === 11 && b === 13) || (a === 13 && b === 15)) color = getAlignmentColor(alignments.lElbow, 25, 8).color;
              if ((a === 12 && b === 14) || (a === 14 && b === 16)) color = getAlignmentColor(alignments.rElbow, 25, 8).color;
              if (color !== "#10b981") opacity = 0.8;
            }

            return <VectorLine key={`pl-${i}`} start={pA} end={pB} color={color} opacity={opacity} />;
          })}
        </group>
      )}

      {/* HANDS (Restored with Spirit Cones) */}
      {[leftHand, rightHand].map((hand, hIdx) => hand && (
        <group key={`h-${hIdx}`}>
          {hand.map((l, i) => (
            <mesh key={`h-${hIdx}-${i}`} position={getPos(l)}>
              <sphereGeometry args={[0.005, 8, 8]} />
              <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={3} />
            </mesh>
          ))}
          {HAND_CONNECTIONS.map(([a, b], i) => (
            <VectorLine key={`hl-${hIdx}-${i}`} start={getPos(hand[a])} end={getPos(hand[b])} color="#00ffff" opacity={0.4} />
          ))}
          <SpiritCone 
             start={getPos(hand[9])} 
             normal={new THREE.Vector3().subVectors(getPos(hand[12]), getPos(hand[0])).normalize()} 
             scale={0.12} 
          />
        </group>
      ))}

      {/* FACE (Iris Gaze Lasers) */}
      {face && (
        <group>
          {face.filter((_, i) => i % 20 === 0).map((l, i) => (
            <mesh key={`f-${i}`} position={getPos(l)}>
              <sphereGeometry args={[0.003, 4, 4]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.2} />
            </mesh>
          ))}
          {[468, 473].map(eyeIdx => {
             if (!face[eyeIdx]) return null;
             const p = getPos(face[eyeIdx]);
             return <VectorLine key={`eye-${eyeIdx}`} start={p} end={p.clone().add(new THREE.Vector3(0,0,-0.1))} color="#00ffff" opacity={0.6} />;
          })}
        </group>
      )}

      <Dantien pose={pose} getPos={getPos} />
      <ChakraSystem pose={pose} getPos={getPos} />
    </group>
  );
};

const ChakraSystem: React.FC<{ pose: any[] | null, getPos: (l: any) => THREE.Vector3 }> = ({ pose, getPos }) => {
  if (!pose || !pose[0] || !pose[23] || !pose[24]) return null;
  const nose = getPos(pose[0]);
  const hipCenter = new THREE.Vector3().lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5);
  
  const spineVec = new THREE.Vector3().subVectors(nose, hipCenter).normalize();
  const spineError = Math.abs(spineVec.angleTo(new THREE.Vector3(0, 1, 0)) * 180 / Math.PI);
  const { color: spineColor, intensity: spineIntensity } = getAlignmentColor(spineError, 18, 5);

  const chakras = [
    { color: '#a855f7', ratio: -0.15 }, { color: '#6366f1', ratio: 0.05 },
    { color: '#3b82f6', ratio: 0.25 }, { color: '#22c55e', ratio: 0.45 },
    { color: '#eab308', ratio: 0.65 }, { color: '#f97316', ratio: 0.85 },
    { color: '#ef4444', ratio: 1.05 },
  ];

  return (
    <group>
      {chakras.map((c, i) => {
        const p = new THREE.Vector3().lerpVectors(nose, hipCenter, c.ratio);
        return (
          <group key={`ch-${i}`}>
            <mesh position={p}>
              <sphereGeometry args={[0.015, 16, 16]} />
              <meshStandardMaterial color={spineColor === '#22c55e' ? '#22c55e' : c.color} emissive={spineColor === '#22c55e' ? '#22c55e' : c.color} emissiveIntensity={spineIntensity} />
            </mesh>
            <VectorLine start={p.clone().add(new THREE.Vector3(0,0,0.08))} end={p.clone().add(new THREE.Vector3(0,0,-0.08))} color={spineColor} opacity={0.6} />
          </group>
        );
      })}
    </group>
  );
};

const VectorLine: React.FC<{ start: THREE.Vector3, end: THREE.Vector3, color: string, opacity?: number }> = ({ start, end, color, opacity = 0.4 }) => {
  return (
    <line>
      <bufferGeometry attach="geometry">
        <bufferAttribute attach="attributes-position" args={[new Float32Array([...start.toArray(), ...end.toArray()]), 3]} />
      </bufferGeometry>
      <lineBasicMaterial attach="material" color={color} transparent opacity={opacity} linewidth={2} />
    </line>
  );
};

const SpiritCone: React.FC<{ start: THREE.Vector3, normal: THREE.Vector3, scale: number }> = ({ start, normal, scale }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    }
  });
  return (
    <mesh ref={ref} position={start}>
      <coneGeometry args={[scale * 0.4, scale, 32, 1, true]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={2} transparent opacity={0.05} wireframe />
    </mesh>
  );
};

const Dantien: React.FC<{ pose: any[] | null, getPos: (l: any) => THREE.Vector3 }> = ({ pose, getPos }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!meshRef.current || !pose || !pose[23] || !pose[24]) return;
    const pulse = Math.sin(clock.elapsedTime * 4) * 0.1 + 1.0;
    meshRef.current.scale.set(pulse, pulse, pulse);
    meshRef.current.position.lerpVectors(getPos(pose[23]), getPos(pose[24]), 0.5);
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.05, 32, 32]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={5} transparent opacity={0.2} />
    </mesh>
  );
};

export const Biomechanics3D: React.FC<Biomechanics3DProps> = (props) => {
  return (
    <div className="biomechanics-3d-overlay">
      <Canvas gl={{ alpha: true, antialias: true }} dpr={[1, 2]} style={{ width: '100%', height: '100%' }}>
        <OrthographicCamera makeDefault left={-0.5} right={0.5} top={1.0} bottom={-1.0} near={0.1} far={100} position={[0, 0, 10]} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={2} />
        <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={0.5} />
        <Skeleton {...props} />
      </Canvas>
    </div>
  );
};
