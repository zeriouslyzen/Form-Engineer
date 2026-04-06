import React, { useEffect, useRef, useState } from 'react';
import { JKDLogic } from '../lib/JKDLogic';
import { AudioCoach } from '../lib/AudioService';
import { VoiceAI } from '../lib/VoiceAI';
import { Biomechanics3D } from './Biomechanics3D';

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

  // Focus & Pan States
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
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

  const handleVoiceCommand = async (command: string) => {
    setIsAiThinking(true);
    const response = await voice.chat(command, stats);
    setIsAiThinking(false);
    coach.feedback(response);
  };

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
          setAllLandmarks({
            pose: results.poseLandmarks || null,
            face: results.faceLandmarks || null,
            leftHand: results.leftHandLandmarks || null,
            rightHand: results.rightHandLandmarks || null,
            imageSize: { width: results.image.width, height: results.image.height }
          });
          renderDualScreens(results);
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

    voice.start();

    // Proactive Feedback Loop
    const proactiveInterval = setInterval(async () => {
      if (stats.punches > 0 || stats.telegraphs > 0) {
        setIsAiThinking(true);
        const response = await voice.chat("Give me a one-sentence tip based on my current stats.", stats);
        setIsAiThinking(false);
        coach.feedback(response);
      }
    }, 45000); // Every 45 seconds

    return () => {
      console.log("JKD: CLEANING UP...");
      voice.stop();
      clearInterval(proactiveInterval);
      cancelAnimationFrame(animationFrameId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (holistic) holistic.close();
    };
  }, [active]);

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
          if (analysis.event === 'PUNCH_END') setStats(prev => ({ ...prev, punches: prev.punches + 1 }));
          if (analysis.event === 'TELEGRAPH') {
            setStats(prev => ({ ...prev, telegraphs: prev.telegraphs + 1 }));
            coach.speak('TELEGRAPH');
          }
        }
      }
      ctx.restore();
    });
  };

  if (!active) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex flex-col items-center justify-center z-[9999] overflow-hidden">
        {/* Background Visuals */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_#10b981_0%,_transparent_70%)] blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-[#10b981]/20 rounded-full animate-pulse" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-16">
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-[#10b981] font-mono text-lg tracking-[1em] uppercase ml-[1em]">JKD Form Engineer</h1>
            <p className="text-white/40 font-mono text-[10px] uppercase tracking-widest">Sovereign Motion Analysis System</p>
          </div>

          <button 
            onClick={() => setActive(true)}
            className="group relative px-20 py-8 bg-transparent border-2 border-[#10b981] overflow-hidden transition-all hover:bg-[#10b981]/10"
          >
            <div className="absolute inset-0 bg-[#10b981]/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <span className="relative z-10 text-[#10b981] font-mono text-2xl tracking-[0.5em] uppercase group-hover:scale-110 block transition-transform">Enter Dojo</span>
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-[#10b981]" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#10b981]" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[#10b981]" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#10b981]" />
          </button>
          
          <div className="flex flex-col items-center gap-6">
            <label className="text-[#10b981]/40 font-mono text-[9px] uppercase tracking-widest">Optical Source Select</label>
            <select 
              title="Optical Source"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-black/80 text-[#10b981] border border-[#10b981]/30 px-8 py-3 rounded-none font-mono text-[12px] outline-none focus:border-[#10b981] transition-all hover:bg-[#10b981]/5 appearance-none text-center min-w-[280px]"
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
      
      {/* AI PULSE */}
      <div className={`ai-pulse ${isAiThinking ? 'thinking' : ''}`}>
        <div className="pulse-core"></div>
        <span className="ai-label">{isAiThinking ? 'THINKING' : 'LISTENING'}</span>
      </div>
      
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
