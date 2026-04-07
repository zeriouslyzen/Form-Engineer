import React, { useEffect, useRef, useState, useCallback } from 'react';
import { JKDLogic } from '../lib/JKDLogic';
import { AudioCoach } from '../lib/AudioService';
import { VoiceAI } from '../lib/VoiceAI';
import { Biomechanics3D } from './Biomechanics3D';
import type { VisualizationMode } from './Biomechanics3D';
import { tracking } from '../lib/TrackingEngine';

/**
 * JKD DOJO — PHYSICAL THERAPY EDITION (V5.0)
 * Hand gesture controls:
 *   ☝️  ONE   → SKELETON mode
 *   ✌️  TWO   → NERVOUS mode
 *   🤟  THREE → JOINTS mode
 *   👌  PINCH → Zoom in
 *   👎  THUMBS_DOWN → Zoom out (reset)
 */

// How long (ms) a gesture must be held before it fires (mode switches only)
const GESTURE_HOLD_MS = 700;

// Kinetic pinch zoom sensitivity (normalized X units → zoom delta)
// 0.3 hand travel = ~2x zoom change at this sensitivity
const PINCH_SENSITIVITY = 7.0;
const ZOOM_MAX = 5.0;

// Bilateral detection window (ms)
const BILATERAL_WINDOW_MS = 600;

