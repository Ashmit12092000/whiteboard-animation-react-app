/**
 * TTSModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Text-to-Speech panel in a modal dialog.
 * Placed in the Audio row header button in the timeline.
 * Adapted from TTSPanel.tsx for plain JSX.
 */

import { useState } from 'react';
import { useStore } from '../../store';

const TTS_LANGUAGES = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'fr-FR', label: 'French',       flag: '🇫🇷' },
  { code: 'es-ES', label: 'Spanish',      flag: '🇪🇸' },
  { code: 'de-DE', label: 'German',       flag: '🇩🇪' },
  { code: 'hi-IN', label: 'Hindi',        flag: '🇮🇳' },
];

const TTS_VOICES = {
  'en-US': [{ name: 'Natural', pitch: 1.0, rate: 1.0 }, { name: 'Warm', pitch: 0.9, rate: 0.95 }, { name: 'Clear', pitch: 1.1, rate: 1.05 }],
  'fr-FR': [{ name: 'Natural', pitch: 1.0, rate: 0.95 }, { name: 'Expressive', pitch: 1.05, rate: 1.0 }],
  'es-ES': [{ name: 'Natural', pitch: 1.0, rate: 1.0 },  { name: 'Energetic',  pitch: 1.1,  rate: 1.1  }],
  'de-DE': [{ name: 'Natural', pitch: 0.95, rate: 0.95 }, { name: 'Crisp',     pitch: 1.0,  rate: 1.0  }],
  'hi-IN': [{ name: 'Natural', pitch: 1.0, rate: 0.9 },   { name: 'Clear',     pitch: 1.05, rate: 1.0  }],
};

const MAX_CHARS = 300;

// ─── Shared with VoiceRecorderModal ──────────────────────────────────────────
const AUDIO_CLEANING_OPTIONS = [
  { key: 'noise_reduction', label: 'Noise Reduction', desc: 'Remove background hiss & hum' },
  { key: 'normalize',       label: 'Normalize',       desc: 'Balance overall volume' },
  { key: 'silence_trim',    label: 'Trim Silence',    desc: 'Remove silent start/end gaps' },
];

const AUDIO_FILTER_OPTIONS = [
  { key: 'reverb',     label: 'Reverb',      desc: 'Add room ambience' },
  { key: 'echo',       label: 'Echo',        desc: 'Subtle delay effect' },
  { key: 'pitch_up',   label: 'Pitch Up',    desc: 'Raise pitch slightly' },
  { key: 'pitch_down', label: 'Pitch Down',  desc: 'Lower pitch slightly' },
  { key: 'telephone',  label: 'Telephone',   desc: 'Lo-fi telephone effect' },
  { key: 'deep',       label: 'Deep Voice',  desc: 'Low & resonant tone' },
];

function estimateDuration(text, lang, pitch, rate) {
  return new Promise((resolve) => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang; utt.pitch = pitch; utt.rate = rate; utt.volume = 0;
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    if (match) utt.voice = match;
    const start = performance.now();
    utt.onend   = () => resolve((performance.now() - start) / 1000);
    utt.onerror = () => resolve(Math.max(2, text.length / 15));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  });
}

