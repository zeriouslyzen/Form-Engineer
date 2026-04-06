import React, { useEffect, useRef, useState } from 'react';
import { JKDLogic } from '../lib/JKDLogic';
import { AudioCoach } from '../lib/AudioService';
import { VoiceAI } from '../lib/VoiceAI';
import { Biomechanics3D } from './Biomechanics3D';
import { tracking } from '../lib/TrackingEngine';

/**
 * JKD DOJO: SINGLE-SCREEN MASTER EDITION
 * Optimized for mobile/iPhone-to-Mac Continuity.
 */

export const HolisticTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasEngRef = useRef<HTMLCanvasElement>(null);
  
  const [logic] = useState(() => new JKDLogic());
  const [coach] = useState(() => new AudioCoach());

  const [active, setActive] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  // AI State
  const [voice] = useState(() => new VoiceAI((cmd) => handleVoiceCommand(cmd)));
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [stats, setStats] = useState({ punches: 0, telegraphs: 0 });
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
  const [cropInfo, setCropInfo] = useState({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  const [videoViewport, setVideoViewport] = useState({ width: 0, height: 0, top: 0, left: 0 });

  // Focus & Pan States
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [skeletonScale] = useState(1.0); 

  const gesturesEnabledRef = useRef(true); 
  const zoomRef = useRef(1.0);
  const panRef = useRef({ x: 0, y: 0 });
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  // Sync state to refs for use in the rendering loop (stale-closure fix)
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { gesturesEnabledRef.current = true; }, []);

  // VIEWPORT SYNC MATH: Find the exact visible rectangle of the 'contained' video
  useEffect(() => {
    const updateViewport = () => {
      if (!canvasEngRef.current) return;
      const canvas = canvasEngRef.current;
      const parent = canvas.parentElement;
      if (!parent) return;

      const pW = parent.clientWidth;
      const pH = parent.clientHeight;
      const cW = canvas.width;
      const cH = canvas.height;
      if (cW === 0 || cH === 0) return;

      const vAspect = cW / cH;
      const pAspect = pW / pH;

      let rW, rH, rT, rL;
      // TIKTOK/FACETIME MODE: object-fit: cover math
      if (pAspect > vAspect) { 
        // Screen is wider relative to video. Constrain width, let height overflow.
        rW = pW;
        rH = rW / vAspect;
        rT = (pH - rH) / 2;
        rL = 0;
      } else { 
        // Screen is taller relative to video. Constrain height, let width overflow.
        rH = pH;
        rW = rH * vAspect;
        rT = 0;
        rL = (pW - rW) / 2;
      }
      
      setVideoViewport(prev => {
          if (Math.abs(prev.width - rW) < 1 && Math.abs(prev.height - rH) < 1 && Math.abs(prev.top - rT) < 1 && Math.abs(prev.left - rL) < 1) {
            return prev;
          }
          return { width: rW, height: rH, top: rT, left: rL };
      });
    };

    updateViewport();
    // Add a re-run for mobile devices where clientWidth might be zero temporarily
    const t = setTimeout(updateViewport, 100);
    const t2 = setTimeout(updateViewport, 1000);

    window.addEventListener('resize', updateViewport);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      window.removeEventListener('resize', updateViewport);
    };
  }, [allLandmarks.imageSize.width, allLandmarks.imageSize.height]);

  const applyHardwareZoom = async (value: number) => {
    const track = videoTrackRef.current;
    if (!track) return;
    try {
      const capabilities = track.getCapabilities() as any;
      if (capabilities.zoom) {
        const min = capabilities.zoom.min || 1;
        const max = capabilities.zoom.max || 10;
        const hardwareZoom = min + (value - 1) * (max - min) / 4; 
        await track.applyConstraints({ advanced: [{ zoom: hardwareZoom }] as any });
      }
    } catch (e) {
      console.warn("JKD: Hardware zoom not supported or failed", e);
    }
  };

  const handleZoomChange = (value: number) => {
    setZoom(value);
    applyHardwareZoom(value);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startPos.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };

  const handleMouseUp = () => { isDragging.current = false; };
  const handleDoubleClick = () => { panRef.current = { x: 0, y: 0 }; setPan({ x: 0, y: 0 }); handleZoomChange(1.0); };
  const handleWheel = (e: React.WheelEvent) => {
    const next = Math.max(1.0, Math.min(10, zoom - e.deltaY * 0.002));
    handleZoomChange(next);
  };

  const handleVoiceCommand = async (command: string) => {
    setIsAiThinking(true);
    const response = await voice.chat(command, stats);
    setIsAiThinking(false);
    coach.feedback(response);
  };

  useEffect(() => {
    const getDevices = async () => {
      try {
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
    navigator.mediaDevices.ondevicechange = getDevices;
  }, []);

  useEffect(() => {
    if (!active) return;
    
    let holistic: any;
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    const init = async () => {
      try {
        const HolisticClass = (window as any).Holistic;
        if (!HolisticClass) {
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

        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId 
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 720 }, height: { ideal: 1280 } }
            : { width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          console.log("JKD: Optical stream active.");
        }
        
        applyHardwareZoom(zoomRef.current);

        holistic.onResults((results: any) => {
          if (!results.image) return;
          if (!streamStarted) setStreamStarted(true);

          // APPLY MEDICAL SMOOTHING (Kalman Filter)
          const smoothedResults = tracking.smooth(results);
          
          if (results.image) {
            renderSingleScreen(results);
          }
          
          setAllLandmarks(prev => {
            const w = results.image.width;
            const h = results.image.height;
            const sizeChanged = prev.imageSize.width !== w || prev.imageSize.height !== h;
            
            return {
              pose: smoothedResults.poseLandmarks || null,
              face: results.faceLandmarks || null,
              leftHand: results.leftHandLandmarks || null,
              rightHand: results.rightHandLandmarks || null,
              imageSize: sizeChanged ? { width: w, height: h } : prev.imageSize
            };
          });
        });

        const processFrame = async () => {
           if (videoRef.current && holistic && !videoRef.current.paused) {
              await holistic.send({ image: videoRef.current });
           }
           animationFrameId = requestAnimationFrame(processFrame);
        };
        processFrame();

      } catch (err: any) {
        console.error("JKD CRITICAL ERROR:", err);
      }
    };

    init();
    voice.start();

    return () => {
      voice.stop();
      cancelAnimationFrame(animationFrameId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (holistic) holistic.close();
    };
  }, [active]);

  const renderSingleScreen = (results: any) => {
    if (!canvasEngRef.current) return;
    const canvas = canvasEngRef.current;
    
    // DYNAMIC RESOLUTION: Sync canvas pixels with optical source
    if (canvas.width !== results.image.width || canvas.height !== results.image.height) {
      canvas.width = results.image.width;
      canvas.height = results.image.height;
    }

    const engCtx = canvas.getContext('2d');
    if (engCtx) drawToCanvas(engCtx, canvas, results);
  };

  const drawToCanvas = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, results: any) => {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const w = results.image.width;
    const h = results.image.height;
    if (w === 0 || h === 0) return;

    // FULL-FRAME CROP: Adapt to camera aspect and zoom without forced 3.5x magnification
    const zoomVal = zoomRef.current;
    const panVal = panRef.current;

    const canvAspect = canvas.width / canvas.height;
    const imgAspect = w / h;

    let sw, sh;
    if (canvAspect > imgAspect) {
        // Source is taller than target relatively (Portrait camera?)
        sw = w / zoomVal;
        sh = sw / canvAspect;
    } else {
        // Source is wider than target (Standard FaceTime mode on 16:9 camera)
        sh = h / zoomVal;
        sw = sh * canvAspect;
    }

    const cx = w / 2 + (panVal.x * (w / 1000));
    const cy = h / 2 + (panVal.y * (h / 2000));

    const sx = Math.max(0, Math.min(w - sw, cx - sw / 2));
    const sy = Math.max(0, Math.min(h - sh, cy - sh / 2));

    // STABLE STATE UPDATE: Prevent infinite recursion loop
    setCropInfo(prev => {
      if (Math.abs(prev.sx - sx) < 1 && Math.abs(prev.sy - sy) < 1 && Math.abs(prev.sw - sw) < 1 && Math.abs(prev.sh - sh) < 1) {
        return prev;
      }
      return { sx, sy, sw, sh };
    });

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    
    if (results.poseLandmarks) {
      const analysis = logic.analyze(results.poseLandmarks);
      if (analysis.event === 'PUNCH_END') setStats(prev => ({ ...prev, punches: prev.punches + 1 }));
      if (analysis.event === 'TELEGRAPH') {
        setStats(prev => ({ ...prev, telegraphs: prev.telegraphs + 1 }));
        coach.speak('TELEGRAPH');
      }
    }
    ctx.restore();
  };

  if (!active) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex flex-col items-center justify-center z-[9999] overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_#10b981_0%,_transparent_70%)] blur-[120px]" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-16">
          <h1 className="text-[#10b981] font-mono text-lg tracking-[1em] uppercase">JKD Form Engineer</h1>
          <button onClick={() => setActive(true)} className="px-20 py-8 border-2 border-[#10b981] text-[#10b981] font-mono text-2xl tracking-[0.5em] uppercase hover:bg-[#10b981]/10">
            Enter Dojo
          </button>
          <select 
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="bg-black text-[#10b981] border border-[#10b981]/30 px-8 py-3 font-mono text-[12px]"
            title="Camera Selection"
            aria-label="Select camera input"
          >
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `CAM_0${devices.indexOf(device) + 1}`}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="dojo-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
    >
      <video ref={videoRef} className="hidden" muted playsInline autoPlay />
      
      <div className={`ai-pulse ${isAiThinking ? 'thinking' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="pulse-ring"></div>
        <div className="pulse-core"></div>
        {/* Legacy controls removed for Medical Precision V3.0 */}
      </div>

      <div className="iphone-pillar full-screen">
        <canvas ref={canvasEngRef} className="w-full h-full" />
        <Biomechanics3D 
          pose={allLandmarks.pose} 
          face={allLandmarks.face} 
          leftHand={allLandmarks.leftHand} 
          rightHand={allLandmarks.rightHand} 
          skeletonScale={skeletonScale} 
          videoSize={allLandmarks.imageSize} 
          cropInfo={cropInfo}
          videoViewport={videoViewport}
        />
      </div>
    </div>
  );
};
