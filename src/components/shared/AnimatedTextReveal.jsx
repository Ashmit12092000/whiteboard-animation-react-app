import { useEffect, useRef, useState } from 'react';
import { textToStrokeData, warmFont } from '../../services/fontService';

export default function AnimatedTextReveal({
  graphic,
  playing,
  duration,
  delay,
  onTipMove,
}) {
  const [strokeData, setStrokeData] = useState(null);

  const svgRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  // ─────────────────────────────────────────────────────────────
  // Load font stroke data
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const family = graphic.fontFamily || 'Open Sans';
    const weight = graphic.fontWeight || 'normal';

    warmFont(family, weight)
      .then(() => {
        if (cancelled) return;

        return textToStrokeData(
          graphic.rawText || ' ',
          family,
          graphic.fontSize || 36,
          weight
        );
      })
      .then((data) => {
        if (!cancelled && data) {
          setStrokeData(data);
        }
      })
      .catch((err) => {
        console.warn('Font load error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [
    graphic.rawText,
    graphic.fontFamily,
    graphic.fontSize,
    graphic.fontWeight,
  ]);

  // ─────────────────────────────────────────────────────────────
  // Animation loop
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);

    const svgEl = svgRef.current;

    if (!svgEl || !strokeData) return;

    const { strokes } = strokeData;

    const nStrokes = strokes.length;

    if (nStrokes === 0) {
      onTipMove?.({ active: false });
      return;
    }

    const strokeEls = strokes.map((_, i) =>
      svgEl.querySelector(`#sp${i}`)
    );

    const lengths = strokeEls.map((el) => {
      if (!el) return 0;

      try {
        return el.getTotalLength() * 1.005;
      } catch {
        return 200;
      }
    });

    // Reset animation
    strokeEls.forEach((el, i) => {
      if (!el) return;

      el.style.strokeDasharray = `${lengths[i]}`;
      el.style.strokeDashoffset = `${lengths[i]}`;
    });

    if (!playing) {
      onTipMove?.({ active: false });
      return;
    }

    startRef.current = null;

    const tick = (ts) => {
      if (startRef.current === null) {
        startRef.current = ts;
      }

      const elapsed = (ts - startRef.current) / 1000;

      const perStroke = duration / nStrokes;

      // Active stroke
      const activeIdx = strokes.findIndex((_, i) => {
        const s = delay + i * perStroke;
        const e = delay + (i + 1) * perStroke;

        return elapsed >= s && elapsed < e;
      });

      // Completed strokes
      strokes.forEach((_, i) => {
        const el = strokeEls[i];

        if (!el) return;

        const end = delay + (i + 1) * perStroke;

        if (elapsed >= end) {
          el.style.strokeDashoffset = '0';
        }
      });

      if (activeIdx !== -1) {
        const el = strokeEls[activeIdx];
        const len = lengths[activeIdx];

        const startSec = delay + activeIdx * perStroke;
        const endSec = delay + (activeIdx + 1) * perStroke;

        const t = Math.min(
          1,
          Math.max(0, (elapsed - startSec) / (endSec - startSec))
        );

        // Smooth reveal
        el.style.strokeDasharray = `${len}`;
        el.style.strokeDashoffset = `${len * (1 - t)}`;

        // Hand movement
        if (onTipMove && len > 0) {
          try {
            const pt = el.getPointAtLength(t * len);

            const rect = svgEl.getBoundingClientRect();

            onTipMove({
              active: true,
              screenX: rect.left + pt.x,
              screenY: rect.top + pt.y,
            });
          } catch {
            onTipMove?.({ active: false });
          }
        }
      }

      if (elapsed < delay + duration) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onTipMove?.({ active: false });
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      onTipMove?.({ active: false });
    };
  }, [strokeData, playing, duration, delay, onTipMove]);

  // ─────────────────────────────────────────────────────────────
  // Colors
  // ─────────────────────────────────────────────────────────────
  const isBoardDark =
    graphic.boardType === 'blackboard' ||
    graphic.boardType === 'greenboard';

  const color =
    graphic.color && graphic.color !== ''
      ? graphic.color
      : isBoardDark
      ? '#f1f5f9'
      : '#1a1a1a';

  const strokeW = Math.max(
    1.4,
    (strokeData?.renderSize || graphic.fontSize || 36) * 0.09
  );

  if (!strokeData) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          opacity: 0,
        }}
      />
    );
  }

  const svgW = strokeData.totalWidth;
  const svgH = strokeData.totalHeight;

  return (
    <div
    style={{
      width: '100%',
      height: '100%',
      overflow: 'visible',
      position: 'relative',
    }}
    >
      <svg
        ref={svgRef}
        viewBox={strokeData.viewBox}
        width={svgW}
        height={svgH}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: 'block',
          overflow: 'visible',
        }}
      >
        {/* Reveal mask */}
        <defs>
          <mask id="handwriting-mask">
            <rect width="100%" height="100%" fill="black" />

            {strokeData.strokes.map((s, i) => (
              <path
                key={`sp${i}`}
                id={`sp${i}`}
                d={s.d}
                fill="none"
                stroke="white"
                strokeWidth={strokeW * 2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </mask>
        </defs>

        {/* Filled text revealed progressively */}
        <g mask="url(#handwriting-mask)">
          {strokeData.glyphs.map((g, i) => (
            <path
              key={`gf${i}`}
              d={g.d}
              fill={color}
              stroke="none"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}