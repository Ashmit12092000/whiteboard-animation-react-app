import { useEffect, useRef } from 'react';

/**
 * AnimatedSvgRenderer  – Doodly-style "hand-draws any SVG" engine
 *
 * Animation pipeline:
 *   PHASE 1 — draw all strokes (outline all shapes)
 *   PHASE 2 — reveal all fills  (paint colors left-to-right, one element at a time)
 *
 * This order matches Doodly: outlines are drawn first, then colors are painted.
 *
 * Handles:
 *   • stroke-only paths (whiteboard style)
 *   • fill-only paths  (clip-path wipe reveal)
 *   • mixed stroke+fill (outline drawn in phase 1, color revealed in phase 2)
 *   • fills set via CSS classes, inline style, or fill attribute
 *   • <use> references, nested <svg>, viewBox offsets
 *   • paths where getTotalLength() returns 0 (estimateLength fallback)
 */
export default function AnimatedSvgRenderer({
  svg, style, className, playing, duration = 1.5, delay = 0, onTipMove,
}) {
  const svgRef   = useRef(null);
  const rafRef   = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    const svgDiv = svgRef.current;
    if (!svgDiv) return;

    cancelAnimationFrame(rafRef.current);

    // ── 1. Inject & normalise SVG ─────────────────────────────────────────────
    svgDiv.innerHTML = svg || '';
    const svgEl = svgDiv.querySelector('svg');
    if (!svgEl) return;

    svgEl.setAttribute('width',  '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.style.display  = 'block';
    svgEl.style.overflow = 'visible';

    // ── 2. Flatten <use> references ───────────────────────────────────────────
    flattenUseElements(svgEl);

    // ── 3. Parse viewBox ──────────────────────────────────────────────────────
    const vb  = svgEl.viewBox?.baseVal;
    const vbX = vb?.width > 0 ? (vb.x ?? 0) : 0;
    const vbY = vb?.width > 0 ? (vb.y ?? 0) : 0;
    const vbW = vb?.width > 0 ? vb.width  : (svgEl.getBoundingClientRect().width  || 100);
    const vbH = vb?.height > 0 ? vb.height : (svgEl.getBoundingClientRect().height || 100);

    // ── 3b. Parse embedded CSS (for class-based fills/strokes) ───────────────
    // getComputedStyle can be unreliable for injected SVGs; read <style> directly.
    const cssRules = parseSvgCss(svgEl);

    // ── 4. Static mode ────────────────────────────────────────────────────────
    if (!playing) {
      onTipMove?.({ active: false });
      restoreAllElements(svgEl);
      return;
    }

    // ── 5. Collect all visible drawable elements ──────────────────────────────
    const candidates = Array.from(
      svgEl.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect')
    ).filter(isVisible);

    if (candidates.length === 0) {
      onTipMove?.({ active: false });
      svgEl.style.opacity    = '0';
      svgEl.style.transition = `opacity ${duration}s ease ${delay}s`;
      requestAnimationFrame(() => { svgEl.style.opacity = '1'; });
      return;
    }

    // ── 6. Classify each element ──────────────────────────────────────────────
    //   hasStroke  – element has a visible stroke (attr, inline style, or CSS class)
    //   fillColor  – element has an intentional fill color (null = no fill / default)
    const classified = candidates.map(el => {
      const cs        = window.getComputedStyle(el);
      const hasStroke = hasDrawableStroke(el, cs, cssRules);
      const fillColor = getExplicitFillColor(el, cs, cssRules); // null if no fill
      return { el, cs, hasStroke, fillColor };
    });

    // Stroke group: elements that have a stroke (draw outline first)
    const strokeGroup = classified.filter(c => c.hasStroke);
    // Fill group: elements that have an intentional fill color (reveal color after)
    const fillGroup   = classified.filter(c => c.fillColor !== null);

    const hasAnyStroke = strokeGroup.length > 0;
    const hasAnyFill   = fillGroup.length   > 0;

    // ── 7. Time allocation ────────────────────────────────────────────────────
    // If there are both strokes AND fills: give 70% to strokes, 30% to fills.
    // If only one type: give it all the time.
    const strokeDur = duration * (hasAnyStroke && hasAnyFill ? 0.70 : hasAnyStroke ? 1.0 : 0);
    const fillDur   = duration * (hasAnyStroke && hasAnyFill ? 0.30 : hasAnyFill   ? 1.0 : 0);
    const fillPhaseStart = delay + strokeDur;

    // ── 8. Set up stroke phase ────────────────────────────────────────────────
    const strokeMeta = strokeGroup.map(({ el, fillColor }, i) => {
      let length = 0;
      try { length = el.getTotalLength?.() ?? 0; } catch (_) {}
      if (length === 0) length = estimateLength(el);
      const dashLen = length * 1.005;

      // Use !important so our overrides beat any CSS class rules in the SVG
      el.style.setProperty('opacity',           '0',         'important');
      el.style.setProperty('stroke-dasharray',  `${dashLen}`, 'important');
      el.style.setProperty('stroke-dashoffset', `${dashLen}`, 'important');

      // If this element also has a colored fill, suppress it during stroke phase.
      // We save the originals so the fill phase can restore them.
      if (fillColor !== null) {
        el.dataset.savedFillAttr  = el.getAttribute('fill') ?? '__null__';
        el.dataset.savedFillStyle = el.style.fill || '';
        // !important beats CSS class fills (including those with !important in SVG CSS)
        el.style.setProperty('fill', 'none', 'important');
        el.setAttribute('fill', 'none');
      }

      const slot = strokeDur / strokeGroup.length;
      return {
        el, phase: 'stroke',
        length, dashLen,
        hasPendingFill: fillColor !== null, // fill phase will handle restoration
        startSec: delay + i * slot,
        endSec:   delay + (i + 1) * slot,
      };
    });

    // ── 9. Set up fill phase ──────────────────────────────────────────────────
    // Fill-only elements start hidden (opacity 0); stroke+fill elements are
    // already hidden from step 8 above and will be opacity:1 after their stroke.
    const fillMeta = fillGroup.map(({ el, hasStroke: elHasStroke }, i) => {
      if (!elHasStroke) {
        // Fill-only element: hide initially, reveal via clip-path wipe
        el.style.opacity = '0';
      }
      // For stroke+fill elements: opacity will be 1 after stroke phase snap.
      // Their fill is still suppressed (style.fill = 'none').

      const slot = fillDur / fillGroup.length;

      if (!elHasStroke) {
        // Fill-only element: hide with !important so no SVG CSS can override
        el.style.setProperty('opacity', '0', 'important');
      }

      return {
        el, phase: 'fill',
        clipReady:    false,   // clip-path set up lazily on first activation
        isStrokePlus: elHasStroke, // already opacity:1 from stroke phase
        bbox:         null,    // set by activateFillClip after reflow
        startSec: fillPhaseStart + i * slot,
        endSec:   fillPhaseStart + (i + 1) * slot,
      };
    });

    // Combined meta: strokes first, fills second
    const meta = [...strokeMeta, ...fillMeta];

    startRef.current = null;

    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = (ts - startRef.current) / 1000;

      // ── Snap completed elements ──────────────────────────────────────────────
      meta.forEach(m => {
        if (elapsed >= m.endSec) snapToFinal(m, svgEl);
      });

      // ── Find active element ──────────────────────────────────────────────────
      const activeIdx = meta.findIndex(m => elapsed >= m.startSec && elapsed < m.endSec);

      if (activeIdx === -1) {
        onTipMove?.({ active: false });
        const allDone = elapsed >= (meta.length > 0 ? meta[meta.length - 1].endSec : delay);
        if (!allDone) rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const m = meta[activeIdx];

      // ── Drive active element ─────────────────────────────────────────────────
      if (m.phase === 'stroke') {
        m.el.style.setProperty('opacity', '1', 'important');
        const t = Math.min(1, Math.max(0, (elapsed - m.startSec) / (m.endSec - m.startSec)));
        m.el.style.setProperty('stroke-dashoffset', `${m.dashLen * (1 - t)}`, 'important');

        // Tip tracking along stroke path
        if (onTipMove && m.length > 0) {
          try {
            const pt      = m.el.getPointAtLength(t * m.length);
            const divRect = svgDiv.getBoundingClientRect();
            const sx = divRect.width  / vbW;
            const sy = divRect.height / vbH;
            onTipMove({
              active:  true,
              localX:  (pt.x - vbX) * sx,
              localY:  (pt.y - vbY) * sy,
              screenX: divRect.left + (pt.x - vbX) * sx,
              screenY: divRect.top  + (pt.y - vbY) * sy,
            });
          } catch (_) { onTipMove?.({ active: false }); }
        }

      } else {
        // Fill phase
        if (!m.clipReady) activateFillClip(m, svgEl); // lazy setup on first frame

        m.el.style.setProperty('opacity', '1', 'important');
        const t = Math.min(1, Math.max(0, (elapsed - m.startSec) / (m.endSec - m.startSec)));
        driveFillClip(m.el, t);

        // Tip: sweep along the leading (right) edge of the growing clip rect
        // so the hand looks like it is painting the colour on.
        if (onTipMove) {
          try {
            const bbox    = m.bbox;
            const divRect = svgDiv.getBoundingClientRect();
            const sx = divRect.width  / vbW;
            const sy = divRect.height / vbH;
            // X = right edge of the clip rect (advances left→right as t grows)
            // Y = vertical midpoint of the element
            const tipSvgX = bbox.x + bbox.width * t;
            const tipSvgY = bbox.y + bbox.height * 0.5;
            onTipMove({
              active:  true,
              localX:  (tipSvgX - vbX) * sx,
              localY:  (tipSvgY - vbY) * sy,
              screenX: divRect.left + (tipSvgX - vbX) * sx,
              screenY: divRect.top  + (tipSvgY - vbY) * sy,
            });
          } catch (_) { onTipMove?.({ active: false }); }
        }
      }

      // ── Hide not-yet-started elements ────────────────────────────────────────
      meta.forEach((mm, i) => {
        if (i <= activeIdx) return;
        if (mm.phase === 'stroke') {
          mm.el.style.setProperty('opacity', '0', 'important');
          if (mm.length > 0) mm.el.style.setProperty('stroke-dashoffset', `${mm.dashLen}`, 'important');
        } else if (!mm.isStrokePlus) {
          // Fill-only elements: hide until their turn
          mm.el.style.setProperty('opacity', '0', 'important');
        }
        // stroke+fill fill-entries: stay at opacity:1 (stroke already drawn),
        // fill remains suppressed by style.fill='none !important'
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      // Restore any DOM mutations
      meta.forEach(m => {
        restoreSavedFill(m.el);
        removeFillClip(m.el);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, playing, duration, delay]);

  return (
    <div ref={svgRef} className={className} style={{ lineHeight: 0, ...style }} />
  );
}

// ─── Core animation helpers ───────────────────────────────────────────────────

function snapToFinal(m, svgEl) {
  m.el.style.setProperty('opacity', '1', 'important');

  if (m.phase === 'stroke') {
    m.el.style.setProperty('stroke-dashoffset', '0', 'important');
    // Only restore fill if the fill phase won't do it (stroke-only element)
    if (!m.hasPendingFill) {
      restoreSavedFill(m.el);
    }
    // hasPendingFill elements keep fill='none !important' — fill phase restores + reveals
  } else {
    // Fill phase snap
    if (!m.clipReady) activateFillClip(m, svgEl);
    driveFillClip(m.el, 1);
  }
}

/** Set up the clip-path for a fill meta entry (lazy — called on first activation). */
function activateFillClip(m, svgEl) {
  m.clipReady = true;

  // Restore fill so the element has a visible colour (clip-path will mask it)
  restoreSavedFill(m.el);

  // For fill-only elements the fill was never suppressed via savedFillAttr,
  // so the fill is naturally present.

  // Measure bbox NOW — after stroke phase and fill restore, so the browser
  // has reflowed and getBBox() returns accurate SVG-space coordinates.
  let bbox = { x: 0, y: 0, width: 100, height: 100 };
  try { bbox = m.el.getBBox(); } catch (_) {}
  m.bbox = bbox; // store for tip tracking in the tick loop

  // Create clip-path rect (width=0 initially), using the correct bbox
  setupFillClip(m.el, svgEl, bbox);

  // Ensure clip starts at 0 width (fill invisible until clip grows)
  driveFillClip(m.el, 0);
}

/**
 * Restore fill from dataset.savedFillAttr / savedFillStyle (if saved).
 * Safe to call multiple times — no-ops if nothing was saved.
 *
 * We used setProperty('fill','none','important') to suppress, so we must
 * removeProperty('fill') to let CSS class fills take effect again.
 * Then we restore any original inline fill value on top.
 */
function restoreSavedFill(el) {
  if (el.dataset.savedFillAttr !== undefined) {
    const attr = el.dataset.savedFillAttr;
    if (attr === '__null__') el.removeAttribute('fill');
    else el.setAttribute('fill', attr);
    delete el.dataset.savedFillAttr;
  }
  if (el.dataset.savedFillStyle !== undefined) {
    // Remove our !important override so CSS class fill is visible again
    el.style.removeProperty('fill');
    // If there was an original inline fill, reapply it
    if (el.dataset.savedFillStyle) el.style.fill = el.dataset.savedFillStyle;
    delete el.dataset.savedFillStyle;
  }
}

/** Restore every element in the SVG to its natural un-animated state. */
function restoreAllElements(svgEl) {
  svgEl.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect')
    .forEach(el => {
      el.style.removeProperty('stroke-dasharray');
      el.style.removeProperty('stroke-dashoffset');
      el.style.removeProperty('opacity');
      restoreSavedFill(el);
      removeFillClip(el);
    });
}

// ─── CSS class rule parser ────────────────────────────────────────────────────
/**
 * Parse the SVG's embedded <style> block into a map of { className → { prop → value } }.
 * This is more reliable than getComputedStyle for injected SVGs.
 */
function parseSvgCss(svgEl) {
  const styleEl = svgEl.querySelector('style');
  if (!styleEl) return {};
  const css = styleEl.textContent || '';
  const rules = {};
  // Match: .className { prop: value; ... }  (handles multiple classes, nested spaces)
  const ruleRe = /\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g;
  let rm;
  while ((rm = ruleRe.exec(css)) !== null) {
    const cls = rm[1];
    if (!rules[cls]) rules[cls] = {};
    const body = rm[2];
    const propRe = /([\w-]+)\s*:\s*([^;!}]+)/g;
    let pm;
    while ((pm = propRe.exec(body)) !== null) {
      rules[cls][pm[1].trim()] = pm[2].trim();
    }
  }
  return rules;
}

/** Get CSS class property value for an element, checking all its classes. */
function getCssProp(el, prop, cssRules) {
  const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  for (const cls of classes) {
    const val = cssRules[cls]?.[prop];
    if (val !== undefined) return val;
  }
  return null;
}

// ─── Stroke detection ─────────────────────────────────────────────────────────
/**
 * Returns true when the element has a visible stroke via attribute, inline
 * style, or CSS class rule. We avoid raw getComputedStyle.stroke because
 * some browsers return 'rgb(0,0,0)' as the default for all SVG elements.
 */
function hasDrawableStroke(el, cs, cssRules) {
  const attr = el.getAttribute('stroke');
  if (attr === 'none') return false;
  if (attr && attr !== '') {
    const sw = parseFloat(el.getAttribute('stroke-width') || cs.strokeWidth || '1');
    return sw > 0;
  }
  const styleStroke = el.style.stroke;
  if (styleStroke && styleStroke !== 'none') {
    const sw = parseFloat(el.style.strokeWidth || cs.strokeWidth || '1');
    return sw > 0;
  }
  // CSS class stroke
  const cssStroke = getCssProp(el, 'stroke', cssRules);
  if (cssStroke && cssStroke !== 'none') {
    const cssSw = parseFloat(getCssProp(el, 'stroke-width', cssRules) || cs.strokeWidth || '1');
    return cssSw > 0;
  }
  return false;
}

// ─── Fill detection ───────────────────────────────────────────────────────────
/**
 * Returns the fill colour string if the element has an intentional coloured
 * fill, or null if it has no fill / only the browser default black.
 *
 * Priority: fill attribute → inline style → CSS class → computed style.
 * We parse the SVG's <style> block directly (cssRules) for reliability.
 */
function getExplicitFillColor(el, cs, cssRules) {
  const attr = el.getAttribute('fill');
  if (attr === 'none') return null;
  if (attr && attr !== '') return attr;

  const styleF = el.style.fill;
  if (styleF && styleF !== 'none') return styleF;

  // CSS class fill (most reliable — parsed directly from <style> block)
  const cssFill = getCssProp(el, 'fill', cssRules);
  if (cssFill !== null) {
    if (cssFill === 'none') return null;
    return cssFill;
  }

  // Fallback: computed style, excluding SVG default black
  const computed = cs.fill;
  if (
    computed &&
    computed !== 'none' &&
    computed !== 'rgba(0, 0, 0, 0)' &&
    computed !== 'rgb(0, 0, 0)'
  ) {
    return computed;
  }

  return null;
}

// ─── Visibility check ─────────────────────────────────────────────────────────
function isVisible(el) {
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  if (parseFloat(cs.opacity ?? '1') === 0) return false;
  try {
    const bb = el.getBBox();
    if (bb.width === 0 && bb.height === 0) return false;
  } catch (_) {}
  return true;
}

// ─── <use> flattening ─────────────────────────────────────────────────────────
function flattenUseElements(svgEl) {
  let useEls = Array.from(svgEl.querySelectorAll('use'));
  for (let pass = 0; pass < 5 && useEls.length > 0; pass++) {
    useEls.forEach(useEl => {
      const href = useEl.getAttribute('href') || useEl.getAttribute('xlink:href');
      if (!href?.startsWith('#')) return;
      const target = svgEl.querySelector(href);
      if (!target) return;

      const clone = target.cloneNode(true);
      const tx = useEl.getAttribute('x') || '0';
      const ty = useEl.getAttribute('y') || '0';
      const existTransform = useEl.getAttribute('transform') || '';
      const trans = (tx !== '0' || ty !== '0') ? `translate(${tx},${ty})` : '';
      const combined = [trans, existTransform].filter(Boolean).join(' ');
      if (combined) clone.setAttribute('transform', combined);
      ['stroke','fill','stroke-width','opacity'].forEach(a => {
        const v = useEl.getAttribute(a);
        if (v && !clone.getAttribute(a)) clone.setAttribute(a, v);
      });
      useEl.parentNode?.replaceChild(clone, useEl);
    });
    useEls = Array.from(svgEl.querySelectorAll('use'));
  }
}

// ─── Fill-clip wipe animation ─────────────────────────────────────────────────
// Each fill element gets its own <clipPath><rect> that starts at width=0
// and grows left-to-right to reveal the element's fill colour.

let _clipCounter = 0;

function setupFillClip(el, svgEl, bbox) {
  // Avoid double setup
  if (el.dataset.clipId) return;

  const id = `wb-clip-${++_clipCounter}`;
  el.dataset.clipId = id;

  let defs = svgEl.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgEl.prepend(defs);
  }

  // Use the caller-supplied bbox (measured at the right time, post-reflow)
  if (!bbox) {
    bbox = { x: 0, y: 0, width: 100, height: 100 };
    try { bbox = el.getBBox(); } catch (_) {}
  }

  const cp = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  cp.setAttribute('id', id);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x',      String(bbox.x));
  rect.setAttribute('y',      String(bbox.y - 1));
  rect.setAttribute('width',  '0');
  rect.setAttribute('height', String(bbox.height + 2));
  cp.appendChild(rect);
  defs.appendChild(cp);

  el.setAttribute('clip-path', `url(#${id})`);
  el.dataset.clipBboxW = String(bbox.width);
}

function driveFillClip(el, t) {
  const id = el.dataset.clipId;
  if (!id) return;
  const rect = document.getElementById(id)?.querySelector('rect');
  if (!rect) return;
  const totalW = parseFloat(el.dataset.clipBboxW ?? '100');
  rect.setAttribute('width', String(totalW * t));
}

function removeFillClip(el) {
  const id = el.dataset.clipId;
  if (!id) return;
  el.removeAttribute('clip-path');
  document.getElementById(id)?.remove();
  delete el.dataset.clipId;
  delete el.dataset.clipBboxW;
}

// ─── Length estimation fallback ───────────────────────────────────────────────
function estimateLength(el) {
  try {
    const tag = el.tagName.toLowerCase();
    if (tag === 'rect') {
      const w = parseFloat(el.getAttribute('width')  || 0) || 50;
      const h = parseFloat(el.getAttribute('height') || 0) || 50;
      return 2 * (w + h);
    }
    if (tag === 'circle')
      return 2 * Math.PI * parseFloat(el.getAttribute('r') || 25);
    if (tag === 'ellipse') {
      const rx = parseFloat(el.getAttribute('rx') || 25);
      const ry = parseFloat(el.getAttribute('ry') || 25);
      return Math.PI * (3*(rx+ry) - Math.sqrt((3*rx+ry)*(rx+3*ry)));
    }
    if (tag === 'line') {
      const dx = parseFloat(el.getAttribute('x2')||0) - parseFloat(el.getAttribute('x1')||0);
      const dy = parseFloat(el.getAttribute('y2')||0) - parseFloat(el.getAttribute('y1')||0);
      return Math.hypot(dx, dy) || 50;
    }
    if (tag === 'polyline' || tag === 'polygon') {
      const pts = (el.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);
      let len = 0;
      for (let i = 2; i < pts.length; i += 2)
        len += Math.hypot(pts[i]-pts[i-2], pts[i+1]-pts[i-1]);
      return len || 100;
    }
  } catch (_) {}
  return 200;
}
