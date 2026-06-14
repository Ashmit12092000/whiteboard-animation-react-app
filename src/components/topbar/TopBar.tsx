// @ts-nocheck
import { useState, useRef } from 'react';
import { useStore } from '../../store';
import { useMobile } from '../../hooks/useMobile';
import PixabayModal from '../dialogs/PixabayModal';
import LoadJsonButton from '../shared/LoadJsonButton';

// ── Tokens ────────────────────────────────────────────────────────────────────
const T = {
  bg:      '#0f172a',
  border:  '#1e293b',
  hover:   '#1e293b',
  text:    '#cbd5e1',
  muted:   '#64748b',
  divider: '#1e293b',
};

// ── Dropdown menu (File / Edit / Help) ───────────────────────────────────────
function MenuDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? T.hover : 'none', border: 'none',
          padding: '5px 9px', borderRadius: 5,
          color: T.text, fontSize: 13, cursor: 'pointer',
          transition: 'background 0.1s', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = T.hover)}
        onMouseLeave={e => !open && (e.currentTarget.style.background = 'none')}
      >
        {label}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 200,
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 9, minWidth: 200, overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            marginTop: 6,
          }}>
            {items.map((item, i) =>
              item === '---' ? (
                <div key={i} style={{ height: 1, background: '#334155', margin: '3px 0' }} />
              ) : (
                <button
                  key={i}
                  onClick={() => { item.action(); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '9px 14px',
                    background: 'none', border: 'none', textAlign: 'left',
                    color: item.danger ? '#ef4444' : '#e2e8f0',
                    fontSize: 13, cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ width: 18, textAlign: 'center', fontSize: 15 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.shortcut && (
                    <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                      {item.shortcut}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Save button with dropdown arrow ──────────────────────────────────────────
function SaveDropdown({ onSave, onSaveJson }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <button
        onClick={onSave}
        title="Save (Ctrl+S)"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 11px',
          background: '#052e16',
          border: '1px solid #16a34a55',
          borderRight: 'none',
          borderRadius: '6px 0 0 6px',
          color: '#4ade80', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#14532d'}
        onMouseLeave={e => e.currentTarget.style.background = '#052e16'}
      >
        <span style={{ fontSize: 14 }}>💾</span>
        Save
      </button>
      <button
        onClick={() => setOpen(o => !o)}
        title="More save options"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '5px 7px',
          background: open ? '#14532d' : '#052e16',
          border: '1px solid #16a34a55',
          borderLeft: '1px solid #16a34a30',
          borderRadius: '0 6px 6px 0',
          color: '#4ade80', fontSize: 10,
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#14532d'}
        onMouseLeave={e => !open && (e.currentTarget.style.background = '#052e16')}
      >▾</button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 200,
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 9, minWidth: 190, overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            marginTop: 6,
          }}>
            {[
              { icon: '💾', label: 'Save', shortcut: 'Ctrl+S', action: onSave },
              { icon: '📄', label: 'Save as JSON', action: onSaveJson },
            ].map((item, i) => (
              <button
                key={i}
                onClick={() => { item.action(); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 14px',
                  background: 'none', border: 'none', textAlign: 'left',
                  color: '#e2e8f0', fontSize: 13, cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ width: 18, textAlign: 'center' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.shortcut && (
                  <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{item.shortcut}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Small icon-only button (undo/redo) ────────────────────────────────────────
function IconBtn({ children, onClick, disabled, title }) {
  return (
    <button
      title={title} disabled={disabled} onClick={onClick}
      style={{
        width: 30, height: 30, background: 'none',
        border: '1px solid #2d3f55', borderRadius: 6,
        color: disabled ? '#2d3f55' : '#94a3b8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s', flexShrink: 0,
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = '#1e293b')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {children}
    </button>
  );
}

// ── Pill action button (Scene / Project / Hand / View) ────────────────────────
function PillBtn({ color, icon, label, onClick, title }) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 11px',
        background: color + '18',
        border: `1px solid ${color}45`,
        borderRadius: 6,
        color, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => e.currentTarget.style.background = color + '35'}
      onMouseLeave={e => e.currentTarget.style.background = color + '18'}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      {label && <span>{label}</span>}
    </button>
  );
}

// ── Thin vertical divider ─────────────────────────────────────────────────────
function Divider() {
  return <div style={{ width: 1, height: 22, background: '#253347', flexShrink: 0 }} />;
}

// ── Mobile hamburger menu ─────────────────────────────────────────────────────
function MobileMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Menu"
        style={{
          width: 36, height: 36,
          background: open ? '#1e293b' : 'none',
          border: '1px solid #334155', borderRadius: 7,
          color: '#94a3b8', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.1s',
        }}
      >
        {open ? '✕' : '☰'}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 200,
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 10, minWidth: 220, overflow: 'hidden',
            boxShadow: '0 16px 50px rgba(0,0,0,0.65)',
            marginTop: 8,
          }}>
            {items.map((item, i) =>
              item === '---' ? (
                <div key={i} style={{ height: 1, background: '#334155', margin: '3px 0' }} />
              ) : (
                <button
                  key={i}
                  onClick={() => { item.action(); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '11px 16px',
                    background: 'none', border: 'none', textAlign: 'left',
                    color: item.danger ? '#ef4444' : '#e2e8f0',
                    fontSize: 14, cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main TopBar ───────────────────────────────────────────────────────────────
export default function TopBar() {
  const isMobile = useMobile();
  const [pixabayOpen, setPixabayOpen] = useState(false);

  const project             = useStore(s => s.project);
  const view                = useStore(s => s.view);
  const saveProject         = useStore(s => s.saveProject);
  const saveProjectAsJson   = useStore(s => s.saveProjectAsJson);
  const loadProjectFromJson = useStore(s => s.loadProjectFromJson);
  const closeProject        = useStore(s => s.closeProject);
  const hasUnsavedChanges   = useStore(s => s.hasUnsavedChanges);
  const openPreviewModal    = useStore(s => s.openPreviewModal);
  const openProjectSettings = useStore(s => s.openProjectSettings);
  const openSceneSettings   = useStore(s => s.openSceneSettings);
  const openHandPanel       = useStore(s => s.openHandPanel);
  const undo                = useStore(s => s.undo);
  const redo                = useStore(s => s.redo);
  const undoStack           = useStore(s => s.undoStack);
  const redoStack           = useStore(s => s.redoStack);
  const selectedGraphicId   = useStore(s => s.selectedGraphicId);
  const deleteGraphic       = useStore(s => s.deleteGraphic);

  const handleGoHome = () => {
    if (view === 'editor' && hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Leave anyway?')) return;
    }
    closeProject();
  };

  // Desktop dropdown menus — Scene/Project/Hand/Save/Load/Pixabay live as
  // explicit buttons, so menus only carry things not duplicated there.
  const desktopMenus = view === 'editor' ? [
    {
      label: 'File',
      items: [
        { icon: '💾', label: 'Save',         shortcut: 'Ctrl+S', action: saveProject },
        { icon: '📄', label: 'Save as JSON',                     action: saveProjectAsJson },
        '---',
        { icon: '▶',  label: 'Preview',                          action: openPreviewModal },
        '---',
        { icon: '🏠', label: 'Back to Home',                     action: closeProject },
      ],
    },
    {
      label: 'Edit',
      items: [
        { icon: '↩', label: 'Undo', shortcut: 'Ctrl+Z', action: undo },
        { icon: '↪', label: 'Redo', shortcut: 'Ctrl+Y', action: redo },
        '---',
        { icon: '🗑', label: 'Delete Selected', shortcut: 'Del', danger: true,
          action: () => selectedGraphicId && deleteGraphic(selectedGraphicId) },
      ],
    },
    {
      label: 'Help',
      items: [
        { icon: 'ℹ', label: 'About OpenDoodler',
          action: () => window.open('https://github.com/Rsverma/OpenDoodler', '_blank') },
      ],
    },
  ] : [];

  // Mobile: single hamburger menu with everything
  const mobileMenuItems = view === 'editor' ? [
    { icon: '🎬', label: 'Scene Settings',   action: openSceneSettings },
    { icon: '⚙',  label: 'Project Settings', action: openProjectSettings },
    { icon: '✋', label: 'Hand Panel',        action: openHandPanel },
    '---',
    { icon: '▶',  label: 'Preview',           action: openPreviewModal },
    { icon: '💾', label: 'Save',              action: saveProject },
    { icon: '📄', label: 'Save as JSON',      action: saveProjectAsJson },
    '---',
    { icon: '↩',  label: 'Undo',              action: undo },
    { icon: '↪',  label: 'Redo',              action: redo },
    '---',
    { icon: '🖼',  label: 'Pixabay Images',   action: () => setPixabayOpen(true) },
    '---',
    { icon: '🏠', label: 'Back to Home',      action: handleGoHome },
  ] : [
    { icon: '🏠', label: 'Back to Home',      action: handleGoHome },
  ];

  // Mobile editor provides its own compact bar
  if (isMobile && view === 'editor') return null;

  return (
    <>
      <div style={{
        height: 46,
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: isMobile ? 6 : 4,
        flexShrink: 0,
        userSelect: 'none',
        minWidth: 0,
      }}>

        {/* ── Logo ──────────────────────────────────────────────── */}
        <div
          onClick={handleGoHome}
          title="Back to home"
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}
        >
          <span style={{ fontSize: 19 }}>✏️</span>
          {!isMobile && (
            <span style={{
              fontFamily: 'Georgia, serif',
              fontSize: 15, fontWeight: 700,
              color: '#f1f5f9',
              letterSpacing: -0.3,
              whiteSpace: 'nowrap',
            }}>
              OpenDoodler
            </span>
          )}
        </div>

        {/* ── Desktop dropdown menus ────────────────────────────── */}
        {!isMobile && desktopMenus.length > 0 && (
          <>
            <Divider />
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {desktopMenus.map(m => (
                <MenuDropdown key={m.label} label={m.label} items={m.items} />
              ))}
            </div>
          </>
        )}

        {/* ── Project title (center) ────────────────────────────── */}
        {view === 'editor' && project && (
          <div style={{
            flex: 1, textAlign: 'center', minWidth: 0,
            color: '#f59e0b', fontFamily: 'Georgia, serif',
            fontSize: isMobile ? 13 : 14, fontWeight: 700,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            padding: '0 8px',
          }}>
            {project.title}
          </div>
        )}

        {view === 'launch' && <div style={{ flex: 1 }} />}

        {/* ── Right-side controls ───────────────────────────────── */}
        {view === 'editor' && (
          isMobile ? (
            /* Mobile: just the hamburger */
            <MobileMenu items={mobileMenuItems} />
          ) : (
            /* Desktop: full action row */
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>

              {/* Scene / Project / Hand — icon + label pill buttons */}
              <PillBtn color="#8b5cf6" icon="🎬" label="Scene"   onClick={openSceneSettings}   title="Scene settings" />
              <PillBtn color="#f59e0b" icon="⚙"  label="Project" onClick={openProjectSettings} title="Project settings" />
              <PillBtn color="#ec4899" icon="✋" label="Hand"    onClick={openHandPanel}        title="Hand panel" />

              <Divider />

              {/* Preview */}
              <PillBtn color="#3b82f6" icon="▶" label="View" onClick={openPreviewModal} title="Preview animation" />

              <Divider />

              {/* Save + Load */}
              <SaveDropdown onSave={saveProject} onSaveJson={saveProjectAsJson} />
              <LoadJsonButton onLoad={loadProjectFromJson} />

              <Divider />

              {/* Pixabay */}
              <button
                onClick={() => setPixabayOpen(true)}
                title="Search Pixabay images"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', background: '#0d1f38',
                  border: '1px solid #2563eb45', borderRadius: 6,
                  color: '#60a5fa', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e3a5f'}
                onMouseLeave={e => e.currentTarget.style.background = '#0d1f38'}
              >
                <img
                  src={`${import.meta.env.BASE_URL}pixabay-icon.png`}
                  alt="Pixabay"
                  style={{
                    width: 16, height: 16, objectFit: 'cover',
                    borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                    background: '#fff',
                  }}
                />
                Pixabay
              </button>

              <Divider />

              {/* Undo / Redo */}
              <IconBtn title={`Undo (${undoStack.length})`} disabled={undoStack.length === 0} onClick={undo}>↩</IconBtn>
              <IconBtn title={`Redo (${redoStack.length})`} disabled={redoStack.length === 0} onClick={redo}>↪</IconBtn>

            </div>
          )
        )}
      </div>

      {pixabayOpen && <PixabayModal onClose={() => setPixabayOpen(false)} />}
    </>
  );
}