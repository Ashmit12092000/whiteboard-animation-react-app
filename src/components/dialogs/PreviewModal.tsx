// @ts-nocheck
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
import { useMobile } from '../../hooks/useMobile';
import { getEntryEffectStyle } from '../canvas/ContextMenu';
import { exportAnimationAsMP4, renderFrameToDataURI } from '../../utils/videoExport';
import CameraLayer from '../../camera/CameraLayer';
import { useCameraPlayback } from '../../camera/cameraHooks';
import { cameraEngine } from '../../camera/cameraEngine';
import { worldToScreen } from '../../camera/cameraUtils';

// ─── Audio filter helper (mirrored from AudioTab) ─────────────────────────────
function buildFilterChain(ctx, filterId) {
  const nodes = [];
  switch (filterId) {
    case 'warm': {
      const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 200; lo.gain.value = 5;
      const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 6000; hi.gain.value = -4;
      nodes.push(lo, hi); break;
    }
    case 'bright': {
      const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 4000; hi.gain.value = 8;
      nodes.push(hi); break;
    }
    case 'telephone': {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 3000;
      nodes.push(hp, lp); break;
    }
    case 'deep': {
      const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 80; lo.gain.value = 12;
      nodes.push(lo); break;
    }
    case 'echo': {
      const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.3;
      const fb = ctx.createGain(); fb.gain.value = 0.45;
      delay.connect(fb); fb.connect(delay);
      nodes.push(delay); break;
    }
    case 'whisper': {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.5;
      nodes.push(lp); break;
    }
    case 'vintage': {
      const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf';  lo.frequency.value = 100;  lo.gain.value = 4;
      const mi = ctx.createBiquadFilter(); mi.type = 'peaking';   mi.frequency.value = 1000; mi.gain.value = -2; mi.Q.value = 0.8;
      const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 8000; hi.gain.value = -6;
      nodes.push(lo, mi, hi); break;
    }
    case 'reverb': {
      const d1 = ctx.createDelay(0.5); d1.delayTime.value = 0.04;
      const d2 = ctx.createDelay(0.5); d2.delayTime.value = 0.07;
      const g1 = ctx.createGain(); g1.gain.value = 0.3;
      const g2 = ctx.createGain(); g2.gain.value = 0.2;
      d1.connect(g1); d2.connect(g2);
      nodes.push(d1, d2, g1, g2); break;
    }
    case 'robot': {
      const osc = ctx.createOscillator(); osc.frequency.value = 50;
      const ring = ctx.createGain(); osc.connect(ring.gain); osc.start();
      nodes.push(ring); break;
    }
    default: break;
  }
  return nodes;
}

async function playAudioTrack(audioCtx, track) {
  if (track.type === 'tts' || !track.src) return null;
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
      for (let i = 0; i < filterNodes.length - 1; i++) filterNodes[i].connect(filterNodes[i + 1]);
      lastNode = filterNodes[filterNodes.length - 1];
    }
    lastNode.connect(audioCtx.destination);

    // Fade in / out
    const now = audioCtx.currentTime;
    if (track.fadeIn > 0) {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(track.volume ?? 1, now + track.fadeIn);
    }
    if (track.fadeOut > 0) {
      const fadeStart = now + trimDur - track.fadeOut;
      gainNode.gain.setValueAtTime(track.volume ?? 1, Math.max(now, fadeStart));
      gainNode.gain.linearRampToValueAtTime(0, now + trimDur);
    }

    const src = audioCtx.createBufferSource();
    src.buffer = decoded;
    src.loop   = track.loop ?? false;
    src.connect(gainNode);
    src.start(0, offsetS, track.loop ? undefined : trimDur);
    return src;
  } catch (err) {
    console.warn('Audio playback error:', err);
    return null;
  }
}

// Speed multiplier → duration divisor
// e.g. speed=2 means durations are halved (twice as fast)
const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
const SPEED_LABELS = ['0.25×', '0.5×', '0.75×', '1×', '1.5×', '2×', '3×'];
const DEFAULT_SPEED_IDX = 3; // 1×

