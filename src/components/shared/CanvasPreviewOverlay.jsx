import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import SvgRenderer from '../shared/SvgRenderer';
import AnimatedSvgRenderer from '../shared/AnimatedSvgRenderer';
import AnimatedTextReveal from '../shared/AnimatedTextReveal';
import AnimatedImageReveal from '../shared/AnimatedImageReveal';
import AnimatedFillReveal from '../shared/AnimatedFillReveal';
import WhiteboardHand from '../shared/WhiteboardHand';
import { getBoardStyle, getTransitionStyle } from '../../utils/animation';
import { getEffectiveFontFamily } from '../../services/fontService';
import { getEntryEffectStyle } from '../canvas/ContextMenu';
import CameraLayer from '../../camera/CameraLayer';
import { useCameraPlayback } from '../../camera/cameraHooks';
import { cameraEngine } from '../../camera/cameraEngine';
import { worldToScreen } from '../../camera/cameraUtils';

// ─── Audio helpers (mirrored from PreviewModal) ───────────────────────────────
function buildFilterChain(ctx, filterId) {
  const nodes = [];
  switch (filterId) {
    case 'warm': { const lo = ctx.createBiquadFilter(); lo.type='lowshelf'; lo.frequency.value=200; lo.gain.value=5; const hi=ctx.createBiquadFilter(); hi.type='highshelf'; hi.frequency.value=6000; hi.gain.value=-4; nodes.push(lo,hi); break; }
    case 'bright': { const hi=ctx.createBiquadFilter(); hi.type='highshelf'; hi.frequency.value=4000; hi.gain.value=8; nodes.push(hi); break; }
    case 'telephone': { const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=300; const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=3000; nodes.push(hp,lp); break; }
    case 'deep': { const lo=ctx.createBiquadFilter(); lo.type='lowshelf'; lo.frequency.value=80; lo.gain.value=12; nodes.push(lo); break; }
    case 'echo': { const delay=ctx.createDelay(1.0); delay.delayTime.value=0.3; const fb=ctx.createGain(); fb.gain.value=0.45; delay.connect(fb); fb.connect(delay); nodes.push(delay); break; }
    case 'whisper': { const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1500; lp.Q.value=0.5; nodes.push(lp); break; }
    case 'reverb': { const d1=ctx.createDelay(0.5); d1.delayTime.value=0.04; const d2=ctx.createDelay(0.5); d2.delayTime.value=0.07; const g1=ctx.createGain(); g1.gain.value=0.3; const g2=ctx.createGain(); g2.gain.value=0.2; d1.connect(g1); d2.connect(g2); nodes.push(d1,d2,g1,g2); break; }
    default: break;
  }
  return nodes;
}

async function playAudioTrack(audioCtx, track) {
  try {
    const resp    = await fetch(track.src);
    const arrBuf  = await resp.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arrBuf);
    const dur     = decoded.duration;
    const offsetS = track.trimStart * dur;
    const trimDur = (track.trimEnd - track.trimStart) * dur;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = track.volume ?? 1;
    const filterNodes = buildFilterChain(audioCtx, track.filter || 'none');
    let lastNode = gainNode;
    if (filterNodes.length) {
      gainNode.connect(filterNodes[0]);
      for (let i = 0; i < filterNodes.length - 1; i++) filterNodes[i].connect(filterNodes[i+1]);
      lastNode = filterNodes[filterNodes.length - 1];
    }
    lastNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (track.fadeIn > 0) { gainNode.gain.setValueAtTime(0, now); gainNode.gain.linearRampToValueAtTime(track.volume ?? 1, now + track.fadeIn); }
    if (track.fadeOut > 0) { const fs = now + trimDur - track.fadeOut; gainNode.gain.setValueAtTime(track.volume ?? 1, Math.max(now, fs)); gainNode.gain.linearRampToValueAtTime(0, now + trimDur); }
    const src = audioCtx.createBufferSource();
    src.buffer = decoded;
    src.loop   = track.loop ?? false;
    src.connect(gainNode);
    src.start(0, offsetS, track.loop ? undefined : trimDur);
    return src;
  } catch (err) { console.warn('Audio playback error:', err); return null; }
}

