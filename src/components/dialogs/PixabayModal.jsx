import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../store';

const API_KEY = "56284973-5f94d6c30d0833fb4da5ee19f";

const REVEAL_EFFECTS = [
  { value: 'wipe-right', label: '→ Wipe Right' },
  { value: 'wipe-down',  label: '↓ Wipe Down'  },
  { value: 'fade',       label: '✦ Fade In'     },
  { value: 'zoom',       label: '⊕ Zoom In'     },
  { value: 'scribble',   label: '✏ Scribble'    },
];

export default function PixabayModal({ onClose }) {
  const addImageGraphic = useStore(s => s.addImageGraphic);

  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [page, setPage]           = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const [selected, setSelected]   = useState(null); // { src, w, h, name }
  const [effect, setEffect]       = useState('wipe-right');

  // Editor state
  const [rotation, setRotation]   = useState(0);
  const [cropBox, setCropBox]     = useState(null); // {x,y,w,h} in canvas coords
  const [dragging, setDragging]   = useState(null); // {type, startX, startY, origBox}
  const canvasRef = useRef(null);
  const imageRef  = useRef(null); // loaded HTMLImageElement

  const PER_PAGE = 20;

  const search = useCallback(async (p = 1) => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const url = `https://pixabay.com/api/?key=${API_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${PER_PAGE}&page=${p}&safesearch=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.hits || []);
      setTotalHits(data.totalHits || 0);
      setPage(p);
    } catch (e) {
      setError(e.message || 'Search failed');
    }
    setLoading(false);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') search(1);
  };

  // ── When user picks an image, proxy it through canvas to get data-URL ─────
  const pickImage = async (hit) => {
    setSelected(null);
    setRotation(0);
    setCropBox(null);
    // Use previewURL (640px) or largeImageURL
    const src = hit.largeImageURL || hit.webformatURL;
    const name = (hit.tags || 'pixabay').split(',')[0].trim();
    // Load via canvas to get data URL (avoids CORS save issues)
    try {
      const dataUrl = await loadImageAsDataUrl(src);
      const { w, h } = await getImageDimensions(dataUrl);
      setSelected({ src: dataUrl, w, h, name });
    } catch {
      setError('Failed to load image. Try another.');
    }
  };

  // ── Draw editor canvas whenever selected/rotation/cropBox changes ─────────
  useEffect(() => {
    if (!selected || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const img    = new Image();
    img.onload = () => {
      imageRef.current = img;
      drawEditor(canvas, ctx, img, rotation, cropBox);
    };
    img.src = selected.src;
  }, [selected, rotation, cropBox]);

  // ── Mouse events for crop dragging ───────────────────────────────────────
  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width  / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  };

  const onMouseDown = (e) => {
    if (!selected) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    const canvas = canvasRef.current;
    // If crop box exists, check handles
    if (cropBox) {
      const handle = getHandle(cropBox, pos, canvas);
      if (handle) {
        setDragging({ type: handle, startX: pos.x, startY: pos.y, origBox: { ...cropBox } });
        return;
      }
      // Inside box = move
      if (pos.x >= cropBox.x && pos.x <= cropBox.x + cropBox.w &&
          pos.y >= cropBox.y && pos.y <= cropBox.y + cropBox.h) {
        setDragging({ type: 'move', startX: pos.x, startY: pos.y, origBox: { ...cropBox } });
        return;
      }
    }
    // Start new crop box
    setDragging({ type: 'new', startX: pos.x, startY: pos.y, origBox: null });
    setCropBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const onMouseMove = (e) => {
    if (!dragging || !selected) return;
    e.preventDefault();
    const pos   = getCanvasPos(e);
    const dx    = pos.x - dragging.startX;
    const dy    = pos.y - dragging.startY;
    const canvas = canvasRef.current;
    const CW     = canvas.width;
    const CH     = canvas.height;

    if (dragging.type === 'new') {
      const x = Math.min(dragging.startX, pos.x);
      const y = Math.min(dragging.startY, pos.y);
      const w = Math.abs(pos.x - dragging.startX);
      const h = Math.abs(pos.y - dragging.startY);
      setCropBox({ x, y, w, h });
    } else if (dragging.type === 'move') {
      const ob = dragging.origBox;
      setCropBox({
        x: Math.max(0, Math.min(CW - ob.w, ob.x + dx)),
        y: Math.max(0, Math.min(CH - ob.h, ob.y + dy)),
        w: ob.w, h: ob.h,
      });
    } else {
      // Handle resize
      const ob = dragging.origBox;
      let { x, y, w, h } = ob;
      if (dragging.type.includes('e')) w = Math.max(20, w + dx);
      if (dragging.type.includes('s')) h = Math.max(20, h + dy);
      if (dragging.type.includes('w')) { x = ob.x + dx; w = Math.max(20, ob.w - dx); }
      if (dragging.type.includes('n')) { y = ob.y + dy; h = Math.max(20, ob.h - dy); }
      setCropBox({ x: Math.max(0, x), y: Math.max(0, y), w, h });
    }
  };

  const onMouseUp = () => setDragging(null);

  // ── Apply & add to canvas ─────────────────────────────────────────────────
  const addToCanvas = async () => {
    if (!selected) return;
    const canvas = canvasRef.current;
    // Build final image with rotation + crop applied
    const finalDataUrl = await buildFinalImage(canvas, imageRef.current, rotation, cropBox);
    const { w, h } = await getImageDimensions(finalDataUrl);
    const maxW = 280;
    const aspect = h / w;
    const fw = Math.min(w, maxW);
    const fh = Math.round(fw * aspect);
    addImageGraphic({ src: finalDataUrl, name: selected.name, width: fw, height: fh, revealEffect: effect });
    onClose();
  };

  const totalPages = Math.ceil(totalHits / PER_PAGE);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        width: '100%', maxWidth: 880,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 15 }}>Pixabay Image Search</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#64748b',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e293b', flexShrink: 0, display: 'flex', gap: 8 }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search Pixabay… e.g. mountains, technology, business"
            style={{
              flex: 1, background: '#1e293b', border: '1px solid #334155',
              borderRadius: 7, padding: '8px 12px', color: '#f1f5f9',
              fontSize: 13, outline: 'none',
            }}
          />
          <button
            onClick={() => search(1)}
            disabled={loading}
            style={{
              padding: '8px 18px', background: '#3b82f6', border: 'none',
              borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '…' : 'Search'}
          </button>
        </div>

        {/* Body: split into results + editor */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Left: results grid */}
          <div style={{
            width: selected ? 320 : '100%',
            flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: selected ? '1px solid #1e293b' : 'none',
            overflow: 'hidden',
            transition: 'width 0.2s',
          }}>
            {error && (
              <div style={{ padding: 12, color: '#ef4444', fontSize: 12 }}>{error}</div>
            )}
            {!loading && results.length === 0 && !error && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 13 }}>
                {query ? 'No results found' : 'Search for images above'}
              </div>
            )}
            <div style={{
              flex: 1, overflowY: 'auto', padding: 10,
              display: 'grid',
              gridTemplateColumns: selected ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 6, alignContent: 'start',
            }}>
              {results.map(hit => (
                <div
                  key={hit.id}
                  onClick={() => pickImage(hit)}
                  style={{
                    borderRadius: 7, overflow: 'hidden', cursor: 'pointer',
                    border: '2px solid transparent',
                    transition: 'border-color 0.15s, transform 0.1s',
                    aspectRatio: '4/3', background: '#1e293b',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                >
                  <img
                    src={hit.previewURL}
                    alt={hit.tags}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '8px 10px', borderTop: '1px solid #1e293b', flexShrink: 0,
              }}>
                <button
                  onClick={() => search(page - 1)}
                  disabled={page <= 1}
                  style={pageBtnStyle(page <= 1)}
                >← Prev</button>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => search(page + 1)}
                  disabled={page >= totalPages}
                  style={pageBtnStyle(page >= totalPages)}
                >Next →</button>
              </div>
            )}
          </div>

          {/* Right: editor */}
          {selected && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              overflow: 'hidden', minWidth: 0,
            }}>
              <div style={{
                padding: '8px 12px', borderBottom: '1px solid #1e293b',
                flexShrink: 0, fontSize: 11, color: '#94a3b8', fontWeight: 600,
              }}>
                EDIT IMAGE — drag to crop · use rotation slider below
              </div>

              {/* Canvas editor */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060d1a', overflow: 'hidden', padding: 8 }}>
                <canvas
                  ref={canvasRef}
                  width={EDITOR_W}
                  height={EDITOR_H}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseUp}
                  onTouchStart={onMouseDown}
                  onTouchMove={onMouseMove}
                  onTouchEnd={onMouseUp}
                  style={{
                    maxWidth: '100%', maxHeight: '100%',
                    cursor: 'crosshair', display: 'block',
                    borderRadius: 6,
                  }}
                />
              </div>

              {/* Controls */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid #1e293b', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Rotation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#64748b', width: 60, flexShrink: 0 }}>Rotate</span>
                  <input
                    type="range" min={-180} max={180} value={rotation}
                    onChange={e => { setRotation(Number(e.target.value)); setCropBox(null); }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 11, color: '#94a3b8', width: 36, textAlign: 'right' }}>{rotation}°</span>
                  <button
                    onClick={() => { setRotation(r => (r - 90 + 360) % 360 - 180); setCropBox(null); }}
                    title="Rotate -90°"
                    style={rotBtnStyle}
                  >↺</button>
                  <button
                    onClick={() => { setRotation(r => (r + 90 + 180) % 360 - 180); setCropBox(null); }}
                    title="Rotate +90°"
                    style={rotBtnStyle}
                  >↻</button>
                  {rotation !== 0 && (
                    <button onClick={() => { setRotation(0); setCropBox(null); }} style={{ ...rotBtnStyle, fontSize: 10, padding: '4px 6px' }}>Reset</button>
                  )}
                </div>

                {/* Crop actions */}
                {cropBox && cropBox.w > 5 && cropBox.h > 5 && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setCropBox(null)}
                      style={{
                        padding: '5px 12px', fontSize: 11, background: '#1e293b',
                        border: '1px solid #334155', borderRadius: 5, color: '#94a3b8', cursor: 'pointer',
                      }}
                    >Clear Crop</button>
                  </div>
                )}

                {/* Reveal effect selector */}
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 }}>Reveal Effect</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {REVEAL_EFFECTS.map(ef => (
                      <button
                        key={ef.value}
                        onClick={() => setEffect(ef.value)}
                        style={{
                          padding: '4px 8px', fontSize: 10, fontWeight: 600,
                          background: effect === ef.value ? '#3b82f620' : '#1e293b',
                          border: `1px solid ${effect === ef.value ? '#3b82f6' : '#334155'}`,
                          borderRadius: 5,
                          color: effect === ef.value ? '#3b82f6' : '#94a3b8',
                          cursor: 'pointer',
                        }}
                      >{ef.label}</button>
                    ))}
                  </div>
                </div>

                {/* Add button */}
                <button
                  onClick={addToCanvas}
                  style={{
                    padding: '9px 0', background: '#3b82f6', border: 'none',
                    borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', width: '100%',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                >
                  + Add to Canvas
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer attribution */}
        <div style={{
          padding: '6px 18px', borderTop: '1px solid #1e293b', flexShrink: 0,
          fontSize: 10, color: '#334155', textAlign: 'right',
        }}>
          Images from <a href="https://pixabay.com" target="_blank" rel="noreferrer" style={{ color: '#475569' }}>Pixabay</a>
        </div>
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const EDITOR_W = 480;
const EDITOR_H = 360;
const HANDLE_R = 6;

// ── Drawing helpers ───────────────────────────────────────────────────────────
function drawEditor(canvas, ctx, img, rotation, cropBox) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw rotated image centered
  ctx.save();
  ctx.translate(EDITOR_W / 2, EDITOR_H / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const { dw, dh } = fitInBox(img.naturalWidth, img.naturalHeight, EDITOR_W, EDITOR_H);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  if (cropBox && cropBox.w > 2 && cropBox.h > 2) {
    // Dim outside crop
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
    // Re-draw image in crop area only (clear above just removed the dim)
    ctx.restore();

    // Crop border
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);

    // Rule-of-thirds grid
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cropBox.x + (cropBox.w * i) / 3, cropBox.y);
      ctx.lineTo(cropBox.x + (cropBox.w * i) / 3, cropBox.y + cropBox.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cropBox.x, cropBox.y + (cropBox.h * i) / 3);
      ctx.lineTo(cropBox.x + cropBox.w, cropBox.y + (cropBox.h * i) / 3);
      ctx.stroke();
    }

    // Corner + edge handles
    drawHandles(ctx, cropBox);
    ctx.restore();
  }
}

function drawHandles(ctx, cb) {
  const handles = getHandlePositions(cb);
  for (const [, hx, hy] of handles) {
    ctx.beginPath();
    ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function getHandlePositions(cb) {
  return [
    ['nw', cb.x,              cb.y             ],
    ['n',  cb.x + cb.w / 2,   cb.y             ],
    ['ne', cb.x + cb.w,       cb.y             ],
    ['e',  cb.x + cb.w,       cb.y + cb.h / 2  ],
    ['se', cb.x + cb.w,       cb.y + cb.h      ],
    ['s',  cb.x + cb.w / 2,   cb.y + cb.h      ],
    ['sw', cb.x,              cb.y + cb.h      ],
    ['w',  cb.x,              cb.y + cb.h / 2  ],
  ];
}

function getHandle(cb, pos, canvas) {
  for (const [name, hx, hy] of getHandlePositions(cb)) {
    const dx = pos.x - hx, dy = pos.y - hy;
    if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_R + 4) return name;
  }
  return null;
}

function fitInBox(w, h, boxW, boxH) {
  const scale = Math.min(boxW / w, boxH / h, 1);
  return { dw: w * scale, dh: h * scale };
}

// ── Build final image from canvas state ───────────────────────────────────────
async function buildFinalImage(editorCanvas, img, rotation, cropBox) {
  const { dw, dh } = fitInBox(img.naturalWidth, img.naturalHeight, EDITOR_W, EDITOR_H);
  // Determine output region
  let sx = 0, sy = 0, sw = EDITOR_W, sh = EDITOR_H;
  if (cropBox && cropBox.w > 10 && cropBox.h > 10) {
    sx = cropBox.x; sy = cropBox.y; sw = cropBox.w; sh = cropBox.h;
  }

  // Create output canvas at crop dimensions
  const out = document.createElement('canvas');
  out.width  = sw;
  out.height = sh;
  const ctx = out.getContext('2d');

  // Draw rotated image into a temp full-size canvas, then copy crop region
  const tmp = document.createElement('canvas');
  tmp.width  = EDITOR_W;
  tmp.height = EDITOR_H;
  const tctx = tmp.getContext('2d');
  tctx.translate(EDITOR_W / 2, EDITOR_H / 2);
  tctx.rotate((rotation * Math.PI) / 180);
  tctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);

  ctx.drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}

// ── Image loading helpers ─────────────────────────────────────────────────────
function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      try {
        resolve(c.toDataURL('image/png'));
      } catch {
        reject(new Error('CORS error'));
      }
    };
    img.onerror = () => reject(new Error('Load failed'));
    img.src = url;
  });
}

function getImageDimensions(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 200, h: 150 });
    img.src = src;
  });
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const rotBtnStyle = {
  padding: '4px 8px', fontSize: 14, background: '#1e293b',
  border: '1px solid #334155', borderRadius: 5, color: '#94a3b8',
  cursor: 'pointer', flexShrink: 0,
};

function pageBtnStyle(disabled) {
  return {
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    background: disabled ? '#0f172a' : '#1e293b',
    border: '1px solid #334155', borderRadius: 5,
    color: disabled ? '#334155' : '#94a3b8',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
