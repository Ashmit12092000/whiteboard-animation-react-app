// @ts-nocheck
/**
 * CameraMiniMap.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A miniature overview of the 800×450 canvas showing:
 *  • Object bounding boxes
 *  • Current camera viewport rectangle
 * Click to pan camera to that world position.
 */

import { useEffect, useRef, useState } from 'react';
import { cameraEngine } from './cameraEngine';
import { getViewportBounds } from './cameraUtils';

const MINI_W = 140;
const MINI_H = 79; // 140 * (450/800)
const WORLD_W = 800;
const WORLD_H = 450;

const scaleX = x => (x / WORLD_W) * MINI_W;
const scaleY = y => (y / WORLD_H) * MINI_H;

export default function CameraMiniMap({ graphics = [], visible = true }) {
  const [viewport, setViewport] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const unsub = cameraEngine.subscribe(state => {
      setViewport(getViewportBounds(state));
    });
    return unsub;
  }, []);

  if (!visible) return null;

  const vp = viewport ?? { x: 0, y: 0, width: WORLD_W, height: WORLD_H };

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const worldX = (relX / MINI_W) * WORLD_W;
    const worldY = (relY / MINI_H) * WORLD_H;
    const cam = cameraEngine.state;
    cameraEngine.animateTo({
      ...cam,
      x: worldX - WORLD_W / 2,
      y: worldY - WORLD_H / 2,
    }, 0.4, 'easeOut');
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Show overview map"
        style={{
          position:     'absolute',
          bottom:       12,
          left:         12,
          width:        30,
          height:       30,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          background:   'rgba(15,23,42,0.88)',
          border:       '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color:        '#e2e8f0',
          cursor:       'pointer',
          zIndex:       25,
          backdropFilter: 'blur(6px)',
          padding:      0,
        }}
      >
        <EyeIcon />
      </button>
    );
  }

  return (
    <div
      title="Mini-map — click to pan"
      style={{
        position:     'absolute',
        bottom:       12,
        left:         12,
        width:        MINI_W,
        height:       MINI_H,
        background:   'rgba(15,23,42,0.88)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        overflow:     'hidden',
        cursor:       'crosshair',
        zIndex:       25,
        backdropFilter: 'blur(6px)',
      }}
      onClick={handleClick}
    >
      {/* Hide toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); setCollapsed(true); }}
        title="Hide overview map"
        style={{
          position: 'absolute', top: 2, right: 2,
          width: 16, height: 16, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,23,42,0.7)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 3, color: '#94a3b8',
          cursor: 'pointer', padding: 0, zIndex: 2,
        }}
      >
        <CloseIcon />
      </button>

      {graphics.map(g => (
        <div
          key={g.id}
          style={{
            position:  'absolute',
            left:      scaleX(g.x),
            top:       scaleY(g.y),
            width:     Math.max(2, scaleX(g.width ?? 60)),
            height:    Math.max(2, scaleY(g.height ?? 60)),
            background: 'rgba(148,163,184,0.35)',
            border:    '1px solid rgba(148,163,184,0.5)',
            borderRadius: 1,
          }}
        />
      ))}

      {/* Viewport indicator */}
      <div
        style={{
          position:  'absolute',
          left:      Math.max(0, scaleX(vp.x)),
          top:       Math.max(0, scaleY(vp.y)),
          width:     Math.min(MINI_W, scaleX(vp.width)),
          height:    Math.min(MINI_H, scaleY(vp.height)),
          border:    '1.5px solid #f59e0b',
          borderRadius: 2,
          background: 'rgba(245,158,11,0.08)',
          pointerEvents: 'none',
          boxShadow: '0 0 0 1px rgba(245,158,11,0.3)',
        }}
      />

      {/* Label */}
      <div style={{
        position: 'absolute', bottom: 2, left: 3,
        color: '#475569', fontSize: 8, fontWeight: 700,
        letterSpacing: 0.5, pointerEvents: 'none',
      }}>
        OVERVIEW
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
    </svg>
  );
}