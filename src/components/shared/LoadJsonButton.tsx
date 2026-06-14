// @ts-nocheck
import { useRef } from 'react';

// ── Generic "Load project from JSON" button ───────────────────────────────────
// Renders a hidden file input + styled button. Pass a `style` override and an
// `onLoad(file)` handler (typically the store's `loadProjectFromJson`).
// Pass `compact` for an icon-only mobile-friendly version.
export default function LoadJsonButton({ onLoad, label = 'Load', style, fullWidth = false, compact = false }) {
  const inputRef = useRef(null);

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onLoad(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          title="Load project from JSON file"
          style={{
            width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none',
            color: '#94a3b8', fontSize: 16, cursor: 'pointer',
            borderRadius: 7, flexShrink: 0,
            touchAction: 'manipulation',
            ...style,
          }}
        >
          📂
        </button>
      </>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onLoad(file);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        title="Load project from JSON file"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px',
          background: '#0c1a2e',
          border: '1px solid #2563eb55',
          borderRadius: 6,
          color: '#60a5fa', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.15s',
          width: fullWidth ? '100%' : undefined,
          justifyContent: fullWidth ? 'center' : undefined,
          ...style,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1e3a5f')}
        onMouseLeave={e => (e.currentTarget.style.background = '#0c1a2e')}
      >
        <span style={{ fontSize: 14 }}>📂</span>
        {label}
      </button>
    </>
  );
}