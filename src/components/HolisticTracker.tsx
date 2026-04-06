import React, { useEffect, useRef, useState } from 'react';
import { JKDLogic } from '../lib/JKDLogic';
import { AudioCoach } from '../lib/AudioService';
import { Biomechanics3D } from './Biomechanics3D';
import { OneEuroFilter } from '../lib/Filters';

/**
 * JKD DOJO: ULTIMATE HARDWARE RECOVERY
 * Robust click-to-start, high-visibility diagnostics, and standard stream loop.
 */

export const HolisticTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRawRef = useRef<HTMLCanvasElement>(null);
  const canvasEngRef = useRef<HTMLCanvasElement>(null);
  
  const [logic] = useState(() => new JKDLogic());
  const [coach] = useState(() => new AudioCoach());
  
  const [active, setActive] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  // Registration & Precision State
  const [isRegistering, setIsRegistering] = useState(false);
  const isRegisteringRef = useRef(false);
  const [registrationProgress, setRegistrationProgress] = useState(0);
  const filters = useRef<Map<string, OneEuroFilter>>(new Map());

  // Training State
  const [allLandmarks, setAllLandmarks] = useState<{
    pose: any[] | null, 
    face: any[] | null, 
    leftHand: any[] | null, 
    rightHand: any[] | null,
    imageSize: { width: number, height: number }
  }>({
    pose: null, 
    face: null, 
    leftHand: null, 
    rightHand: null,
    imageSize: { width: 1280, height: 720 }
  });

  // Focus & Pan States
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0); // Reset to 1.0 initially
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startPos.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };

  const handleMouseUp = () => { isDragging.current = false; };
  const handleDoubleClick = () => { setPan({ x: 0, y: 0 }); setZoom(1.1); };
  const handleWheel = (e: React.WheelEvent) => setZoom(prev => Math.max(1, Math.min(5, prev - e.deltaY * 0.002)));

  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permission once to get labels
        await navigator.mediaDevices.getUserMedia({ video: true });
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter(d => d.kind === 'videoinput');
        setDevices(videoDevs);
        if (videoDevs.length > 0) setSelectedDeviceId(videoDevs[0].deviceId);
      } catch (err) {
        console.error("JKD: Error fetching devices", err);
      }
    };
    getDevices();
  }, []);

  useEffect(() => {
    console.log("JKD: COMPONENT MOUNTED. Active:", active);
    if (!active) return;
    
    let holistic: any;
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    const init = async () => {
      console.log("JKD: INITIALIZING DOJO ENGINES...");
      try {
        const HolisticClass = (window as any).Holistic;
        
        if (!HolisticClass) {
           console.warn("JKD: WAITING FOR GLOBAL SCRIPTS...");
           setTimeout(init, 500); 
           return;
        }

        holistic = new HolisticClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
        });

        holistic.setOptions({
          modelComplexity: 2,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          refineFaceLandmarks: true,
        });

          holistic.onResults((results: any) => {
            if (!results.image) return;
            if (!streamStarted) setStreamStarted(true);

            if (isRegisteringRef.current) {
              const complete = logic.registerBody(results.poseLandmarks);
              if (complete) {
                isRegisteringRef.current = false;
                setIsRegistering(false);
                coach.feedback("Precision Engaged.");
              }
              setRegistrationProgress(prev => (prev < 100 ? prev + 1 : prev));
            }

            // Apply Predictive Filters for Surgical Precision
            const filteredPose = results.poseLandmarks?.map((lm: any, i: number) => {
            const fx = getFilter(`p${i}x`).filter(lm.x);
            const fy = getFilter(`p${i}y`).filter(lm.y);
            const fz = getFilter(`p${i}z`).filter(lm.z);
            return { ...lm, x: fx, y: fy, z: fz };
          }) || null;

          setAllLandmarks({
            pose: filteredPose,
            face: results.faceLandmarks || null,
            leftHand: results.leftHandLandmarks || null,
            rightHand: results.rightHandLandmarks || null,
            imageSize: { width: results.image.width, height: results.image.height }
          });
          renderDualScreens({ ...results, poseLandmarks: filteredPose });
        });

        console.log("JKD: REQUESTING CAMERA...");
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId 
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 720 }, height: { ideal: 1280 } }
            : { width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const processFrame = async () => {
           if (videoRef.current && holistic && !videoRef.current.paused) {
              await holistic.send({ image: videoRef.current });
           }
           animationFrameId = requestAnimationFrame(processFrame);
        };

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          console.log("JKD: VIDEO PLAYING.");
          processFrame();
        }

      } catch (err: any) {
        console.error("JKD CRITICAL ERROR:", err.name, err.message);
        alert(`Hardware Error: ${err.name}. Please ensure your iPhone is connected.`);
      }
    };

      init();

      return () => {
        console.log("JKD: CLEANING UP...");
        cancelAnimationFrame(animationFrameId);
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (holistic) holistic.close();
      };
    }, [active, selectedDeviceId]); // ONLY restart on device or active change

  const getFilter = (id: string) => {
    if (!filters.current.has(id)) {
      filters.current.set(id, new OneEuroFilter(0.5, 0.001, 1.0));
    }
    return filters.current.get(id)!;
  };

  const renderDualScreens = (results: any) => {
    const rawCtx = canvasRawRef.current?.getContext('2d');
    const engCtx = canvasEngRef.current?.getContext('2d');
    if (!rawCtx || !engCtx) return;

    [rawCtx, engCtx].forEach((ctx, i) => {
      const canvas = i === 0 ? canvasRawRef.current! : canvasEngRef.current!;
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const w = results.image.width;
      const h = results.image.height;
      const baseSW = Math.min(w, h / 2.0);
      const sw = baseSW / zoom;
      const sh = (baseSW * 2.0) / zoom;

      // Map screen-pan (0-1000) to SOURCE pixels
      const cx = w / 2 + (pan.x * (w / 1000));
      const cy = h / 2 + (pan.y * (h / 2000));

      const sx = cx - sw / 2;
      const sy = cy - sh / 2;

      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      
      if (i === 1) {
        if (results.poseLandmarks) {
          const analysis = logic.analyze(results.poseLandmarks);
          if (analysis.event === 'TELEGRAPH') {
            coach.speak('TELEGRAPH');
          }
        }
      }
      ctx.restore();
    });
  };

  if (!active) {
    return (
      <div className="fixed inset-0 bg-[#020202] flex flex-col items-center justify-center z-[9999] overflow-hidden">
        {/* SCANNING GRID BACKGROUND */}
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,_transparent_1px),_linear-gradient(90deg,rgba(16,185,129,0.05)_1px,_transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000_90%)]" />
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#10b981]/20 to-transparent animate-[scan_3s_infinite]" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-12 max-w-[90vw]">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[#10b981] font-mono text-xl tracking-[0.8em] uppercase leading-relaxed">BIOMETRIC PORTAL</h1>
            <p className="text-white/20 font-mono text-[9px] uppercase tracking-[0.5em]">Establishing Neural-Link v4.0</p>
          </div>

          <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-[#10b981]/40 to-transparent" />

          <button 
            onClick={() => {
              setActive(true);
              setIsRegistering(true);
              isRegisteringRef.current = true;
              setRegistrationProgress(0);
            }}
            className="group relative px-16 py-10 bg-transparent border border-[#10b981]/50 overflow-hidden transition-all hover:bg-[#10b981]/20"
          >
            <div className="absolute inset-0 bg-[#10b981]/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            <span className="relative z-10 text-[#10b981] font-mono text-xl tracking-[1em] uppercase group-hover:scale-110 block transition-transform text-right">Initiate Tracking</span>
            
            {/* Corner Accents */}
            <div className="absolute top-2 left-2 w-4 h-4 border-l border-t border-[#10b981]" />
            <div className="absolute top-2 right-2 w-4 h-4 border-r border-t border-[#10b981]" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-l border-b border-[#10b981]" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-r border-b border-[#10b981]" />
          </button>
          
          <div className="flex flex-col items-center gap-4 w-full">
            <label className="text-[#10b981]/30 font-mono text-[8px] uppercase tracking-widest">Select Optical Feed</label>
            <select 
              title="Optical Source"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-black/90 text-[#10b981] border border-[#10b981]/20 px-6 py-4 rounded-none font-mono text-[10px] outline-none focus:border-[#10b981] transition-all hover:bg-[#10b981]/10 appearance-none text-center min-w-[300px] tracking-widest uppercase"
            >
              {devices.map(device => (
                <option key={device.deviceId} value={device.deviceId} className="bg-[#050505]">
                  {device.label || `CAM_0${devices.indexOf(device) + 1}`}
                </option>
              ))}
              {devices.length === 0 && <option value="">SEARCHING SOURCES...</option>}
            </select>
          </div>
        </div>

        <div className="absolute bottom-12 text-white/10 font-mono text-[8px] uppercase tracking-[1em]">Symphony of Motion v2.4 // Global Node // {new Date().getFullYear()}</div>
      </div>
    );
  }

  return (
    <div 
      className="dojo-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
    >
      <video ref={videoRef} className="hidden" muted playsInline autoPlay />
      
      {/* AI STATUS PULSE - MODIFIED (NO VOICE) */}
      <div className="ai-pulse">
        <div className="pulse-core"></div>
        <span className="ai-label">ACTIVE</span>
      </div>
      
      {/* REGISTRATION HUD */}
      {isRegistering && (
        <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-64 h-64 flex items-center justify-center">
            <svg className="w-full h-full rotate-[-90deg]">
              <circle cx="128" cy="128" r="120" fill="none" stroke="#10b98122" strokeWidth="2" />
              <circle 
                cx="128" cy="128" r="120" fill="none" stroke="#10b981" strokeWidth="2" 
                strokeDasharray="754" strokeDashoffset={754 - (754 * registrationProgress) / 100}
                className="transition-all duration-300 ease-linear"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-[#10b981] font-mono text-xs tracking-[0.5em] animate-pulse">SCANNING</span>
              <span className="text-white font-mono text-2xl mt-2">{registrationProgress}%</span>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center gap-2">
            <p className="text-[#10b981]/60 font-mono text-[10px] uppercase tracking-widest">Registering Body Biometrics</p>
            <p className="text-white/40 font-mono text-[8px] uppercase tracking-widest">Hold Still for Surgical Calibration</p>
          </div>
        </div>
      )}
      
      {!streamStarted && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-[1000]">
          <div className="text-[#10b981] font-mono text-sm animate-pulse tracking-[1em] uppercase">Waking Optics...</div>
        </div>
      )}

      {/* PILLAR 1: RAW FEED */}
      <div className="iphone-pillar">
        <canvas ref={canvasRawRef} width={1000} height={2000} className="mirror" />
      </div>

      {/* PILLAR 2: ENGINEERING FEED + 3D OVERLAY */}
      <div className="iphone-pillar">
        <canvas ref={canvasEngRef} width={1000} height={2000} className="mirror" />
        <Biomechanics3D 
          pose={allLandmarks.pose}
          face={allLandmarks.face}
          leftHand={allLandmarks.leftHand}
          rightHand={allLandmarks.rightHand}
          zoom={zoom} 
          pan={pan}
          videoSize={allLandmarks.imageSize}
        />
      </div>

      {/* ZOOM KNOB */}
      <div className="zoom-knob-container">
        <input 
          id="zoom-slider"
          type="range" min="1" max="5" step="0.1" 
          value={zoom} 
          title="Zoom"
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="zoom-knob-input"
        />
        <span className="text-[#10b981]/60 font-mono text-[9px] mt-2">{zoom.toFixed(1)}x</span>
      </div>
    </div>
  );
};
