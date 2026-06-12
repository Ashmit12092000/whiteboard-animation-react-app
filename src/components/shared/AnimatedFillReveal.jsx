import { useEffect, useRef } from 'react';

export default function AnimatedFillReveal({
  svg, style, playing, duration = 2.5, delay = 0, onTipMove,
  boardBackground = '#ffffff',
}) {
  const containerRef  = useRef(null);
  const canvasRef     = useRef(null);
  const svgDivRef     = useRef(null);
  const strokeLayerRef = useRef(null);
  const rafRef        = useRef(null);
  const startRef      = useRef(null);
  const onTipMoveRef  = useRef(onTipMove);
  onTipMoveRef.current = onTipMove;

  useEffect(() => {
    const container   = containerRef.current;
    const canvas      = canvasRef.current;
    const svgDiv      = svgDivRef.current;
    const strokeLayer = strokeLayerRef.current;
    if (!container || !canvas || !svgDiv || !strokeLayer) return;

    cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    // Clear any previous stroke layer content
    strokeLayer.innerHTML = '';

    // ── Inject SVG ──────────────────────────────────────────────────────────
    svgDiv.innerHTML = svg || '';
    const svgEl = svgDiv.querySelector('svg');
    if (!svgEl) return;
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.setAttribute('height', '100%');
    svgEl.style.display  = 'block';
    svgEl.style.overflow = 'visible';

    // ── Static mode ─────────────────────────────────────────────────────────
    if (!playing) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onTipMoveRef.current?.({ active: false });
      return;
    }

    // ── Immediately hide everything — prevents 1-frame flash of filled SVG ──
    const allShapes = Array.from(
      svgEl.querySelectorAll('path,rect,circle,ellipse,polygon,polyline')
    );
    allShapes.forEach(el => { el.style.opacity = '0'; });

    // Also cover with board color immediately on the canvas
    const ctxEarly = canvas.getContext('2d');
    canvas.width  = container.offsetWidth  || 150;
    canvas.height = container.offsetHeight || 150;
    ctxEarly.fillStyle = boardBackground;
    ctxEarly.fillRect(0, 0, canvas.width, canvas.height);

    // ── Defer 1 rAF so container has real layout dimensions ─────────────────
    const frameId = requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      const W = Math.round(rect.width)  || 150;
      const H = Math.round(rect.height) || 150;
      canvas.width  = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = boardBackground;
      ctx.fillRect(0, 0, W, H);

      // viewBox → CSS pixel scale
      const vb   = svgEl.viewBox?.baseVal;
      const vbW  = (vb?.width  > 0 ? vb.width  : null) ?? W;
      const vbH  = (vb?.height > 0 ? vb.height : null) ?? H;
      const scaleX = W / vbW;
      const scaleY = H / vbH;

      // ── Prep each element ─────────────────────────────────────────────────
      const outlineEls = allShapes.map(el => {
        const origFill = el.getAttribute('fill') ?? '';

        if (origFill && origFill !== 'none') {
          el.dataset.origFill = origFill;
          el.setAttribute('fill', 'none');
        }

        const strokeColor = (origFill && origFill !== 'none') ? origFill : '#1e293b';
        el.setAttribute('stroke', strokeColor);
        el.setAttribute('stroke-width', String(Math.max(2, vbW / 30)));
        el.setAttribute('stroke-linejoin', 'round');
        el.setAttribute('stroke-linecap', 'round');

        let length = 0;
        try { length = el.getTotalLength?.() ?? 0; } catch (_) {}
        if (length === 0) length = estimateLength(el);

        el.style.opacity          = '0';
        el.style.strokeDasharray  = `${length}`;
        el.style.strokeDashoffset = `${length}`;

        return { el, length, origFill, strokeColor };
      });

      ctx.clearRect(0, 0, W, H);
      let phase2Started = false;

      const STROKES  = 8;
      const strokeH  = H / STROKES;
      const outlineDur = duration * 0.35;
      const fillDur    = duration * 0.65;

      const loop = (now) => {
        if (startRef.current === null) startRef.current = now;
        const elapsed = (now - startRef.current) / 1000;
        const t = elapsed - delay;

        // ── Delay period ────────────────────────────────────────────────────
        if (t < 0) {
          ctx.fillStyle = boardBackground;
          ctx.fillRect(0, 0, W, H);
          allShapes.forEach(el => { el.style.opacity = '0'; });
          onTipMoveRef.current?.({ active: false });
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        // ── PHASE 1: Draw border ─────────────────────────────────────────────
        if (t < outlineDur) {
          ctx.clearRect(0, 0, W, H);

          const progress = t / outlineDur;
          const perEl    = 1 / Math.max(outlineEls.length, 1);

          outlineEls.forEach((m, i) => {
            const elStart = i * perEl;
            const elEnd   = (i + 1) * perEl;

            if (progress >= elEnd) {
              m.el.style.opacity          = '1';
              m.el.style.strokeDashoffset = '0';
            } else if (progress >= elStart) {
              const localT = (progress - elStart) / perEl;
              m.el.style.opacity          = '1';
              m.el.style.strokeDashoffset = `${m.length * (1 - localT)}`;

              if (m.length > 0) {
                try {
                  const pt   = m.el.getPointAtLength(localT * m.length);
                  const divR = container.getBoundingClientRect();
                  onTipMoveRef.current?.({
                    active:  true,
                    screenX: divR.left + pt.x * scaleX,
                    screenY: divR.top  + pt.y * scaleY,
                  });
                } catch (_) {}
              }
            } else {
              m.el.style.opacity = '0';
            }
          });

          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        // ── TRANSITION → Phase 2 (runs once) ────────────────────────────────
        if (!phase2Started) {
          phase2Started = true;

          // STEP 1: Clone the current SVG (stroke visible) into the stroke layer
          // so the border remains visible above the canvas overlay throughout fill sweep.
          strokeLayer.innerHTML = svgDiv.innerHTML;
          const strokeSvgEl = strokeLayer.querySelector('svg');
          if (strokeSvgEl) {
            strokeSvgEl.setAttribute('width',  '100%');
            strokeSvgEl.setAttribute('height', '100%');
            strokeSvgEl.setAttribute('preserveAspectRatio', 'none');
            strokeSvgEl.style.display  = 'block';
            strokeSvgEl.style.overflow = 'visible';
            // Show only stroke — no fill, no dash animation (full stroke visible)
            strokeSvgEl.querySelectorAll('path,rect,circle,ellipse,polygon,polyline')
              .forEach(el => {
                el.setAttribute('fill', 'none');
                el.style.strokeDasharray  = '';
                el.style.strokeDashoffset = '';
                el.style.opacity          = '1';
              });
          }

          // STEP 2: Restore fill on bottom SVG layer, remove stroke (fill only)
          outlineEls.forEach(m => {
            m.el.style.opacity          = '1';
            m.el.style.strokeDasharray  = '';
            m.el.style.strokeDashoffset = '';
            if (m.el.dataset.origFill) {
              m.el.setAttribute('fill', m.el.dataset.origFill);
              delete m.el.dataset.origFill;
            }
            // Remove stroke from fill layer — stroke is now shown by strokeLayer above
            m.el.setAttribute('stroke', 'none');
          });

          // STEP 3: Cover fill layer with board color — sweep will reveal it
          ctx.fillStyle = boardBackground;
          ctx.fillRect(0, 0, W, H);
        }

        // ── PHASE 2: Fill sweep ──────────────────────────────────────────────
        const progress = Math.min((t - outlineDur) / fillDur, 1);

        const currentUnit   = progress * STROKES;
        const completedRows = Math.floor(currentUnit);
        const partialFrac   = currentUnit - completedRows;

        // Redraw cover for uncompleted area
        ctx.fillStyle = boardBackground;
        ctx.fillRect(0, completedRows * strokeH, W, H);

        // Keep completed rows clear (revealed)
        ctx.clearRect(0, 0, W, completedRows * strokeH);

        // Partial current row
        if (completedRows < STROKES) {
          const y        = completedRows * strokeH;
          const partialW = partialFrac * W;
          const divR     = container.getBoundingClientRect();

          if (completedRows % 2 === 0) {
            ctx.clearRect(0, y, partialW, strokeH + 1);
            onTipMoveRef.current?.({
              active:  true,
              screenX: divR.left + partialW,
              screenY: divR.top  + y + strokeH * 0.5,
            });
          } else {
            ctx.clearRect(W - partialW, y, partialW, strokeH + 1);
            onTipMoveRef.current?.({
              active:  true,
              screenX: divR.left + W - partialW,
              screenY: divR.top  + y + strokeH * 0.5,
            });
          }
        }

        if (progress >= 1) {
          ctx.clearRect(0, 0, W, H);
          onTipMoveRef.current?.({ active: false });
          return;
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(rafRef.current);
      if (strokeLayer) strokeLayer.innerHTML = '';
      onTipMoveRef.current?.({ active: false });
    };
  }, [svg, playing, duration, delay, boardBackground]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', ...style }}>
      {/* Bottom layer: fill elements (revealed row-by-row by canvas clearRect) */}
      <div
        ref={svgDivRef}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />
      {/* Canvas overlay — covers fill until sweep reveals it */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {/* Top stroke layer — border always visible above canvas during fill sweep */}
      <div
        ref={strokeLayerRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}

function estimateLength(el) {
  try {
    const tag = el.tagName.toLowerCase();
    if (tag === 'rect') {
      const w = parseFloat(el.getAttribute('width')  || 0) || 50;
      const h = parseFloat(el.getAttribute('height') || 0) || 50;
      return 2 * (w + h);
    }
    if (tag === 'circle')  return 2 * Math.PI * parseFloat(el.getAttribute('r') || 25);
    if (tag === 'ellipse') {
      const rx = parseFloat(el.getAttribute('rx') || 25);
      const ry = parseFloat(el.getAttribute('ry') || 25);
      return Math.PI * (3*(rx+ry) - Math.sqrt((3*rx+ry)*(rx+3*ry)));
    }
    if (tag === 'polygon' || tag === 'polyline') {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      let len = 0;
      for (let i = 2; i < pts.length; i += 2) {
        const dx = pts[i] - pts[i-2];
        const dy = pts[i+1] - pts[i-1];
        len += Math.sqrt(dx*dx + dy*dy);
      }
      return len || 200;
    }
  } catch (_) {}
  return 200;
}
