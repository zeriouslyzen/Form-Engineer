import React, { useEffect, useRef, useState, useCallback } from 'react';
import { JKDLogic } from '../lib/JKDLogic';
import { AudioCoach } from '../lib/AudioService';
import { VoiceAI } from '../lib/VoiceAI';
import { Biomechanics3D } from './Biomechanics3D';
import { tracking } from '../lib/TrackingEngine';

/**
 * JKD DOJO — PHYSICAL THERAPY EDITION (V4.0)
 * Speed & quality optimized for clinical biomechanical analysis.
 */

export const HolisticTracker: React.FC = () => {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasEngRef  = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);
  const isProcessingRef = useRef(false); // Prevent frame back-pressure

  const [logic]  = useState(() => new JKDLogic());
  const [coach]  = useState(() => new AudioCoach());
  const [voice]  = useState(() => new VoiceAI((cmd) => handleVoiceCommand(cmd)));

  const [active, setActive]               = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const [devices, setDevices]             = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isAiThinking, setIsAiThinking]   = useState(false);
  const [stats, setStats]                 = useState({ punches: 0, telegraphs: 0 });

  const [allLandmarks, setAllLandmarks] = useState<{
    pose: any[] | null;
    face: any[] | null;
    leftHand: any[] | null;
    rightHand: any[] | null;
    imageSize: { width: number; height: number };
  }>({
    pose: null, face: null, leftHand: null, rightHand: null,
    imageSize: { width: 1280, height: 720 },
  });

  const [cropInfo, setCropInfo]           = useState({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  const [videoViewport, setVideoViewport] = useState({ width: 0, height: 0, top: 0, left: 0 });
  const [pan, setPan]     = useState({ x: 0, y: 0 });
  const [zoom, setZoom]   = useState(1.0);
  const [skeletonScale]   = useState(1.0);

  const zoomRef  = useRef(1.0);
  const panRef   = useRef({ x: 0, y: 0 });
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current  = pan;  }, [pan]);

  const videoTrackRef  = useRef<MediaStreamTrack | null>(null);
  const isDragging     = useRef(false);
  const startPos       = useRef({ x: 0, y: 0 });

  // ─── VIEWPORT SYNC ───────────────────────────────────────────────────────
  useEffect(() => {
    const updateViewport = () => {
      if (!canvasEngRef.current) return;
      const canvas = canvasEngRef.current;
      const parent = canvas.parentElement;
      if (!parent) return;
      const pW = parent.clientWidth, pH = parent.clientHeight;
      const cW = canvas.width, cH = canvas.height;
      if (!cW || !cH) return;
      const vA = cW / cH, pA = pW / pH;
      let rW, rH, rT, rL;
      if (pA > vA) { rH = pH; rW = rH * vA; rT = 0;          rL = (pW - rW) / 2; }
      else         { rW = pW; rH = rW / vA; rT = (pH-rH)/2;  rL = 0; }
      setVideoViewport(prev => {
        if (Math.abs(prev.width-rW)<1 && Math.abs(prev.height-rH)<1 && Math.abs(prev.top-rT)<1 && Math.abs(prev.left-rL)<1) return prev;
        return { width: rW, height: rH, top: rT, left: rL };
      });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [allLandmarks.imageSize.width, allLandmarks.imageSize.height]);

  // ─── HARDWARE ZOOM ───────────────────────────────────────────────────────
  const applyHardwareZoom = useCallback(async (value: number) => {
    const track = videoTrackRef.current;
    if (!track) return;
    try {
      const cap = track.getCapabilities() as any;
      if (cap.zoom) {
        const { min = 1, max = 10 } = cap.zoom;
        await track.applyConstraints({ advanced: [{ zoom: min + (value-1)*(max-min)/4 }] as any });
      }
    } catch { /* Hardware zoom not supported */ }
  }, []);

  const handleZoomChange = useCallback((v: number) => { setZoom(v); applyHardwareZoom(v); }, [applyHardwareZoom]);

  // ─── GESTURE / DRAG ──────────────────────────────────────────────────────
  const handleMouseDown  = (e: React.MouseEvent) => { isDragging.current = true; startPos.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const handleMouseMove  = (e: React.MouseEvent) => { if (!isDragging.current) return; setPan({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y }); };
  const handleMouseUp    = () => { isDragging.current = false; };
  const handleDoubleClick= () => { panRef.current = { x: 0, y: 0 }; setPan({ x: 0, y: 0 }); handleZoomChange(1.0); };
  const handleWheel      = (e: React.WheelEvent) => { handleZoomChange(Math.max(1.0, Math.min(10, zoom - e.deltaY * 0.002))); };

  // ─── VOICE ───────────────────────────────────────────────────────────────
  const handleVoiceCommand = async (command: string) => {
    setIsAiThinking(true);
    const response = await voice.chat(command, stats);
    setIsAiThinking(false);
    coach.feedback(response);
  };

  // ─── DEVICE ENUMERATION ──────────────────────────────────────────────────
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const devs = await navigator.mediaDevices.enumerateDevices();
        const vids = devs.filter(d => d.kind === 'videoinput');
        setDevices(vids);
        if (vids.length > 0) setSelectedDeviceId(vids[0].deviceId);
      } catch (err) { console.error('Device error:', err); }
    };
    getDevices();
    navigator.mediaDevices.ondevicechange = getDevices;
  }, []);

  // ─── MAIN TRACKING LOOP ──────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    let holistic: any;
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        const HolisticClass = (window as any).Holistic;
        if (!HolisticClass) { setTimeout(init, 500); return; }

        holistic = new HolisticClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
        });

        // PERFORMANCE: complexity 1 = ~2x faster than 2, still clinically accurate
        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,  // not needed for PT
          refineFaceLandmarks: false, // face iris tracking disabled — saves 30% CPU
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
        });

        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        const track = stream.getVideoTracks()[0];
        videoTrackRef.current = track;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        applyHardwareZoom(zoomRef.current);

        holistic.onResults((results: any) => {
          isProcessingRef.current = false;
          if (!results.image) return;
          if (!streamStarted) setStreamStarted(true);

          const smoothed = tracking.smooth(results);
          renderFrame(results);

          setAllLandmarks(prev => {
            const w = results.image.width, h = results.image.height;
            const sizeChanged = prev.imageSize.width !== w || prev.imageSize.height !== h;
            return {
              pose:      smoothed.poseLandmarks  || null,
              face:      results.faceLandmarks   || null,
              leftHand:  results.leftHandLandmarks  || null,
              rightHand: results.rightHandLandmarks || null,
              imageSize: sizeChanged ? { width: w, height: h } : prev.imageSize,
            };
          });
        });

        // PERFORMANCE: Only send a new frame when the previous one is done
        const processFrame = () => {
          if (videoRef.current && holistic && !videoRef.current.paused && !isProcessingRef.current) {
            isProcessingRef.current = true;
            holistic.send({ image: videoRef.current });
          }
          rafRef.current = requestAnimationFrame(processFrame);
        };
        processFrame();

      } catch (err: any) {
        console.error('JKD INIT ERROR:', err);
      }
    };

    init();
    voice.start();

    return () => {
      voice.stop();
      cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (holistic) holistic.close();
    };
  }, [active]);

  // ─── CANVAS RENDER ───────────────────────────────────────────────────────
  const renderFrame = (results: any) => {
    const canvas = canvasEngRef.current;
    if (!canvas || !results.image) return;

    if (canvas.width !== results.image.width || canvas.height !== results.image.height) {
      canvas.width  = results.image.width;
      canvas.height = results.image.height;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    const w = canvas.width, h = canvas.height;
    const zv = zoomRef.current, pv = panRef.current;
    const sw = w / zv, sh = h / zv;
    const cx = w / 2 + pv.x * (w / 1000);
    const cy = h / 2 + pv.y * (h / 2000);
    const sx = Math.max(0, Math.min(w - sw, cx - sw / 2));
    const sy = Math.max(0, Math.min(h - sh, cy - sh / 2));

    setCropInfo(prev => {
      if (Math.abs(prev.sx-sx)<1 && Math.abs(prev.sy-sy)<1 && Math.abs(prev.sw-sw)<1 && Math.abs(prev.sh-sh)<1) return prev;
      return { sx, sy, sw, sh };
    });

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();

    // PT logic: analyze pose for events
    if (results.poseLandmarks) {
      const analysis = logic.analyze(results.poseLandmarks);
      if (analysis.event === 'PUNCH_END')  setStats(prev => ({ ...prev, punches: prev.punches + 1 }));
      if (analysis.event === 'TELEGRAPH') {
        setStats(prev => ({ ...prev, telegraphs: prev.telegraphs + 1 }));
        coach.speak('TELEGRAPH');
      }
    }
  };

  // ─── SPLASH SCREEN ───────────────────────────────────────────────────────
  if (!active) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex flex-col items-center justify-center z-[9999] overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_#10b981_0%,_transparent_70%)] blur-[120px]" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-12">
          <div className="text-center">
            <h1 className="text-[#10b981] font-mono text-lg tracking-[1em] uppercase mb-2">JKD Form Engineer</h1>
            <p className="text-[#10b981]/50 font-mono text-xs tracking-widest">PHYSICAL THERAPY EDITION · V4.0</p>
          </div>

          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="bg-black text-[#10b981] border border-[#10b981]/30 px-8 py-3 font-mono text-[12px]"
            aria-label="Select camera input"
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `CAM_0${i + 1}`}</option>
            ))}
          </select>

          <button
            onClick={() => setActive(true)}
            className="px-20 py-8 border-2 border-[#10b981] text-[#10b981] font-mono text-2xl tracking-[0.5em] uppercase hover:bg-[#10b981]/10 transition-colors"
          >
            Enter Dojo
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN UI ─────────────────────────────────────────────────────────────
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

      {/* AI PULSE INDICATOR */}
      <div className={`ai-pulse ${isAiThinking ? 'thinking' : ''}`} onMouseDown={e => e.stopPropagation()}>
        <div className="pulse-ring" />
        <div className="pulse-core" />
      </div>

      {/* STATS HUD */}
      <div className="fixed top-6 right-6 z-50 font-mono text-right pointer-events-none">
        <div className="text-[#10b981] text-xs tracking-widest opacity-60">STRIKES</div>
        <div className="text-[#10b981] text-3xl font-bold">{stats.punches}</div>
        {stats.telegraphs > 0 && (
          <div className="text-[#ef4444] text-xs tracking-widest mt-1">⚠ {stats.telegraphs} TELEGRAPH{stats.telegraphs > 1 ? 'S' : ''}</div>
        )}
      </div>

      {/* ZOOM SLIDER */}
      <div className="zoom-knob-container" onMouseDown={e => e.stopPropagation()}>
        <label>ZOOM</label>
        <input
          type="range"
          min={1} max={5} step={0.1}
          value={zoom}
          onChange={e => handleZoomChange(parseFloat(e.target.value))}
          className="zoom-knob-input"
          aria-label="Zoom level"
        />
        <span className="text-[#10b981] font-mono text-[10px] mt-2">{zoom.toFixed(1)}x</span>
      </div>

      {/* MAIN VIEW */}
      <div className="iphone-pillar full-screen">
        <canvas ref={canvasEngRef} className="w-full h-full" style={{ objectFit: 'contain' }} />
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