function buildSequentialTimeline(graphics, speed = 1) {
  let cursor = 0; // cumulative actual (scaled) elapsed time
  return graphics.map(g => {
    // graphic.duration already reflects hand_speed (kept in sync by the
    // Hand Speed slider in GraphicListItem), so just apply global speed here.
    // Delay is a real-time pause and is NOT affected by playback speed.
    const delay     = g.delay ?? 0;
    const scaledDur = g.duration / speed;
    const seqDelay  = cursor + delay;
    cursor += delay + scaledDur;
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

export default function PreviewModal() {
  const isMobile = useMobile();
  const project           = useStore(s => s.project);
  const closePreviewModal = useStore(s => s.closePreviewModal);

  const [playing,   setPlaying]   = useState(false);
  const [sceneIdx,  setSceneIdx]  = useState(0);
  const [canvasKey, setCanvasKey] = useState(0);
  const [speedIdx,  setSpeedIdx]  = useState(DEFAULT_SPEED_IDX);
  const [audioMuted, setAudioMuted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const speed = SPEED_STEPS[speedIdx];

  const tipRef       = useRef({ active: false });
  const canvasRef    = useRef(null);
  const outerRef     = useRef(null);
  const activeIdRef  = useRef(null);
  const timerRef     = useRef(null);
  const playStartRef = useRef(null);

  // Camera integration
  const getCameraKeyframes = useStore(s => s.getCameraKeyframes);
  const scenes     = project?.scenes ?? [];
  const scene      = scenes[sceneIdx];
  const sceneId    = scene?.id;
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

  // Audio refs
  const audioCtxRef    = useRef(null);
  const audioSourcesRef = useRef([]);

  const stopAllAudio = useCallback(() => {
    audioSourcesRef.current.forEach(src => {
      try { src.stop(); } catch {}
    });
    audioSourcesRef.current = [];
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    window.speechSynthesis.cancel();
  }, []);

  const startAudioTracks = useCallback(async (tracks) => {
    if (!tracks || tracks.length === 0 || audioMuted) return;
    stopAllAudio();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const sources = await Promise.all(tracks.map(t => playAudioTrack(ctx, t)));
    audioSourcesRef.current = sources.filter(Boolean);

    // Speak TTS tracks
    tracks.filter(t => t.type === 'tts' && t.speech?.text).forEach(t => {
      const { text, lang, pitch, rate } = t.speech;
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = lang; utt.pitch = pitch; utt.rate = rate;
      utt.volume = t.volume ?? 1;
      const voices = window.speechSynthesis.getVoices();
      const match  = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
      if (match) utt.voice = match;
      window.speechSynthesis.speak(utt);
    });
  }, [audioMuted, stopAllAudio]);

  const boardStyle = getBoardStyle(project?.boardType ?? 'whiteboard');
  const timeline   = scene ? buildSequentialTimeline(scene.graphics, speed) : [];
  const transitionStyle = playing && scene ? getTransitionStyle(scene.transition, scene.transitionDuration || 0.5) : {};

  const reset = () => {
    clearTimeout(timerRef.current);
    stopAllAudio();
    setPlaying(false);
    setSceneIdx(0);
    setCanvasKey(k => k + 1);
    tipRef.current       = { active: false };
    activeIdRef.current  = null;
    playStartRef.current = null;
    tipHandlersRef.current = {};
  };

  const play = () => {
    clearTimeout(timerRef.current);
    stopAllAudio();
    tipRef.current      = { active: false };
    activeIdRef.current = null;
    setSceneIdx(0);
    setCanvasKey(k => k + 1);
    setPlaying(false);
    setTimeout(() => {
      playStartRef.current = performance.now();
      setPlaying(true);
      // Start audio tracks
      const tracks = project?.audioTracks ?? [];
      if (tracks.length > 0) startAudioTracks(tracks);
      scheduleNextScene(0);
    }, 50);
  };

  const scheduleNextScene = (idx) => {
    if (idx >= scenes.length) { setPlaying(false); return; }
    const currentScene = scenes[idx];
    const dur = getSequentialDuration(currentScene.graphics, speed);
    const transitionDur = (currentScene.transition && currentScene.transition !== 'none') 
      ? (currentScene.transitionDuration || 0.5) 
      : 0;
    const totalDur = dur + transitionDur;
    
    timerRef.current = setTimeout(() => {
      if (idx + 1 < scenes.length) {
        // Reset camera to identity before the new scene starts playing
        cameraEngine.set({ x: 0, y: 0, zoom: 1, rotation: 0 });
        playStartRef.current = performance.now();
        setSceneIdx(idx + 1);
        setCanvasKey(k => k + 1);
        scheduleNextScene(idx + 1);
      } else {
        setPlaying(false);
      }
    }, (totalDur + 0.5) * 1000);
  };

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    stopAllAudio();
  }, [stopAllAudio]);

  useEffect(() => {
    if (!playing) {
      tipRef.current      = { active: false };
      activeIdRef.current = null;
    }
  }, [playing]);

  // Stable per-graphic tip handlers stored in a ref map — never recreated
  const tipHandlersRef = useRef({});
  const makeTipHandler = useCallback((graphicId) => {
    if (!tipHandlersRef.current[graphicId]) {
      tipHandlersRef.current[graphicId] = (info) => {
        if (info.active) {
          activeIdRef.current = graphicId;
          tipRef.current = info;
        } else if (activeIdRef.current === graphicId) {
          activeIdRef.current = null;
          tipRef.current = { active: false };
        }
      };
    }
    return tipHandlersRef.current[graphicId];
  }, []);

  const handleSpeedChange = (e) => {
    setSpeedIdx(Number(e.target.value));
    // No restart needed — AnimatedTextReveal reads duration/delay via live
    // refs, so the running rAF loop picks up the new speed on the next frame.
  };

  const handleExportMP4 = useCallback(async () => {
    if (!canvasRef.current || exporting) return;

    setExporting(true);
    setExportProgress(0);

    try {
      const fps = 24;
      const frameDuration = 1000 / fps; // milliseconds per frame
      const frames = [];
      
      // Get total animation duration
      const scenes = project?.scenes ?? [];
      let totalDuration = 0;
      scenes.forEach(scene => {
        totalDuration += getSequentialDuration(scene.graphics, 1);
      });

      // Calculate number of frames needed
      const totalFrames = Math.ceil((totalDuration * 1000) / frameDuration);

      console.log('Capturing animation frames...', { totalDuration, totalFrames, fps });

      // Reset animation state
      reset();
      setPlaying(false);
      setSceneIdx(0);
      setCanvasKey(k => k + 1);

      // Wait for scene to render
      await new Promise(resolve => setTimeout(resolve, 100));

      // Start playback and capture frames
      await new Promise(resolve => {
        let capturedFrames = 0;
        let lastCaptureTime = 0;
        let playbackStartTime = null;

        const captureFrame = async () => {
          const currentTime = performance.now() - (playbackStartTime || performance.now());
          
          // Capture frame if enough time has passed
          if (currentTime - lastCaptureTime >= frameDuration * 0.9) {
            const frameData = await renderFrameToDataURI(canvasRef.current, 1024, 768);
            if (frameData) {
              frames.push({
                frameData,
                duration: frameDuration / 1000,
                index: capturedFrames,
              });
              capturedFrames++;
              lastCaptureTime = currentTime;
              setExportProgress(Math.min(Math.round((capturedFrames / totalFrames) * 100), 100));
            }

            if (capturedFrames >= totalFrames || currentTime > totalDuration * 1000 + 1000) {
              resolve();
              return;
            }
          }

          requestAnimationFrame(captureFrame);
        };

        // Start animation playback
        playStartRef.current = performance.now();
        playbackStartTime = performance.now();
        setPlaying(true);
        
        // Start audio if exists
        const tracks = project?.audioTracks ?? [];
        if (tracks.length > 0) startAudioTracks(tracks);
        
        scheduleNextScene(0);
        
        // Start frame capture loop
        requestAnimationFrame(captureFrame);
      });

      // Stop animation
      stopAllAudio();
      setPlaying(false);

      console.log('Frames captured, sending to backend...', { count: frames.length });

      if (frames.length === 0) {
        throw new Error('No frames captured for export');
      }

      // Export to MP4
      await exportAnimationAsMP4(frames, {
        fps,
        width: 1024,
        height: 768,
        title: project?.title || 'OpenDoodler Animation',
      });

      useStore.getState().showToast('Animation exported to MP4 ✓', 'success');
      setExportProgress(0);
    } catch (err) {
      console.error('Export error:', err);
      useStore.getState().showToast(`Export failed: ${err.message}`, 'error');
    } finally {
      setExporting(false);
      setExportProgress(0);
      stopAllAudio();
      setPlaying(false);
    }
  }, [project, exporting, startAudioTracks, stopAllAudio]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && closePreviewModal()}
    >
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: 12, padding: isMobile ? 12 : 24,
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        animation: 'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        width: '100%', maxWidth: 848, boxSizing: 'border-box',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: isMobile ? 15 : 20, color: '#f1f5f9', margin: 0 }}>
            Preview — {project?.title}
          </h2>
          <button
            onClick={closePreviewModal}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Canvas — scale-to-fit available width at all screen sizes */}
        {(() => {
          const pad   = isMobile ? 12 : 24;
          const avail = Math.min(window.innerWidth - 40, 848) - pad * 2;
          const scale = Math.min(avail / 800, 1);
          return (
        <div ref={outerRef} style={{ width: '100%', height: Math.round(450 * scale), borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <div
          key={canvasKey}
          ref={canvasRef}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: 800, height: 450,
            ...boardStyle,
            borderRadius: 8, overflow: 'hidden',
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
                position: 'absolute', left: g.x, top: g.y, width: g.width, height: g.height,
                transform: g.rotation ? `rotate(${g.rotation}deg)` : undefined,
                transformOrigin: 'center center',
                ...(playing ? getEntryEffectStyle(g.entryEffect, Math.min((g.scaledDur || g.duration) * 0.6, 1.0)) : {}),
              }}
            >
              {g.type === 'drawing' && isPaintFill ? (
                playing ? (
                  <AnimatedFillReveal
                    key={`${g.id}-paint`}
                    svg={g.svgText}
                    style={{ width: '100%', height: '100%' }}
                    playing={playing}
                    duration={g.scaledDur}
                    delay={g.seqDelay}
                    boardBackground={boardStyle.background ?? '#ffffff'}
                    onTipMove={makeTipHandler(g.id)}
                  />
                ) : (
                  <SvgRenderer svg={g.svgText} style={{ width: '100%', height: '100%' }} />
                )
              ) : g.type === 'drawing' ? (
                playing ? (
                  <AnimatedSvgRenderer
                    key={`${g.id}-play`}
                    svg={g.svgText}
                    style={{ width: '100%', height: '100%' }}
                    playing={playing}
                    duration={g.scaledDur}
                    delay={g.seqDelay}
                    onTipMove={makeTipHandler(g.id)}
                  />
                ) : (
                  <SvgRenderer svg={g.svgText} style={{ width: '100%', height: '100%' }} />
                )
              ) : g.type === 'image' ? (
                playing ? (
                  <AnimatedImageReveal
                    key={`${g.id}-play`}
                    src={g.src}
                    playing={playing}
                    duration={g.scaledDur}
                    delay={g.seqDelay}
                    revealEffect={g.revealEffect}
                    onTipMove={makeTipHandler(g.id)}
                  />
                ) : (
                  <img
                    src={g.src}
                    alt={g.name}
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  />
                )
              ) : playing ? (
                <AnimatedTextReveal
                  key={`${g.id}-play`}
                  graphic={{ ...g, boardType: project?.boardType }}
                  playing={playing}
                  duration={g.scaledDur}
                  delay={g.seqDelay}
                  onTipMove={makeTipHandler(g.id)}
                  playStartTime={playStartRef.current}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center',
                  // Use the same effective font as the animation engine so static matches animated
                  fontFamily: getEffectiveFontFamily(g.fontFamily), fontWeight: g.fontWeight,
                  fontStyle: g.fontStyle, fontSize: g.fontSize,
                  lineHeight: 1.2,
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
          )})}

        </CameraLayer>

          {/* Hand is a sibling of CameraLayer — positioned in the 800×450 canvas space,
              NOT inside the camera transform. The tip coords from animators are already
              viewport-absolute; subtracting canvasRef.getBoundingClientRect() gives
              the correct canvas-relative position. */}
          {playing && <WhiteboardHand tipRef={tipRef} canvasRef={canvasRef} handId={project?.handId} handConfig={project?.handConfig} customHands={project?.customHands} />}
        </div>
        </div>
          );
        })()}

        {/* Controls */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>

          <button
            onClick={play}
            disabled={playing}
            style={{
              padding: '9px 28px', fontWeight: 700, fontSize: 14,
              background: playing ? '#1e293b' : '#10b981',
              border: 'none', borderRadius: 8,
              color: playing ? '#64748b' : '#fff',
              cursor: playing ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}
          >
            {playing ? '⏳ Playing…' : '▶ Play Animation'}
          </button>

          <button
            onClick={reset}
            style={{
              padding: '9px 20px', fontWeight: 600, fontSize: 13,
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 8, color: '#94a3b8', cursor: 'pointer',
            }}
          >↺ Reset</button>

          <button
            onClick={handleExportMP4}
            disabled={exporting}
            style={{
              padding: '9px 24px', fontWeight: 600, fontSize: 13,
              background: exporting ? '#334155' : 'rgba(59, 130, 246, 0.2)',
              border: '1px solid #3b82f6',
              borderRadius: 8, color: exporting ? '#64748b' : '#3b82f6',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
            title="Export animation as MP4"
          >
            {exporting 
              ? `📹 Exporting… ${exportProgress}%`
              : '📹 Export MP4'
            }
          </button>

          {/* Speed slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>🐢</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <input
                type="range"
                min={0}
                max={SPEED_STEPS.length - 1}
                step={1}
                value={speedIdx}
                onChange={handleSpeedChange}
                style={{
                  width: 120,
                  accentColor: '#10b981',
                  cursor: 'pointer',
                }}
              />
              <span style={{
                color: '#10b981', fontSize: 11, fontWeight: 700,
                fontFamily: 'monospace', letterSpacing: '0.05em',
              }}>
                {SPEED_LABELS[speedIdx]}
              </span>
            </div>
            <span style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>🐇</span>
          </div>

          {/* Audio mute + track count */}
          {(project?.audioTracks ?? []).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => {
                  const next = !audioMuted;
                  setAudioMuted(next);
                  if (playing) {
                    if (next) stopAllAudio();
                    else startAudioTracks(project?.audioTracks ?? []);
                  }
                }}
                style={{
                  padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                  background: audioMuted ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                  border: `1px solid ${audioMuted ? '#ef4444' : '#10b981'}`,
                  color: audioMuted ? '#ef4444' : '#10b981',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                title={audioMuted ? 'Unmute audio' : 'Mute audio'}
              >
                {audioMuted ? '🔇 Muted' : `🔊 ${(project?.audioTracks ?? []).length} Track${(project?.audioTracks ?? []).length > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          <span style={{ color: '#64748b', fontSize: 12 }}>
            Scene {sceneIdx + 1} / {scenes.length}
          </span>
        </div>
      </div>
    </div>
  );
}