/**
 * VoiceRecorderModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal voice recorder with real-time waveform, audio cleaning, and effects.
 * Adapted from VoiceRecorder.tsx — uses plain JSX and the whiteboard store.
 *
 * Opens when user clicks the 🎙 button in the timeline audio row.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';

// ─── Filter definitions ───────────────────────────────────────────────────────

const AUDIO_CLEANING_OPTIONS = [
  { key: 'noise_reduction', label: 'Noise Reduction',  desc: 'Remove background hiss & hum' },
  { key: 'normalize',       label: 'Normalize',        desc: 'Balance overall volume' },
  { key: 'silence_trim',    label: 'Trim Silence',     desc: 'Remove silent start/end gaps' },
];

const AUDIO_FILTER_OPTIONS = [
  { key: 'reverb',      label: 'Reverb',      desc: 'Add room ambience' },
  { key: 'echo',        label: 'Echo',        desc: 'Subtle delay effect' },
  { key: 'pitch_up',    label: 'Pitch Up',    desc: 'Raise pitch slightly' },
  { key: 'pitch_down',  label: 'Pitch Down',  desc: 'Lower pitch slightly' },
  { key: 'telephone',   label: 'Telephone',   desc: 'Lo-fi telephone effect' },
  { key: 'deep',        label: 'Deep Voice',  desc: 'Low & resonant tone' },
];

// ─── Web Audio filter engine ──────────────────────────────────────────────────

async function applyAudioFilters(sourceBlob, cleaningKeys, filterKeys, existingCtx) {
  const arrayBuffer = await sourceBlob.arrayBuffer();
  const ownedCtx    = !existingCtx;
  const decodeCtx   = existingCtx ?? new AudioContext();
  if (decodeCtx.state === 'suspended') await decodeCtx.resume();

  let audioBuffer;
  try {
    audioBuffer = await Promise.race([
      decodeCtx.decodeAudioData(arrayBuffer.slice(0)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('decode timeout')), 10000)),
    ]);
  } catch (e) {
    console.error('[VoiceFilter] decode failed:', e);
    if (ownedCtx) decodeCtx.close();
    return sourceBlob;
  }

  const sr = audioBuffer.sampleRate;
  const ch = audioBuffer.numberOfChannels;
  const samples = audioBuffer.length;

  let startSample = 0;
  let endSample   = samples - 1;

  if (cleaningKeys.includes('silence_trim')) {
    const threshold = 0.01;
    const data = audioBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) { startSample = Math.max(0, Math.round(i - sr * 0.05)); break; }
    }
    for (let i = data.length - 1; i >= 0; i--) {
      if (Math.abs(data[i]) > threshold) { endSample = Math.min(data.length - 1, Math.round(i + sr * 0.05)); break; }
    }
  }
  const trimmedLength = Math.max(Math.round(sr * 0.1), endSample - startSample + 1);
  const trimmed = decodeCtx.createBuffer(ch, trimmedLength, sr);
  for (let c = 0; c < ch; c++) {
    trimmed.copyToChannel(audioBuffer.getChannelData(c).slice(startSample, startSample + trimmedLength), c);
  }

  let normalizeGain = 1;
  if (cleaningKeys.includes('normalize')) {
    let peak = 0;
    for (let c = 0; c < ch; c++) {
      const data = trimmed.getChannelData(c);
      for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
    }
    if (peak > 0 && peak < 0.95) normalizeGain = 0.95 / peak;
  }

  const hasPitchUp   = filterKeys.includes('pitch_up');
  const hasPitchDown = filterKeys.includes('pitch_down');
  let workingBuffer = trimmed;

  if (hasPitchUp || hasPitchDown) {
    const ratio         = hasPitchUp ? Math.pow(2, 3 / 12) : Math.pow(2, -3 / 12);
    const pitchedLength = Math.max(Math.round(sr * 0.1), Math.round(trimmedLength / ratio));
    const pitchCtx      = new OfflineAudioContext(ch, pitchedLength, sr);
    const pitchSrc      = pitchCtx.createBufferSource();
    pitchSrc.buffer             = trimmed;
    pitchSrc.playbackRate.value = ratio;
    pitchSrc.connect(pitchCtx.destination);
    pitchSrc.start(0);
    try { workingBuffer = await pitchCtx.startRendering(); } catch (e) {
      console.error('[VoiceFilter] pitch render failed:', e);
      if (ownedCtx) decodeCtx.close();
      return sourceBlob;
    }
  }

  if (ownedCtx) decodeCtx.close();

  const offline    = new OfflineAudioContext(ch, workingBuffer.length, sr);
  const sourceNode = offline.createBufferSource();
  sourceNode.buffer = workingBuffer;
  let lastNode = sourceNode;

  if (normalizeGain !== 1) {
    const g = offline.createGain(); g.gain.value = normalizeGain;
    lastNode.connect(g); lastNode = g;
  }
  if (cleaningKeys.includes('noise_reduction')) {
    const hp = offline.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 80; hp.Q.value = 0.5;
    lastNode.connect(hp); lastNode = hp;
    const ls = offline.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 200; ls.gain.value = -4;
    lastNode.connect(ls); lastNode = ls;
  }
  if (filterKeys.includes('telephone')) {
    const hp = offline.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.7;
    lastNode.connect(hp); lastNode = hp;
    const lp = offline.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.7;
    lastNode.connect(lp); lastNode = lp;
    const ws = offline.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i * 2) / 256 - 1; curve[i] = ((Math.PI + 30) * x) / (Math.PI + 30 * Math.abs(x)); }
    ws.curve = curve; lastNode.connect(ws); lastNode = ws;
  }
  if (filterKeys.includes('deep')) {
    const ls = offline.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 300; ls.gain.value = 8;
    lastNode.connect(ls); lastNode = ls;
    const lp = offline.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000; lp.Q.value = 0.5;
    lastNode.connect(lp); lastNode = lp;
  }
  if (filterKeys.includes('echo')) {
    const mix = offline.createGain(); const dg = offline.createGain(); const wg = offline.createGain();
    const dl  = offline.createDelay(1.0); const fb = offline.createGain();
    dg.gain.value = 0.7; wg.gain.value = 0.35; dl.delayTime.value = 0.25; fb.gain.value = 0.35;
    lastNode.connect(dg); lastNode.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wg);
    dg.connect(mix); wg.connect(mix); lastNode = mix;
  }
  if (filterKeys.includes('reverb')) {
    const convolver = offline.createConvolver();
    const irLen = sr * 1;
    const irBuf = offline.createBuffer(1, irLen, sr);
    const d = irBuf.getChannelData(0);
    for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2);
    convolver.buffer = irBuf;
    const dg = offline.createGain(); const wg = offline.createGain(); const mix = offline.createGain();
    dg.gain.value = 0.65; wg.gain.value = 0.35;
    lastNode.connect(dg); lastNode.connect(convolver); convolver.connect(wg);
    dg.connect(mix); wg.connect(mix); lastNode = mix;
  }

  lastNode.connect(offline.destination);
  sourceNode.start(0);

  let renderedBuffer;
  try { renderedBuffer = await offline.startRendering(); } catch (e) {
    console.error('[VoiceFilter] render failed:', e);
    return sourceBlob;
  }
  return audioBufferToWavBlob(renderedBuffer);
}

function audioBufferToWavBlob(buffer) {
  return new Promise((resolve) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate  = buffer.sampleRate;
    const length      = buffer.length;
    const blockAlign  = numChannels * 2;
    const dataSize    = length * blockAlign;
    const wavBuffer   = new ArrayBuffer(44 + dataSize);
    const view        = new DataView(wavBuffer);
    const write = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, dataSize, true);
    let offset = 44; let index = 0; const chunkSize = 50000;
    function processChunk() {
      const end = Math.min(index + chunkSize, length);
      const channelsData = Array.from({ length: numChannels }, (_, c) => buffer.getChannelData(c));
      for (let i = index; i < end; i++) {
        for (let c = 0; c < numChannels; c++) {
          const sample = Math.max(-1, Math.min(1, channelsData[c][i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }
      index = end;
      if (index < length) setTimeout(processChunk, 0);
      else resolve(new Blob([wavBuffer], { type: 'audio/wav' }));
    }
    processChunk();
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceRecorderModal({ onClose }) {
  const addAudioTrack = useStore(s => s.addAudioTrack);

  // recording state: 'idle' | 'recording' | 'recorded' | 'processing'
  const [state,          setState]          = useState('idle');
  const [recordingTime,  setRecordingTime]  = useState(0);
  const [activeTab,      setActiveTab]      = useState('cleaning');
  const [rawBlob,        setRawBlob]        = useState(null);
  const [previewBlob,    setPreviewBlob]    = useState(null);
  const [previewUrl,     setPreviewUrl]     = useState(null);
  const [cleaning,       setCleaning]       = useState([]);
  const [filters,        setFilters]        = useState([]);
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [progress,       setProgress]       = useState(0);
  const [waveform,       setWaveform]       = useState([]);

  const mediaRecorderRef  = useRef(null);
  const chunksRef         = useRef([]);
  const timerRef          = useRef(null);
  const progressTimerRef  = useRef(null);
  const previewCtxRef     = useRef(null);
  const previewSourceRef  = useRef(null);
  const previewBufRef     = useRef(null);
  const previewStartAtRef = useRef(0);
  const previewOffsetRef  = useRef(0);
  const analyserRef       = useRef(null);
  const animFrameRef      = useRef(null);
  const keepUrlRef        = useRef(false);
  const isFilteredUrlRef  = useRef(false);

  const getCtx = useCallback(async () => {
    if (!previewCtxRef.current || previewCtxRef.current.state === 'closed') {
      previewCtxRef.current = new AudioContext();
    }
    if (previewCtxRef.current.state === 'suspended') await previewCtxRef.current.resume();
    return previewCtxRef.current;
  }, []);

  // Decode preview blob whenever it changes
  useEffect(() => {
    previewBufRef.current = null;
    previewOffsetRef.current = 0;
    if (!previewBlob) return;
    (async () => {
      try {
        const ctx     = await getCtx();
        const ab      = await previewBlob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        previewBufRef.current = decoded;
      } catch (e) { console.warn('Preview decode failed', e); }
    })();
  }, [previewBlob, getCtx]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (previewSourceRef.current) { try { previewSourceRef.current.stop(); } catch {} previewSourceRef.current.disconnect(); }
      if (previewCtxRef.current && previewCtxRef.current.state !== 'closed') previewCtxRef.current.close();
      if (previewUrl && !keepUrlRef.current) URL.revokeObjectURL(previewUrl);
    };
  }, []); // eslint-disable-line

  const stopPlayback = useCallback(() => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch {}
      previewSourceRef.current.disconnect();
      previewSourceRef.current = null;
    }
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
    setIsPlaying(false);
  }, []);

  const startRecording = async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const vizCtx   = new AudioContext();
      const source   = vizCtx.createMediaStreamSource(stream);
      const analyser = vizCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const drawWaveform = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setWaveform(Array.from(data).map(v => v / 255));
        animFrameRef.current = requestAnimationFrame(drawWaveform);
      };
      drawWaveform();

      const PREFERRED = ['audio/ogg;codecs=opus', 'audio/webm;codecs=pcm', 'audio/webm'];
      const mimeType  = PREFERRED.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
      const recorder  = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        vizCtx.close();
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        setRawBlob(blob); setPreviewBlob(blob); setPreviewUrl(url);
        setWaveform([]); setState('recorded');
      };

      recorder.start(100);
      setState('recording');
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) { console.error('Mic access denied:', err); }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  };

  const discard = () => {
    stopPlayback();
    setRawBlob(null); setPreviewBlob(null); setPreviewUrl(null);
    setState('idle'); setRecordingTime(0); setProgress(0);
    setCleaning([]); setFilters([]);
    isFilteredUrlRef.current = false;
  };

  const playBuffer = useCallback(async (buf) => {
    const ctx = await getCtx();
    stopPlayback();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => { setIsPlaying(false); setProgress(0); previewOffsetRef.current = 0; if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
    src.start(0, 0);
    previewSourceRef.current = src;
    previewStartAtRef.current = ctx.currentTime;
    previewOffsetRef.current = 0;
    setIsPlaying(true);
    const dur = buf.duration;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      const c = previewCtxRef.current; if (!c) return;
      const elapsed = c.currentTime - previewStartAtRef.current;
      setProgress(Math.min(1, elapsed / dur));
      if (elapsed >= dur) clearInterval(progressTimerRef.current);
    }, 80);
  }, [getCtx, stopPlayback]);

  const togglePlay = async () => {
    if (!previewBlob) return;
    if (isPlaying) {
      const ctx = previewCtxRef.current;
      if (ctx) previewOffsetRef.current = Math.min((ctx.currentTime - previewStartAtRef.current) + previewOffsetRef.current, previewBufRef.current?.duration ?? 0);
      stopPlayback(); return;
    }
    const ctx = await getCtx();
    if (!previewBufRef.current) {
      try { const ab = await previewBlob.arrayBuffer(); previewBufRef.current = await ctx.decodeAudioData(ab); } catch { return; }
    }
    const buf    = previewBufRef.current;
    const offset = Math.min(previewOffsetRef.current, buf.duration - 0.01);
    const src    = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    src.onended = () => { setIsPlaying(false); setProgress(0); previewOffsetRef.current = 0; if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
    src.start(0, Math.max(0, offset));
    previewSourceRef.current  = src;
    previewStartAtRef.current = ctx.currentTime;
    setIsPlaying(true);
    const dur = buf.duration;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      const c = previewCtxRef.current; if (!c) return;
      const elapsed = (c.currentTime - previewStartAtRef.current) + previewOffsetRef.current;
      setProgress(Math.min(1, elapsed / dur));
      if (elapsed >= dur) clearInterval(progressTimerRef.current);
    }, 80);
  };

  const runFilter = useCallback(async (newCleaning, newFilters) => {
    if (!rawBlob) return;
    stopPlayback(); setState('processing'); setProgress(0);
    previewBufRef.current = null; previewOffsetRef.current = 0;
    try {
      const ctx       = await getCtx();
      const processed = await applyAudioFilters(rawBlob, newCleaning, newFilters, ctx);
      const newUrl    = URL.createObjectURL(processed);
      setPreviewUrl(prev => { if (prev && isFilteredUrlRef.current) URL.revokeObjectURL(prev); return newUrl; });
      isFilteredUrlRef.current = true;
      setPreviewBlob(processed);
      const ab  = await processed.arrayBuffer();
      const dec = await ctx.decodeAudioData(ab);
      previewBufRef.current = dec;
      playBuffer(dec);
    } catch (e) { console.error('[VoiceFilter] audition failed:', e); }
    finally { setState('recorded'); }
  }, [rawBlob, getCtx, stopPlayback, playBuffer]);

  const toggleOption = (key, type) => {
    if (state === 'processing') return;
    let newCleaning = [...cleaning];
    let newFilters  = [...filters];
    if (type === 'cleaning') {
      newCleaning = cleaning.includes(key) ? cleaning.filter(k => k !== key) : [...cleaning, key];
      setCleaning(newCleaning);
    } else {
      newFilters = filters.includes(key) ? filters.filter(k => k !== key) : [...filters, key];
      setFilters(newFilters);
    }
    runFilter(newCleaning, newFilters);
  };

  const addToTimeline = () => {
    if (!previewBlob || !previewUrl) return;
    const ts          = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const filterLabel = [...cleaning, ...filters].length > 0 ? ` [${[...cleaning, ...filters].join(', ')}]` : '';
    const trackName   = `Voice ${ts}${filterLabel}`;

    // Compute duration from the decoded buffer, fallback to recordingTime
    const duration = previewBufRef.current?.duration ?? recordingTime;

    addAudioTrack({
      id:         crypto.randomUUID(),
      name:       trackName,
      src:        previewUrl,
      duration,
      volume: 1, trimStart: 0, trimEnd: 1, fadeIn: 0, fadeOut: 0, filter: 'none', loop: false,
      audioCleaningKeys: cleaning,
      audioFilterKeys:   filters,
    });

    keepUrlRef.current = true; // don't revoke — timeline needs the URL
    stopPlayback();
    discard();
    onClose();
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const isRecorded    = state === 'recorded' || state === 'processing';
  const isProcessing  = state === 'processing';
  const hasOptions    = cleaning.length > 0 || filters.length > 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 360, background: '#0d1117', border: '1px solid #1e293b', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🎙</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Voice Recorder</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4, borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'} onMouseLeave={e => e.currentTarget.style.color = '#475569'}>×</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Waveform + timer + controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Waveform area */}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b', borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Bars */}
              <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.3)', borderRadius: 6, overflow: 'hidden', padding: '0 6px' }}>
                {state === 'recording' && waveform.length > 0
                  ? waveform.slice(0, 30).map((v, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 2, borderRadius: 99, background: '#f87171', height: `${Math.max(8, v * 100)}%`, transition: 'height 75ms' }} />
                    ))
                  : isRecorded
                  ? Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 2, borderRadius: 99, background: isPlaying ? `hsl(${270 + i * 3},75%,${55 + (i * 7) % 18}%)` : '#7c3aed', height: `${20 + ((i * 37 + 13) % 60)}%`, transition: 'background 200ms' }} />
                    ))
                  : Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 2, borderRadius: 99, background: 'rgba(255,255,255,0.08)', height: '20%' }} />
                    ))
                }
              </div>

              {/* Progress bar */}
              {isRecorded && (
                <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#a78bfa', borderRadius: 99, width: `${progress * 100}%`, transition: 'width 75ms' }} />
                </div>
              )}

              {/* Timer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: state === 'recording' ? '#f87171' : '#e2e8f0' }}>{fmt(recordingTime)}</span>
                {state === 'recording' && <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700, animation: 'pulse 1s infinite' }}>● REC</span>}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              {state === 'idle' && (
                <Btn color="#ef4444" hoverColor="#dc2626" onClick={startRecording}>🎙 Record</Btn>
              )}
              {state === 'recording' && (
                <Btn color="#ef4444" hoverColor="#dc2626" onClick={stopRecording}>⏹ Stop</Btn>
              )}
              {isRecorded && (<>
                <Btn outline onClick={togglePlay} disabled={isProcessing}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Btn>
                <Btn danger onClick={discard}>🗑 Discard</Btn>
              </>)}
              {state === 'recorded' && (
                <Btn color="#7c3aed" hoverColor="#6d28d9" onClick={addToTimeline}>✓ Add</Btn>
              )}
            </div>
          </div>

          {/* Filters panel */}
          <div style={{ border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden', opacity: isRecorded ? 1 : 0.35, pointerEvents: isRecorded ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
              {[['cleaning', '✨ Cleaning'], ['effects', '🎛 Effects']].map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: '8px 0', border: 'none', background: activeTab === tab ? 'rgba(255,255,255,0.04)' : 'transparent',
                  color: activeTab === tab ? (tab === 'cleaning' ? '#4ade80' : '#c084fc') : '#475569',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  borderBottom: activeTab === tab ? `2px solid ${tab === 'cleaning' ? '#22c55e' : '#a855f7'}` : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  {label}
                  {tab === 'cleaning' && cleaning.length > 0 && <Badge>{cleaning.length}</Badge>}
                  {tab === 'effects'  && filters.length > 0  && <Badge purple>{filters.length}</Badge>}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ padding: 8, maxHeight: 160, overflowY: 'auto' }}>
              {activeTab === 'cleaning' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {AUDIO_CLEANING_OPTIONS.map(opt => {
                    const active = cleaning.includes(opt.key);
                    return (
                      <FilterRow key={opt.key} opt={opt} active={active} disabled={isProcessing} color="green"
                        onClick={() => toggleOption(opt.key, 'cleaning')} />
                    );
                  })}
                </div>
              )}
              {activeTab === 'effects' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {AUDIO_FILTER_OPTIONS.map(opt => {
                    const active = filters.includes(opt.key);
                    return (
                      <FilterCard key={opt.key} opt={opt} active={active} disabled={isProcessing}
                        onClick={() => toggleOption(opt.key, 'effects')} />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status bar */}
            <div style={{ borderTop: '1px solid #1e293b', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isProcessing
                ? <span style={{ color: '#94a3b8', fontSize: 11 }}>⏳ Processing…</span>
                : hasOptions
                ? <span style={{ color: '#4ade80', fontSize: 11 }}>✓ Filters applied — preview playing</span>
                : <span style={{ color: '#334155', fontSize: 11 }}>Select options to preview</span>
              }
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Btn({ children, onClick, color, hoverColor, outline, danger, disabled }) {
  const [hov, setHov] = useState(false);
  const bg = outline
    ? hov ? 'rgba(255,255,255,0.08)' : 'transparent'
    : danger
    ? hov ? '#991b1b22' : 'transparent'
    : hov ? hoverColor : color;
  const fg = outline ? '#cbd5e1' : danger ? '#f87171' : '#fff';
  const border = outline ? '1px solid #1e293b' : danger ? '1px solid #7f1d1d44' : `1px solid ${color}44`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: bg, border, color: fg, borderRadius: 7, fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, whiteSpace: 'nowrap', transition: 'all 0.12s' }}
    >
      {children}
    </button>
  );
}

function Badge({ children, purple }) {
  return (
    <span style={{ background: purple ? 'rgba(168,85,247,0.2)' : 'rgba(34,197,94,0.2)', color: purple ? '#c084fc' : '#4ade80', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99 }}>
      {children}
    </span>
  );
}

function FilterRow({ opt, active, disabled, color, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px', borderRadius: 8, border: active ? '1px solid rgba(34,197,94,0.35)' : '1px solid #1e293b',
        background: active ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
        color: active ? '#4ade80' : '#64748b', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        textAlign: 'left', transition: 'all 0.12s',
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</div>
        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>{opt.desc}</div>
      </div>
      {active && <span style={{ color: '#4ade80', fontSize: 13 }}>✓</span>}
    </button>
  );
}

function FilterCard({ opt, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 9px', borderRadius: 8,
        border: active ? '1px solid rgba(168,85,247,0.35)' : '1px solid #1e293b',
        background: active ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.02)',
        color: active ? '#c084fc' : '#64748b', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        textAlign: 'left', transition: 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</span>
        {active && <span style={{ color: '#c084fc', fontSize: 11 }}>✓</span>}
      </div>
      <span style={{ fontSize: 10, opacity: 0.6 }}>{opt.desc}</span>
    </button>
  );
}