export default function TTSModal({ onClose }) {
  const addTTSTrack = useStore(s => s.addTTSTrack);

  const [text,       setText]       = useState('');
  const [language,   setLanguage]   = useState('en-US');
  const [voiceIdx,   setVoiceIdx]   = useState(0);
  const [ttsState,   setTtsState]   = useState('idle'); // idle | estimating | ready
  const [duration,   setDuration]   = useState(null);
  const [langOpen,   setLangOpen]   = useState(false);
  const [activeTab,  setActiveTab]  = useState('cleaning');
  const [cleaning,   setCleaning]   = useState([]);
  const [filters,    setFilters]    = useState([]);

  const voices     = TTS_VOICES[language] || TTS_VOICES['en-US'];
  const selLang    = TTS_LANGUAGES.find(l => l.code === language);
  const charCount  = text.length;

  const handleTextChange = (e) => {
    const val = e.target.value.slice(0, MAX_CHARS);
    setText(val);
    setTtsState('idle');
    setDuration(null);
  };

  const handleLangChange = (code) => {
    setLanguage(code);
    setVoiceIdx(0);
    setTtsState('idle');
    setDuration(null);
    setLangOpen(false);
  };

  const generate = async () => {
    if (!text.trim()) return;
    setTtsState('estimating');
    const vc  = voices[voiceIdx] || voices[0];
    const dur = await estimateDuration(text, language, vc.pitch, vc.rate);
    setDuration(dur);
    setTtsState('ready');
  };

  const preview = () => {
    if (!text.trim()) return;
    const utt = new SpeechSynthesisUtterance(text);
    const vc  = voices[voiceIdx] || voices[0];
    utt.lang = language; utt.pitch = vc.pitch; utt.rate = vc.rate;
    const avail = window.speechSynthesis.getVoices();
    const match = avail.find(v => v.lang.startsWith(language.split('-')[0]));
    if (match) utt.voice = match;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  };

  const toggleFilter = (key, type) => {
    if (type === 'cleaning') {
      setCleaning(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    } else {
      setFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    }
    // Reset generate state so user re-generates with new filter labels
    setTtsState('idle');
    setDuration(null);
  };

  const addToTimeline = () => {
    if (!duration) return;
    const vc        = voices[voiceIdx] || voices[0];
    const langLabel = TTS_LANGUAGES.find(l => l.code === language)?.label || language;
    const trackName = `TTS – ${langLabel} (${vc.name})`;
    const snippet   = text.slice(0, 30) + (text.length > 30 ? '…' : '');

    addTTSTrack(`${trackName}: "${snippet}"`, { text, lang: language, pitch: vc.pitch, rate: vc.rate }, duration, { cleaning, filters });
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) { window.speechSynthesis.cancel(); onClose(); } }}
    >
      <div style={{ width: 380, background: '#0d1117', border: '1px solid #1e293b', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔊</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Text to Speech</span>
          </div>
          <button onClick={() => { window.speechSynthesis.cancel(); onClose(); }}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4, borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'} onMouseLeave={e => e.currentTarget.style.color = '#475569'}>×</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Language selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Language</label>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setLangOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #1e293b', borderRadius: 8, cursor: 'pointer', color: '#e2e8f0', fontSize: 13 }}
              >
                <span>{selLang?.flag}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{selLang?.label}</span>
                <span style={{ color: '#475569', fontSize: 10 }}>▼</span>
              </button>
              {langOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setLangOpen(false)} />
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#0d1117', border: '1px solid #1e293b', borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {TTS_LANGUAGES.map(l => (
                      <button key={l.code} onClick={() => handleLangChange(l.code)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: l.code === language ? 'rgba(59,130,246,0.12)' : 'none', border: 'none', color: l.code === language ? '#60a5fa' : '#94a3b8', fontSize: 13, cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => { if (l.code !== language) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={e => { if (l.code !== language) e.currentTarget.style.background = 'none'; }}
                      >
                        <span>{l.flag}</span><span>{l.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Voice style */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Voice Style</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {voices.map((v, i) => (
                <button key={v.name} onClick={() => setVoiceIdx(i)}
                  style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', border: voiceIdx === i ? '1px solid rgba(96,165,250,0.5)' : '1px solid #1e293b', background: voiceIdx === i ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)', color: voiceIdx === i ? '#93c5fd' : '#475569' }}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          {/* Text input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Text</label>
              <span style={{ fontSize: 10, color: charCount > MAX_CHARS * 0.85 ? '#fbbf24' : '#334155' }}>{charCount}/{MAX_CHARS}</span>
            </div>
            <textarea
              value={text}
              onChange={handleTextChange}
              placeholder="Type text to convert to speech…"
              rows={4}
              style={{ width: '100%', resize: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid #1e293b', color: '#e2e8f0', fontSize: 13, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
              onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
              onBlur={e => e.currentTarget.style.borderColor = '#1e293b'}
            />
          </div>

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn onClick={preview} disabled={!text.trim() || ttsState === 'estimating'} outline>
              🔊 Preview
            </ActionBtn>
            <ActionBtn onClick={generate} disabled={!text.trim() || ttsState === 'estimating'} color="#2563eb" hoverColor="#1d4ed8">
              {ttsState === 'estimating' ? '⏳ Timing…' : '✨ Generate'}
            </ActionBtn>
          </div>

          {/* ── Audio filters panel ─────────────────────────────────────── */}
          <div style={{ border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
              {[['cleaning', '✨ Cleaning'], ['effects', '🎛 Effects']].map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: '8px 0', border: 'none',
                  background: activeTab === tab ? 'rgba(255,255,255,0.04)' : 'transparent',
                  color: activeTab === tab ? (tab === 'cleaning' ? '#4ade80' : '#c084fc') : '#475569',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  borderBottom: activeTab === tab ? `2px solid ${tab === 'cleaning' ? '#22c55e' : '#a855f7'}` : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  {label}
                  {tab === 'cleaning' && cleaning.length > 0 && (
                    <span style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99 }}>{cleaning.length}</span>
                  )}
                  {tab === 'effects' && filters.length > 0 && (
                    <span style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99 }}>{filters.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ padding: 8, maxHeight: 148, overflowY: 'auto' }}>
              {activeTab === 'cleaning' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {AUDIO_CLEANING_OPTIONS.map(opt => {
                    const active = cleaning.includes(opt.key);
                    return (
                      <button key={opt.key} onClick={() => toggleFilter(opt.key, 'cleaning')} style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', transition: 'all 0.12s',
                        border: active ? '1px solid rgba(34,197,94,0.35)' : '1px solid #1e293b',
                        background: active ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                        color: active ? '#4ade80' : '#64748b',
                      }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</div>
                          <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>{opt.desc}</div>
                        </div>
                        {active && <span style={{ color: '#4ade80', fontSize: 13 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {activeTab === 'effects' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {AUDIO_FILTER_OPTIONS.map(opt => {
                    const active = filters.includes(opt.key);
                    return (
                      <button key={opt.key} onClick={() => toggleFilter(opt.key, 'effects')} style={{
                        display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 9px', borderRadius: 8,
                        textAlign: 'left', cursor: 'pointer', transition: 'all 0.12s',
                        border: active ? '1px solid rgba(168,85,247,0.35)' : '1px solid #1e293b',
                        background: active ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.02)',
                        color: active ? '#c084fc' : '#64748b',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</span>
                          {active && <span style={{ color: '#c084fc', fontSize: 11 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status hint */}
            <div style={{ borderTop: '1px solid #1e293b', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(cleaning.length > 0 || filters.length > 0)
                ? <span style={{ color: '#fbbf24', fontSize: 11 }}>⚠ Filters selected — re-generate to apply</span>
                : <span style={{ color: '#334155', fontSize: 11 }}>Select filters, then Generate</span>
              }
            </div>
          </div>

          {/* Add to timeline — only after timing measured */}
          {ttsState === 'ready' && duration && (
            <ActionBtn onClick={addToTimeline} color="#7c3aed" hoverColor="#6d28d9" fullWidth>
              ＋ Add to Timeline ({duration.toFixed(1)}s)
            </ActionBtn>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, outline, color, hoverColor, fullWidth }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: fullWidth ? undefined : 1,
        width: fullWidth ? '100%' : undefined,
        padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, transition: 'all 0.12s',
        background: outline ? (hov ? 'rgba(255,255,255,0.06)' : 'transparent') : hov ? hoverColor : color,
        border: outline ? '1px solid #1e293b' : `1px solid ${color}44`,
        color: outline ? '#94a3b8' : '#fff',
      }}
    >
      {children}
    </button>
  );
}