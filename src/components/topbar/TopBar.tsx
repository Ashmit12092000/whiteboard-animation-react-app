// @ts-nocheck
import { useState } from 'react';
import { useStore } from '../../store';
import { useMobile } from '../../hooks/useMobile';
import PixabayModal from '../dialogs/PixabayModal';
import LoadJsonButton from '../shared/LoadJsonButton';

// ── Generic dropdown menu ─────────────────────────────────────────────────────
function MenuDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? '#1e293b' : 'none', border: 'none',
          padding: '4px 10px', borderRadius: 4,
          color: '#cbd5e1', fontSize: 13, cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
        onMouseLeave={e => !open && (e.currentTarget.style.background = 'none')}
      >
        {label}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 100,
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 8, minWidth: 190, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            marginTop: 4,
          }}>
            {items.map((item, i) =>
              item === '---' ? (
                <div key={i} style={{ height: 1, background: '#334155', margin: '2px 0' }} />
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
                  <span style={{ width: 18, textAlign: 'center' }}>{item.icon}</span>
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

// ── Save button with dropdown ─────────────────────────────────────────────────
function SaveDropdown({ onSave, onSaveJson }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      {/* Main save button */}
      <button
        onClick={() => { onSave(); }}
        title="Save (Ctrl+S)"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px',
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
      {/* Chevron/dropdown toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        title="More save options"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '4px 6px',
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
      >
        ▾
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 100,
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 8, minWidth: 190, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            marginTop: 4,
          }}>
            <button
              onClick={() => { onSave(); setOpen(false); }}
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
              <span style={{ width: 18, textAlign: 'center' }}>💾</span>
              <span style={{ flex: 1 }}>Save</span>
              <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>Ctrl+S</span>
            </button>
            <button
              onClick={() => { onSaveJson(); setOpen(false); }}
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
              <span style={{ width: 18, textAlign: 'center' }}>📄</span>
              <span style={{ flex: 1 }}>Save as JSON</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Load JSON button ──────────────────────────────────────────────────────────
// ── Small action button used inline in the top bar ────────────────────────────
function TopBarActionBtn({ color, onClick, icon, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px',
        background: color + '18',
        border: `1px solid ${color}50`,
        borderRadius: 6, color,
        fontSize: 12, cursor: 'pointer', fontWeight: 700,
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = color + '38'}
      onMouseLeave={e => e.currentTarget.style.background = color + '18'}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {children}
    </button>
  );
}

// ── Main TopBar ───────────────────────────────────────────────────────────────
export default function TopBar() {
  const isMobile = useMobile();
  const [pixabayOpen, setPixabayOpen] = useState(false);

  const project               = useStore(s => s.project);
  const view                  = useStore(s => s.view);
  const saveProject           = useStore(s => s.saveProject);
  const saveProjectAsJson     = useStore(s => s.saveProjectAsJson);
  const loadProjectFromJson   = useStore(s => s.loadProjectFromJson);
  const closeProject          = useStore(s => s.closeProject);
  const hasUnsavedChanges      = useStore(s => s.hasUnsavedChanges);
  const openPreviewModal      = useStore(s => s.openPreviewModal);
  const openProjectSettings   = useStore(s => s.openProjectSettings);
  const openSceneSettings     = useStore(s => s.openSceneSettings);
  const undo                  = useStore(s => s.undo);
  const redo                  = useStore(s => s.redo);
  const undoStack             = useStore(s => s.undoStack);
  const redoStack             = useStore(s => s.redoStack);
  const selectedGraphicId     = useStore(s => s.selectedGraphicId);
  const deleteGraphic         = useStore(s => s.deleteGraphic);

  const menus = view === 'editor' ? [
    {
      label: 'File',
      items: [
        { icon: '💾', label: 'Save', shortcut: 'Ctrl+S', action: saveProject },
        { icon: '📄', label: 'Save as JSON', action: saveProjectAsJson },
        '---',
        { icon: '▶', label: 'Preview', action: openPreviewModal },
        '---',
        { icon: '⚙', label: 'Project Settings', action: openProjectSettings },
        '---',
        { icon: '🏠', label: 'Back to Home', action: closeProject },
      ],
    },
    {
      label: 'Edit',
      items: [
        { icon: '↩', label: 'Undo', shortcut: 'Ctrl+Z', action: undo, disabled: undoStack.length === 0 },
        { icon: '↪', label: 'Redo', shortcut: 'Ctrl+Y', action: redo, disabled: redoStack.length === 0 },
        '---',
        { icon: '🗑', label: 'Delete Selected', shortcut: 'Del', danger: true,
          action: () => selectedGraphicId && deleteGraphic(selectedGraphicId) },
      ],
    },
    {
      label: 'Help',
      items: [
        { icon: 'ℹ', label: 'About Whiteboard Animation', action: () => window.open('https://github.com/Rsverma/OpenDoodler', '_blank') },
      ],
    },
  ] : [];

  // ── Go back to the launch/home screen, warning about unsaved changes ──────────
  const handleGoHome = () => {
    if (view === 'editor' && hasUnsavedChanges()) {
      const ok = window.confirm('You have unsaved changes that will be lost. Leave anyway?');
      if (!ok) return;
    }
    closeProject();
  };

  // On mobile, the editor provides its own compact top bar
  if (isMobile && view === 'editor') return null;

  return (
    <>
    <div style={{
      height: 46,
      background: '#0f172a',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 8,
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Logo */}
      <div
        onClick={handleGoHome}
        title="Back to home"
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 20, marginRight: 4 }}>✏️</span>
        {!isMobile && (
          <span style={{
            fontFamily: 'Georgia, serif',
            fontSize: 16, fontWeight: 700,
            color: '#f1f5f9', marginRight: 8,
            letterSpacing: -0.3,
          }}>
            OpenDoodler
          </span>
        )}
      </div>

      {/* Divider */}
      {menus.length > 0 && (
        <div style={{ width: 1, height: 20, background: '#1e293b', marginRight: 4 }} />
      )}

      {/* Dropdown menus (File, Edit, Help) */}
      {menus.map(m => (
        <MenuDropdown key={m.label} label={m.label} items={m.items} />
      ))}

      {/* Center title */}
      {view === 'editor' && project && (
        <div style={{ flex: 1, textAlign: 'center', color: '#f59e0b', fontFamily: 'Georgia, serif', fontSize: isMobile ? 12 : 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.title}
        </div>
      )}

      {view === 'launch' && <div style={{ flex: 1 }} />}

      {/* ── Right-side editor action buttons ─────────────────────────── */}
      {view === 'editor' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

          {/* Move / Scene / Project buttons */}
          {!isMobile && (
            <>
              <TopBarActionBtn
                color="#8b5cf6"
                icon="🎬"
                onClick={openSceneSettings}
                title="Scene settings"
              >
                Scene
              </TopBarActionBtn>
              <TopBarActionBtn
                color="#f59e0b"
                icon="⚙"
                onClick={openProjectSettings}
                title="Project settings"
              >
                Project
              </TopBarActionBtn>
            </>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: '#334155' }} />

          {/* Preview */}
          <TopBarActionBtn
            color="#3b82f6"
            icon="▶"
            onClick={openPreviewModal}
            title="Preview animation"
          >
            {!isMobile && 'View'}
          </TopBarActionBtn>

          {/* Save dropdown (Save + Save as JSON) */}
          <SaveDropdown onSave={saveProject} onSaveJson={saveProjectAsJson} />

          {/* Load JSON */}
          <LoadJsonButton onLoad={loadProjectFromJson} />

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: '#334155' }} />

          {/* Animation link */}
          <button
            onClick={() => { window.location.href = '/AnimeWhite/animate/'; }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', background: '#1a2e1a',
              border: '1px solid #16a34a55', borderRadius: 5,
              color: '#4ade80', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#14532d'}
            onMouseLeave={e => e.currentTarget.style.background = '#1a2e1a'}
          >
            <span style={{ fontSize: 14 }}>🎬</span>
            {!isMobile && 'Animation'}
          </button>

          {/* Pixabay */}
          <button
            onClick={() => setPixabayOpen(true)}
            title="Search Pixabay images"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', background: '#1e3a5f',
              border: '1px solid #2563eb55', borderRadius: 5,
              color: '#60a5fa', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#1e40af'}
            onMouseLeave={e => e.currentTarget.style.background = '#1e3a5f'}
          >
            <img
              src={`${import.meta.env.BASE_URL}pixabay-icon.png`}
              alt="Pixabay"
              style={{
                width: 18, height: 18, objectFit: 'cover',
                borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                padding: 1, background: '#fff',
              }}
            />
            {!isMobile && 'Pixabay'}
          </button>

          {/* Undo / Redo */}
          <div style={{ display: 'flex', gap: 4 }}>
            <IconBtn title={`Undo (${undoStack.length})`} disabled={undoStack.length === 0} onClick={undo}>↩</IconBtn>
            <IconBtn title={`Redo (${redoStack.length})`} disabled={redoStack.length === 0} onClick={redo}>↪</IconBtn>
          </div>

          {/* Board badge */}
          {project && !isMobile && (
            <span style={{
              fontSize: 11, color: '#64748b', padding: '2px 8px',
              background: '#1e293b', borderRadius: 4,
            }}>
              {project.boardType}
            </span>
          )}
        </div>
      )}
    </div>

    {pixabayOpen && <PixabayModal onClose={() => setPixabayOpen(false)} />}
    </>
  );
}

function IconBtn({ children, onClick, disabled, title }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28, height: 28, background: 'none',
        border: '1px solid #334155', borderRadius: 5,
        color: disabled ? '#334155' : '#94a3b8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = '#1e293b')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {children}
    </button>
  );
}