// @ts-nocheck
import { useRef, useState } from 'react';
import { useStore } from '../../store';
import ImageEditModal from '../dialogs/ImageEditModal';

const REVEAL_EFFECTS = [
  { value: 'wipe-right', label: '→ Wipe Right' },
  { value: 'wipe-down',  label: '↓ Wipe Down'  },
  { value: 'fade',       label: '✦ Fade In'     },
  { value: 'zoom',       label: '⊕ Zoom In'     },
  { value: 'scribble',   label: '✏ Scribble'    },
];

export default function ImagesTab() {
  const fileRef         = useRef(null);
  const addImageGraphic = useStore(s => s.addImageGraphic);

  const [effect,    setEffect]    = useState('wipe-right');
  const [editQueue, setEditQueue] = useState([]); // items waiting for modal
  const [loading,   setLoading]   = useState(false);

  const handleFiles = async (files) => {
    setLoading(true);
    const results = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const src = await readAsDataURL(file);
      const { w, h } = await getImageDimensions(src);
      results.push({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), src, w, h });
    }
    setLoading(false);
    if (results.length > 0) setEditQueue(prev => [...prev, ...results]);
  };

  const handleFileInput = (e) => { handleFiles(Array.from(e.target.files)); e.target.value = ''; };
  const handleDrop      = (e)  => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); };

  const currentEdit = editQueue[0] ?? null;

  const handleConfirm = (editedItem) => {
    const maxW   = 280;
    const aspect = editedItem.h / editedItem.w;
    const w      = Math.min(editedItem.w, maxW);
    const h      = Math.round(w * aspect);
    addImageGraphic({ src: editedItem.src, name: editedItem.name, width: w, height: h, revealEffect: effect });
    setEditQueue(prev => prev.slice(1));
  };

  const handleCancel = () => setEditQueue(prev => prev.slice(1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Reveal Effect selector */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, display: 'block', marginBottom: 6 }}>
          Reveal Effect
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {REVEAL_EFFECTS.map(e => (
            <button
              key={e.value}
              onClick={() => setEffect(e.value)}
              style={{
                flex: '1 1 auto', padding: '5px 6px', fontSize: 10, fontWeight: 600,
                background: effect === e.value ? '#3b82f620' : '#1e293b',
                border: `1px solid ${effect === e.value ? '#3b82f6' : '#334155'}`,
                borderRadius: 5, color: effect === e.value ? '#3b82f6' : '#94a3b8',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{e.label}</button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          margin: '10px 12px 0',
          border: '2px dashed #334155',
          borderRadius: 8,
          padding: '22px 12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
      >
        <div style={{ fontSize: 26 }}>🖼️</div>
        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
          {loading ? 'Loading…' : 'Click or drag images here'}
        </p>
        <p style={{ fontSize: 10, color: '#4b5563', margin: 0 }}>PNG · JPG · GIF · WebP · SVG</p>
        <p style={{ fontSize: 10, color: '#3b82f670', margin: 0, fontStyle: 'italic' }}>
          Opens crop &amp; filter editor
        </p>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInput} />
      </div>

      {/* Empty state */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#1e293b', fontSize: 12, textAlign: 'center', padding: '0 16px' }}>
          Upload an image to crop, filter, and add it to the canvas
        </p>
      </div>

      {/* Edit modal (shown when queue has items) */}
      {currentEdit && (
        <ImageEditModal
          item={currentEdit}
          revealEffect={effect}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 200, h: 150 });
    img.src = src;
  });
}
