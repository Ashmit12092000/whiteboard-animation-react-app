/**
 * CameraLayer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A thin wrapper that wraps canvas content in a transform layer driven by
 * the camera engine. Writes directly to the DOM style — no React re-renders.
 *
 * This is the ONLY component that should apply the camera transform.
 * Children render in world space; the camera does the rest.
 */

import { useRef, useEffect, forwardRef } from 'react';
import { useCameraTransform } from './cameraHooks';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {React.Ref} ref  — forwards a ref to the inner transform layer
 */
const CameraLayer = forwardRef(function CameraLayer({ children, style }, ref) {
  const layerRef = useRef(null);

  // Wire the camera engine → DOM transform (no re-renders)
  useCameraTransform(layerRef);

  // Forward ref if provided
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === 'function') ref(layerRef.current);
    else ref.current = layerRef.current;
  }, [ref]);

  return (
    <div
      ref={layerRef}
      style={{
        position:        'absolute',
        top:             0,
        left:            0,
        width:           '100%',
        height:          '100%',
        transformOrigin: '0 0',
        willChange:      'transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
});

export default CameraLayer;