function buildSequentialTimeline(graphics, speed = 1) {
  let cursor = 0; // cumulative actual (scaled) elapsed time
  return graphics.map(g => {
    const seqDelay  = cursor;
    // graphic.duration already reflects hand_speed (kept in sync by the
    // Hand Speed slider in GraphicListItem), so just apply global speed here.
    const scaledDur = g.duration / speed;
    cursor += scaledDur;
    return { ...g, seqDelay, scaledDur };
  });
}

function getSequentialDuration(graphics, speed = 1) {
  // The scene must stay on screen until the slowest-drawing item
  // (after hand_speed scaling) actually finishes, not just until
  // the raw (unscaled) durations add up.
  const timeline = buildSequentialTimeline(graphics, speed);
  return timeline.reduce((max, g) => Math.max(max, g.seqDelay + g.scaledDur), 0);
}

// ─── Main overlay ─────────────────────────────────────────────────────────────
export default function CanvasPreviewOverlay() {
  const project           = useStore(s => s.project);
  const closeCanvasPreview = useStore(s => s.closeCanvasPreview);
  const getCameraKeyframes = useStore(s => s.getCameraKeyframes);

  const scenes = project?.scenes ?? [];

  const [playing,   setPlaying]   = useState(false);
  const [sceneIdx,  setSceneIdx]  = useState(0);
  const [canvasKey, setCanvasKey] = useState(0);
  const [visible,   setVisible]   = useState(false); // for fade-in

  const tipRef       = useRef({ active: false });
  const canvasRef    = useRef(null);
  const activeIdRef  = useRef(null);
  const timerRef     = useRef(null);
  const playStartRef = useRef(null);
  const tipHandlersRef = useRef({});

  const scene           = scenes[sceneIdx];
  const sceneId         = scene?.id;
  const cameraKeyframes = getCameraKeyframes(sceneId);
  useCameraPlayback(playing, cameraKeyframes, playStartRef);

  // Re-project hand tip when camera moves
  useEffect(() => {
    const unsub = cameraEngine.subscribe(() => {
      const tip = tipRef.current;
      if (!tip?.active || tip.worldX === undefined) return;
      const screen = worldToScreen(tip.worldX, tip.worldY, cameraEngine.state);
      tipRef.current = { ...tip, screenX: screen.x, screenY: screen.y };
    });
    return unsub;
  }, []);

  // Audio
  const audioCtxRef     = useRef(null);
  const audioSourcesRef = useRef([]);

  const stopAllAudio = useCallback(() => {
    audioSourcesRef.current.forEach(src => { try { src.stop(); } catch {} });
    audioSourcesRef.current = [];
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
  }, []);

  const startAudioTracks = useCallback(async (tracks) => {
    if (!tracks || tracks.length === 0) return;
    stopAllAudio();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const sources = await Promise.all(tracks.map(t => playAudioTrack(ctx, t)));
    audioSourcesRef.current = sources.filter(Boolean);
  }, [stopAllAudio]);

  const boardStyle      = getBoardStyle(project?.boardType ?? 'whiteboard');
  const timeline        = scene ? buildSequentialTimeline(scene.graphics, 1) : [];
  const transitionStyle = playing && scene ? getTransitionStyle(scene.transition, scene.transitionDuration || 0.5) : {};

  // Stable per-graphic tip handlers
  const makeTipHandler = useCallback((graphicId) => {
    if (!tipHandlersRef.current[graphicId]) {
      tipHandlersRef.current[graphicId] = (info) => {
        if (info.active) { activeIdRef.current = graphicId; tipRef.current = info; }
        else if (activeIdRef.current === graphicId) { activeIdRef.current = null; tipRef.current = { active: false }; }
      };
    }
    return tipHandlersRef.current[graphicId];
  }, []);

  const scheduleNextScene = useCallback((idx) => {
    if (idx >= scenes.length) { setPlaying(false); return; }
    const currentScene = scenes[idx];
    const dur = getSequentialDuration(currentScene.graphics, 1);
    const transitionDur = (currentScene.transition && currentScene.transition !== 'none')
      ? (currentScene.transitionDuration || 0.5) : 0;
    timerRef.current = setTimeout(() => {
      if (idx + 1 < scenes.length) {
        cameraEngine.set({ x: 0, y: 0, zoom: 1, rotation: 0 });
        playStartRef.current = performance.now();
        setSceneIdx(idx + 1);
        setCanvasKey(k => k + 1);
        scheduleNextScene(idx + 1);
      } else {
        setPlaying(false);
      }
    }, (dur + transitionDur + 0.5) * 1000);
  }, [scenes]);

  // Auto-play on mount
  useEffect(() => {
    // Fade in
    requestAnimationFrame(() => setVisible(true));

    // Start playback after brief delay for mount
    const t = setTimeout(() => {
      setSceneIdx(0);
      setCanvasKey(k => k + 1);
      setTimeout(() => {
        playStartRef.current = performance.now();
        setPlaying(true);
        const tracks = project?.audioTracks ?? [];
        if (tracks.length > 0) startAudioTracks(tracks);
        scheduleNextScene(0);
      }, 60);
    }, 80);

    return () => {
      clearTimeout(t);
      clearTimeout(timerRef.current);
      stopAllAudio();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) { tipRef.current = { active: false }; activeIdRef.current = null; }
  }, [playing]);

  const handleClose = useCallback(() => {
    clearTimeout(timerRef.current);
    stopAllAudio();
    setPlaying(false);
    cameraEngine.set({ x: 0, y: 0, zoom: 1, rotation: 0 });
    closeCanvasPreview();
  }, [stopAllAudio, closeCanvasPreview]);

  const handleReplay = useCallback(() => {
    clearTimeout(timerRef.current);
    stopAllAudio();
    setPlaying(false);
    setSceneIdx(0);
    tipRef.current = { active: false };
    activeIdRef.current = null;
    tipHandlersRef.current = {};
    setCanvasKey(k => k + 1);
    setTimeout(() => {
      playStartRef.current = performance.now();
      setPlaying(true);
      const tracks = project?.audioTracks ?? [];
      if (tracks.length > 0) startAudioTracks(tracks);
      scheduleNextScene(0);
    }, 60);
  }, [stopAllAudio, startAudioTracks, scheduleNextScene, project]);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Scale to match canvas: 800×450 native, scaled to fit
  const NATIVE_W = 800;
  const NATIVE_H = 450;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5, 10, 20, 0.82)',
        backdropFilter: 'blur(6px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.22s ease',
        padding: 20,
        boxSizing: 'border-box',
      }}
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      <style>{`
        @keyframes overlaySlideUp {
          from { opacity: 0; transform: scale(0.96) translateY(16px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          background: '#0a0f1a',
          borderRadius: 12,
          boxShadow: '0 32px 96px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
          overflow: 'hidden',
          animation: 'overlaySlideUp 0.24s cubic-bezier(0.34,1.56,0.64,1)',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px 8px 16px',
          background: '#070b14',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          gap: 12,
        }}>
          {/* Left: status + scene counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Pulsing dot */}
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: playing ? '#10b981' : '#475569',
              boxShadow: playing ? '0 0 8px #10b981' : 'none',
              flexShrink: 0,
              transition: 'all 0.2s',
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.2 }}>
              {playing ? 'Playing' : 'Done'}
            </span>
            <span style={{ fontSize: 10, color: '#334155', letterSpacing: 0.5 }}>
              Scene {sceneIdx + 1} / {scenes.length}
            </span>
          </div>

          {/* Right: replay + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={handleReplay}
              title="Replay from start"
              style={{
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.25)',
                borderRadius: 6,
                color: '#10b981',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                padding: '4px 10px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.1)'; }}
            >
              ↺ Replay
            </button>

            <button
              onClick={handleClose}
              title="Close preview (Esc)"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: '#64748b',
                fontSize: 16,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Canvas ─────────────────────────────────────────────────────── */}
        {(() => {
          const maxW   = Math.min(window.innerWidth  - 40, 900);
          const maxH   = Math.min(window.innerHeight - 120, 560);
          const scaleX = maxW / NATIVE_W;
          const scaleY = maxH / NATIVE_H;
          const scale  = Math.min(scaleX, scaleY, 1);
          const dispW  = Math.round(NATIVE_W * scale);
          const dispH  = Math.round(NATIVE_H * scale);

          return (
            <div style={{ width: dispW, height: dispH, overflow: 'hidden', position: 'relative' }}>
              <div
                key={canvasKey}
                ref={canvasRef}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: NATIVE_W, height: NATIVE_H,
                  ...boardStyle,
                  transformOrigin: 'top left',
                  transform: `scale(${scale})`,
                  ...transitionStyle,
                }}
              >
                <CameraLayer>
                  {timeline.map(g => {
                    const isPaintFill = !!g.paintFill;
                    return (
                      <div
                        key={g.id}
                        style={{
                          position: 'absolute', left: g.x, top: g.y,
                          width: g.width, height: g.height,
                          transform: g.rotation ? `rotate(${g.rotation}deg)` : undefined,
                          transformOrigin: 'center center',
                          ...(playing ? getEntryEffectStyle(g.entryEffect, Math.min((g.scaledDur || g.duration) * 0.6, 1.0)) : {}),
                        }}
                      >
                        {g.type === 'drawing' && isPaintFill ? (
                          playing ? (
                            <AnimatedFillReveal
                              key={`${g.id}-paint`} svg={g.svgText}
                              style={{ width: '100%', height: '100%' }}
                              playing={playing} duration={g.scaledDur} delay={g.seqDelay}
                              boardBackground={boardStyle.background ?? '#ffffff'}
                              onTipMove={makeTipHandler(g.id)}
                            />
                          ) : <SvgRenderer svg={g.svgText} style={{ width: '100%', height: '100%' }} />
                        ) : g.type === 'drawing' ? (
                          playing ? (
                            <AnimatedSvgRenderer
                              key={`${g.id}-play`} svg={g.svgText}
                              style={{ width: '100%', height: '100%' }}
                              playing={playing} duration={g.scaledDur} delay={g.seqDelay}
                              onTipMove={makeTipHandler(g.id)}
                            />
                          ) : <SvgRenderer svg={g.svgText} style={{ width: '100%', height: '100%' }} />
                        ) : g.type === 'image' ? (
                          playing ? (
                            <AnimatedImageReveal
                              key={`${g.id}-play`} src={g.src}
                              playing={playing} duration={g.scaledDur} delay={g.seqDelay}
                              revealEffect={g.revealEffect} onTipMove={makeTipHandler(g.id)}
                            />
                          ) : (
                            <img src={g.src} alt={g.name} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                          )
                        ) : playing ? (
                          <AnimatedTextReveal
                            key={`${g.id}-play`}
                            graphic={{ ...g, boardType: project?.boardType }}
                            playing={playing} duration={g.scaledDur} delay={g.seqDelay}
                            onTipMove={makeTipHandler(g.id)}
                            playStartTime={playStartRef.current}
                          />
                        ) : (
                          <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', alignItems: 'center',
                            fontFamily: getEffectiveFontFamily(g.fontFamily),
                            fontWeight: g.fontWeight, fontStyle: g.fontStyle,
                            fontSize: g.fontSize, lineHeight: 1.2,
                            color: (g.color && g.color !== '')
                              ? g.color
                              : (project?.boardType === 'blackboard' || project?.boardType === 'greenboard'
                                  ? '#f1f5f9' : '#1a1a1a'),
                            overflow: 'hidden', whiteSpace: 'pre-wrap',
                          }}>
                            {g.rawText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CameraLayer>

                {playing && (
                  <WhiteboardHand
                    tipRef={tipRef} canvasRef={canvasRef}
                    handId={project?.handId} handConfig={project?.handConfig}
                    customHands={project?.customHands}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Progress bar ───────────────────────────────────────────────── */}
        <div style={{ height: 3, background: '#0a0f1a', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            background: playing ? '#10b981' : '#334155',
            width: `${((sceneIdx) / Math.max(scenes.length, 1)) * 100}%`,
            transition: 'width 0.4s ease, background 0.3s',
          }} />
        </div>
      </div>
    </div>
  );
}