export const HolisticTracker: React.FC = () => {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasEngRef  = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);
  const isProcessingRef = useRef(false);

  const [logic]  = useState(() => new JKDLogic());
  const [coach]  = useState(() => new AudioCoach());
  const [voice]  = useState(() => new VoiceAI((cmd) => handleVoiceCommand(cmd)));

  const [active, setActive]               = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const [devices, setDevices]             = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isAiThinking, setIsAiThinking]   = useState(false);
  const [stats, setStats]                 = useState({ punches: 0, telegraphs: 0 });

  // ── Mode state (owned here, driven by gestures + button) ──────────────────
  const [vizMode, setVizMode] = useState<VisualizationMode>('SKELETON');
  const vizModeRef = useRef<VisualizationMode>('SKELETON');
  const syncMode = (m: VisualizationMode) => { vizModeRef.current = m; setVizMode(m); };

  // ── Gesture debounce (mode switches only) ───────────────────────────────
  const gestureRef      = useRef<string | null>(null);
  const gestureStart    = useRef<number>(0);
  const gestureFired    = useRef(false);
  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [zoomLocked, setZoomLocked]       = useState(false);
  const zoomLockedRef   = useRef(false);

  // ── Kinetic pinch-zoom state ──────────────────────────────────────────────
  const isPinching      = useRef(false);
  const pinchRefX       = useRef(0);      // wrist.x when pinch started
  const pinchBaseZoom   = useRef(1.0);    // zoom level when pinch started
  const [pinchDelta, setPinchDelta] = useState(0); // for HUD indicator (-1..1)

  // ── Kinetic Menu state ────────────────────────────────────────────────────
  const [activeMenu, setActiveMenu] = useState<'ONE' | 'TWO' | null>(null);
  const activeMenuRef = useRef<'ONE' | 'TWO' | null>(null);
  const menuStartX    = useRef<number>(0);
  const menuBaseIdx   = useRef<number>(0);
  const menuIndexRef  = useRef<number>(0);
  const [menuIndex, setMenuIndex] = useState<number>(0);

  // ── Stealth Mode Background ───────────────────────────────────────────────
  const [stealthMode, setStealthMode] = useState<boolean>(false);
  const stealthModeRef = useRef<boolean>(false);
  const syncStealth = (m: boolean) => { stealthModeRef.current = m; setStealthMode(m); };

  // ── Bilateral zoom lock ───────────────────────────────────────────────────
  const leftThumbUpAt   = useRef<number>(0);
  const rightThumbUpAt  = useRef<number>(0);
  const bothFired       = useRef(false);

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

  // ─── GESTURE PROCESSING ──────────────────────────────────────────────────
  const processGesture = useCallback((leftHand: any[] | null, rightHand: any[] | null) => {
    const now = Date.now();
    const leftGesture  = leftHand  ? logic.detectHandGesture(leftHand)  : null;
    const rightGesture = rightHand ? logic.detectHandGesture(rightHand) : null;

    // ── BILATERAL: both thumbs up → zoom lock toggle ──────────────────────
    if (leftGesture  === 'THUMBS_UP') leftThumbUpAt.current  = now;
    if (rightGesture === 'THUMBS_UP') rightThumbUpAt.current = now;
    const bothUp = (now - leftThumbUpAt.current  < BILATERAL_WINDOW_MS) &&
                   (now - rightThumbUpAt.current < BILATERAL_WINDOW_MS);
    if (bothUp && !bothFired.current) {
      bothFired.current = true;
      const next = !zoomLockedRef.current;
      zoomLockedRef.current = next;
      setZoomLocked(next);
      coach.speak('PUNCH_END');
      setActiveGesture('BOTH_THUMBS_UP');
      isPinching.current = false; // cancel any active pinch
      return;
    }
    if (!bothUp) bothFired.current = false;

    // Use dominant hand (right preferred, fall back to left)
    const gesture = rightGesture || leftGesture;
    const hand    = rightHand   || leftHand;

    // ── KINETIC PINCH ZOOM (continuous, no hold timer) ──────────────────
    if (!zoomLockedRef.current) {
      if (gesture === 'OK_SIGN' && hand) {
        const wrist = hand[0]; // wrist landmark (most stable depth anchor)
        if (!isPinching.current) {
          // First frame of pinch — record reference X and base zoom
          isPinching.current  = true;
          pinchRefX.current   = wrist.x;
          pinchBaseZoom.current = zoomRef.current;
          setPinchDelta(0);
        } else {
          // Subsequent frames: deltaX drives zoom
          // With mirroring, moving hand to user's right decreases screen X.
          // rawDelta positive = hand moved to user's right -> zoom in
          const rawDelta = pinchRefX.current - wrist.x; 
          const newZoom  = Math.max(1.0, Math.min(ZOOM_MAX, pinchBaseZoom.current + rawDelta * PINCH_SENSITIVITY));
          handleZoomChange(newZoom);
          setPinchDelta(rawDelta / 0.25); // normalize to -1..1 for HUD (0.25 = full travel)
        }
        setActiveGesture('PINCH_ZOOM');
        // Handle mode hold timer reset during pinch
        gestureRef.current = null;
        return;
      } else if (isPinching.current) {
        // Pinch released — commit current zoom, reset ref for next pinch
        isPinching.current = false;
        pinchBaseZoom.current = zoomRef.current;
        setPinchDelta(0);
      }
    }

    // ── KINETIC DIAL MENUS (ONE = Mode, TWO = Background) ─────────────────
    if (gesture === 'ONE' || gesture === 'TWO') {
      if (hand) {
        const wrist = hand[0];
        if (activeMenuRef.current !== gesture) {
          activeMenuRef.current = gesture;
          setActiveMenu(gesture);
          menuStartX.current = wrist.x;
          // init index
          const base = gesture === 'ONE' 
            ? ['SKELETON', 'NERVOUS', 'JOINTS'].indexOf(vizModeRef.current)
            : (stealthModeRef.current ? 1 : 0);
          menuBaseIdx.current = base >= 0 ? base : 0;
          menuIndexRef.current = menuBaseIdx.current;
          setMenuIndex(menuBaseIdx.current);
          coach.speak('PUNCH_END'); // small confirm blip on open
        } else {
          // Scrubbing
          // Positive rawDelta means hand moved from right to left natively (which is physically moving left on unmirrored raw landmarks)
          // We want moving physical right to scrub right.
          // By default, wrist.x decreases as the hand translates left on screen. 
          const rawDelta = menuStartX.current - wrist.x; 
          const stepDelta = Math.round(rawDelta / 0.15); // normalized travel slot
          const maxIdx = gesture === 'ONE' ? 2 : 1;
          const newIdx = Math.max(0, Math.min(maxIdx, menuBaseIdx.current + stepDelta));
          if (menuIndexRef.current !== newIdx) {
            menuIndexRef.current = newIdx;
            setMenuIndex(newIdx);
          }
        }
        setActiveGesture(gesture);
        gestureRef.current = null; // suppress legacy hold timers
        return;
      }
    } else if (activeMenuRef.current !== null) {
      // Finger dropped → apply selection
      if (activeMenuRef.current === 'ONE') {
         const modes: VisualizationMode[] = ['SKELETON', 'NERVOUS', 'JOINTS'];
         syncMode(modes[menuIndexRef.current]);
      } else if (activeMenuRef.current === 'TWO') {
         syncStealth(menuIndexRef.current === 1);
      }
      activeMenuRef.current = null;
      setActiveMenu(null);
    }

    // ── MODE SWITCHES (hold timer gestures fallback for discrete actions) ─
    setActiveGesture(gesture);
    if (gesture !== gestureRef.current) {
      gestureRef.current   = gesture;
      gestureStart.current = now;
      gestureFired.current = false;
      return;
    }
    if (!gesture || gestureFired.current) return;
    if (now - gestureStart.current < GESTURE_HOLD_MS) return;
    gestureFired.current = true;

    // Remaining discrete gesture hold actions can live here
    if (gesture === 'THREE') syncMode('JOINTS'); // legacy fallback
  }, [logic, coach, handleZoomChange]);

  // ─── MOUSE / DRAG ────────────────────────────────────────────────────────
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

        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          refineFaceLandmarks: false,
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

          const left  = results.leftHandLandmarks  || null;
          const right = results.rightHandLandmarks || null;

          // Run gesture detection every frame
          processGesture(left, right);

          const smoothed = tracking.smooth(results);
          renderFrame(results);

          setAllLandmarks(prev => {
            const w = results.image.width, h = results.image.height;
            const sizeChanged = prev.imageSize.width !== w || prev.imageSize.height !== h;
            return {
              pose:      smoothed.poseLandmarks  || null,
              face:      results.faceLandmarks   || null,
              leftHand:  left,
              rightHand: right,
              imageSize: sizeChanged ? { width: w, height: h } : prev.imageSize,
            };
          });
        });

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
    if (!stealthModeRef.current) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      // STEALTH MODE: purely black void rendering
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    if (results.poseLandmarks) {
      const analysis = logic.analyze(results.poseLandmarks);
      if (analysis.event === 'PUNCH_END')  setStats(prev => ({ ...prev, punches: prev.punches + 1 }));
      if (analysis.event === 'TELEGRAPH') {
        setStats(prev => ({ ...prev, telegraphs: prev.telegraphs + 1 }));
        coach.speak('TELEGRAPH');
      }
    }
  };

  // ─── GESTURE HUD LABEL ───────────────────────────────────────────────────
  const gestureLabel: Record<string, string> = {
    ONE:           '☝️  1 — SKELETON',
    TWO:           '✌️  2 — NERVOUS',
    THREE:         '🤟  3 — JOINTS',
    PINCH_ZOOM:    '👌  KINETIC ZOOM — MOVE HAND ↔️',
    BOTH_THUMBS_UP:'👍👍  ZOOM LOCK',
    FIVE:          '🖐️  FIVE',
    FIST:          '✊  FIST',
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
            <p className="text-[#10b981]/50 font-mono text-xs tracking-widest">PHYSICAL THERAPY EDITION · V5.0</p>
          </div>

          <div className="font-mono text-[10px] text-[#10b981]/40 tracking-widest text-center leading-7">
            <div>☝️  HOLD 1 + MOVE ←/→ → TRACKING MODE DIAL</div>
            <div>✌️  HOLD 2 + MOVE ←/→ → ENVIRONMENT DIAL</div>
            <div>👌  OK SIGN + MOVE ←/→ → KINETIC ZOOM</div>
            <div>👍👍  BOTH THUMBS UP → ZOOM LOCK</div>
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

      {/* AI PULSE */}
      <div className={`ai-pulse ${isAiThinking ? 'thinking' : ''}`} onMouseDown={e => e.stopPropagation()}>
        <div className="pulse-ring" />
        <div className="pulse-core" />
      </div>

      {/* GESTURE HUD — shows detected gesture + hold progress */}
      {activeGesture && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="font-mono text-[11px] tracking-widest text-[#10b981] bg-black/70 border border-[#10b981]/30 px-5 py-2 backdrop-blur-sm">
            {gestureLabel[activeGesture] ?? activeGesture}
            {!gestureFired.current && (
              <span className="text-[#10b981]/40 ml-2">— hold to confirm</span>
            )}
          </div>
        </div>
      )}

      {/* KINETIC MENU OVERLAY */}
      {activeMenu && (
        <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-[#050505]/95 border border-[#10b981]/40 rounded-xl p-8 shadow-[0_0_60px_rgba(16,185,129,0.15)] backdrop-blur-xl flex flex-col items-center">
            <div className="text-[#10b981]/60 text-xs font-mono tracking-[0.4em] uppercase mb-8">
              {activeMenu === 'ONE' ? 'Set Tracking Mode' : 'Environment View'}
            </div>
            <div className="flex gap-4">
              {(activeMenu === 'ONE' ? ['SKELETON', 'NERVOUS', 'JOINTS'] : ['CAMERA', 'BLACKOUT']).map((opt, idx) => (
                <div key={opt} className={`px-8 py-4 border font-mono tracking-widest whitespace-nowrap transition-all duration-300 ${
                  idx === menuIndex 
                    ? 'border-[#10b981] bg-[#10b981]/10 text-[#10b981] scale-110 shadow-[0_0_30px_rgba(16,185,129,0.3)]' 
                    : 'border-transparent text-white/30 scale-90 opacity-40'
                }`}>
                  {opt}
                </div>
              ))}
            </div>
            <div className="text-[#10b981]/70 font-mono text-[10px] tracking-[0.3em] mt-10 flex gap-4 items-center">
              <span className="text-xl animate-pulse">←</span> SCRUB LEFT/RIGHT TO SELECT <span className="text-xl animate-pulse">→</span>
            </div>
          </div>
        </div>
      )}

      {/* STATS HUD */}
      <div className="fixed top-6 right-6 z-50 font-mono text-right pointer-events-none">
        <div className="text-[#10b981] text-xs tracking-widest opacity-60">STRIKES</div>
        <div className="text-[#10b981] text-3xl font-bold">{stats.punches}</div>
        {stats.telegraphs > 0 && (
          <div className="text-[#ef4444] text-xs tracking-widest mt-1">⚠ {stats.telegraphs} TELEGRAPH{stats.telegraphs > 1 ? 'S' : ''}</div>
        )}
        <div className="text-[#10b981]/40 text-[10px] tracking-widest mt-2">{zoom.toFixed(1)}x ZOOM</div>
        {zoomLocked && (
          <div className="text-[#fbbf24] text-[10px] tracking-widest mt-1">🔒 ZOOM LOCKED</div>
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
          mode={vizMode}
          onModeChange={syncMode}
        />
      </div>
    </div>
  );
};
