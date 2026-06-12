/**
 * CanvasGrid.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual grid overlay rendered as an SVG inside CameraLayer.
 * Because it lives in world-space (inside CameraLayer) it automatically zooms
 * and pans with the camera — no camera-state math needed here.
 *
 * Supports two visual modes:
 *   'lines' — thin hairlines like Doodly / VideoScribe
 *   'dots'  — small dots at every intersection like Figma / Canva
 *
 * Grid lines are generated only for the visible 800×450 world, with a small
 * overhang to keep lines crisp at the edges.
 *
 * Props
 * ─────
 * visible   {boolean}  — show/hide the overlay
 * gridSize  {number}   — world-pixel spacing between lines (default 40)
 * gridType  {'lines'|'dots'} — visual style
 * boardType {string}   — 'whiteboard' | 'blackboard' | 'greenboard'
 *                        Used to pick a grid colour that contrasts well.
 */

const CANVAS_W = 800;
const CANVAS_H = 450;

// Colour that reads well on each board background
const GRID_COLOURS = {
  whiteboard: 'rgba(99, 102, 241, 0.18)',   // indigo tint
  blackboard: 'rgba(255, 255, 255, 0.10)',
  greenboard: 'rgba(255, 255, 255, 0.10)',
};

const AXIS_COLOURS = {
  whiteboard: 'rgba(99, 102, 241, 0.40)',
  blackboard: 'rgba(255, 255, 255, 0.25)',
  greenboard: 'rgba(255, 255, 255, 0.25)',
};

export default function CanvasGrid({
  visible   = false,
  gridSize  = 40,
  gridType  = 'lines',
  boardType = 'whiteboard',
}) {
  if (!visible) return null;

  const colour     = GRID_COLOURS[boardType]  ?? GRID_COLOURS.whiteboard;
  const axisColour = AXIS_COLOURS[boardType]  ?? AXIS_COLOURS.whiteboard;

  // Build all X positions (vertical lines / dot columns)
  const xs = [];
  for (let x = 0; x <= CANVAS_W; x += gridSize) xs.push(x);

  // Build all Y positions (horizontal lines / dot rows)
  const ys = [];
  for (let y = 0; y <= CANVAS_H; y += gridSize) ys.push(y);

  return (
    <svg
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         CANVAS_W,
        height:        CANVAS_H,
        pointerEvents: 'none',
        zIndex:        1,        // just above the board background, below graphics
        overflow:      'visible',
      }}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {gridType === 'lines' ? (
        <g>
          {/* Vertical lines */}
          {xs.map(x => (
            <line
              key={`v${x}`}
              x1={x} y1={0} x2={x} y2={CANVAS_H}
              stroke={x === 0 || x === CANVAS_W ? axisColour : colour}
              strokeWidth={x === 0 || x === CANVAS_W ? 1.5 : 0.75}
            />
          ))}
          {/* Horizontal lines */}
          {ys.map(y => (
            <line
              key={`h${y}`}
              x1={0} y1={y} x2={CANVAS_W} y2={y}
              stroke={y === 0 || y === CANVAS_H ? axisColour : colour}
              strokeWidth={y === 0 || y === CANVAS_H ? 1.5 : 0.75}
            />
          ))}
        </g>
      ) : (
        /* Dots at every grid intersection */
        <g>
          {xs.map(x =>
            ys.map(y => {
              const isCorner = (x === 0 || x === CANVAS_W) && (y === 0 || y === CANVAS_H);
              return (
                <circle
                  key={`d${x}_${y}`}
                  cx={x}
                  cy={y}
                  r={isCorner ? 2.5 : 1.8}
                  fill={isCorner ? axisColour : colour}
                />
              );
            })
          )}
        </g>
      )}

      {/* Centre crosshair — always shown regardless of gridType */}
      <line
        x1={CANVAS_W / 2} y1={CANVAS_H / 2 - 10}
        x2={CANVAS_W / 2} y2={CANVAS_H / 2 + 10}
        stroke={axisColour} strokeWidth={1} opacity={0.6}
      />
      <line
        x1={CANVAS_W / 2 - 10} y1={CANVAS_H / 2}
        x2={CANVAS_W / 2 + 10} y2={CANVAS_H / 2}
        stroke={axisColour} strokeWidth={1} opacity={0.6}
      />
    </svg>
  );
}
