import { useEffect, useRef, useState } from 'react';
import { HAND_OPTIONS, DEFAULT_HAND_ID, resolveHandOption } from '../../assets';

// ── Module-level blob-URL cache keyed by hand id ──────────────────────────────
const _blobCache   = {};
const _loadingSet  = new Set();
const _callbackMap = {};

const PUB = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

function preloadHand(opt) {
  const { id, src } = opt;
  if (_blobCache[id] || _loadingSet.has(id)) return;
  _loadingSet.add(id);

  const url = src;
  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.blob();
    })
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      _blobCache[id] = blobUrl;
      (_callbackMap[id] || []).forEach(cb => cb(blobUrl));
      _callbackMap[id] = [];
      _loadingSet.delete(id);
    })
    .catch(err => {
      console.warn('[WhiteboardHand] failed to load hand:', url, err);
      _loadingSet.delete(id);
    });
}

function getOrSubscribe(id, cb) {
  if (_blobCache[id]) { cb(_blobCache[id]); return () => {}; }
  if (!_callbackMap[id]) _callbackMap[id] = [];
  _callbackMap[id].push(cb);
  return () => {
    _callbackMap[id] = (_callbackMap[id] || []).filter(f => f !== cb);
  };
}

HAND_OPTIONS.forEach(opt => preloadHand(opt));

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {React.MutableRefObject} props.tipRef
 * @param {React.MutableRefObject} props.canvasRef
 * @param {string}  [props.handId]
 * @param {{ scale?: number, rotation?: number, flipX?: boolean }} [props.handConfig]
 */
export default function WhiteboardHand({ tipRef, canvasRef, handId, handConfig, customHands }) {
  const resolvedId = handId ?? DEFAULT_HAND_ID;
  const handOpt    = resolveHandOption(resolvedId, customHands);

  // Apply user customization on top of the option's base values
  const userScale    = handConfig?.scale    ?? 1;
  const userRotation = handConfig?.rotation ?? 0;
  const userFlipX    = handConfig?.flipX    ?? false;
  const userOffsetX  = handConfig?.offsetX  ?? 0;
  const userOffsetY  = handConfig?.offsetY  ?? 0;

  const { nativeW, nativeH, tipX, tipY, displayPx } = handOpt;

  const baseDisplayPx = displayPx * userScale;
  const displayH      = baseDisplayPx * (nativeH / nativeW);
  const tipFracX      = tipX / nativeW;
  const tipFracY      = tipY / nativeH;

  const handRef = useRef(null);
  const rafRef  = useRef(null);

  const [src, setSrc] = useState(() => handOpt.isCustom ? handOpt.src : (_blobCache[resolvedId] ?? null));

  useEffect(() => {
    if (handOpt.isCustom) {
      setSrc(handOpt.src);
      return;
    }
    if (_blobCache[resolvedId]) {
      setSrc(_blobCache[resolvedId]);
      return;
    }
    setSrc(null);
    const unsub = getOrSubscribe(resolvedId, url => setSrc(url));
    return unsub;
  }, [resolvedId, handOpt]);

  // Keep latest calibration values in a ref so the rAF loop never restarts
  const calibRef = useRef({ tipFracX, tipFracY, displayPx: baseDisplayPx, displayH, userOffsetX, userOffsetY });
  useEffect(() => {
    calibRef.current = { tipFracX, tipFracY, displayPx: baseDisplayPx, displayH, userOffsetX, userOffsetY };
  }, [tipFracX, tipFracY, baseDisplayPx, displayH, userOffsetX, userOffsetY]);

  // ── rAF tip-tracking loop ─────────────────────────────────────────────────
  useEffect(() => {
    const hand = handRef.current;
    if (!hand) return;

    const loop = () => {
      const tip    = tipRef.current;
      const canvas = canvasRef.current;

      if (!tip?.active || !canvas) {
        hand.style.opacity = '0';
      } else {
        const { tipFracX: fx, tipFracY: fy, displayPx: dpx, displayH: dph, userOffsetX: ox, userOffsetY: oy } = calibRef.current;

        const cr      = canvas.getBoundingClientRect();
        const naturalW = canvas.offsetWidth  || cr.width;
        const naturalH = canvas.offsetHeight || cr.height;
        const scaleX   = cr.width  / naturalW;
        const scaleY   = cr.height / naturalH;

        const cx = (tip.screenX - cr.left) / scaleX;
        const cy = (tip.screenY - cr.top)  / scaleY;

        hand.style.opacity = '1';
        hand.style.left    = `${cx - fx * dpx + ox}px`;
        hand.style.top     = `${cy - fy * dph + oy}px`;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tipRef, canvasRef]);

  return (
    <img
      ref={handRef}
      src={src ?? undefined}
      alt=""
      style={{
        position:        'absolute',
        width:           baseDisplayPx,
        height:          displayH,
        pointerEvents:   'none',
        zIndex:          20,
        opacity:         0,
        left:            -baseDisplayPx,
        top:             -displayH,
        // Apply rotation + flip; origin is the pen-tip so the tip stays aligned
        transformOrigin: `${tipFracX * 100}% ${tipFracY * 100}%`,
        transform:       `rotate(${userRotation}deg) scaleX(${userFlipX ? -1 : 1})`,
      }}
    />
  );
}