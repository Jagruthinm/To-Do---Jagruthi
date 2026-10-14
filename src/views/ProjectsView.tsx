import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronRight } from '@tabler/icons-react'
import { IllustrationProjects } from '@/components/ui/illustrations'
import { TopBar } from '@/components/layout/TopBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { apiGet, apiPatch, apiDelete } from '@/hooks/useApi'
import type { Area, Project } from '@/types'
import styles from './ProjectsView.module.css'

const PRESET_COLORS = ['#1D9E75', '#4B96FF', '#FF6B6B', '#FFB347', '#9B59B6', '#1ABC9C']

interface ContextMenuState {
  project: Project
  x: number
  y: number
  mode: 'main' | 'rename' | 'color'
  renameValue: string
}

export function ProjectsView() {
  const [areas, setAreas] = useState<Area[]>([])
  const [unassigned, setUnassigned] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Long-press tracking refs
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const pointerDownCoords = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiGet<Area[]>('/api/areas'),
      apiGet<Project[]>('/api/projects'),
    ]).then(([areaList, allProjects]) => {
      setAreas(areaList)
      setUnassigned(allProjects.filter(p => !p.area_id))
    }).finally(() => setLoading(false))
  }, [])

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (ctxMenu?.mode === 'rename') {
      requestAnimationFrame(() => renameInputRef.current?.focus())
    }
  }, [ctxMenu?.mode])

  // Close context menu when clicking/tapping outside it
  useEffect(() => {
    if (!ctxMenu) return
    function onOutside(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [ctxMenu])

  // ── Area collapse toggle ──

  function toggleArea(areaId: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(areaId)) next.delete(areaId)
      else next.add(areaId)
      return next
    })
  }

  // ── Helpers to update a project across whichever bucket it lives in ──

  function updateProjectInState(projectId: string, updater: (p: Project) => Project) {
    setAreas(prev => prev.map(a => ({
      ...a,
      projects: (a.projects ?? []).map(p => p.id === projectId ? updater(p) : p),
    })))
    setUnassigned(prev => prev.map(p => p.id === projectId ? updater(p) : p))
  }

  function removeProjectFromState(projectId: string) {
    setAreas(prev => prev.map(a => ({
      ...a,
      projects: (a.projects ?? []).filter(p => p.id !== projectId),
    })))
    setUnassigned(prev => prev.filter(p => p.id !== projectId))
  }

  // ── Context menu positioning ──

  function openContextMenu(project: Project, clientX: number, clientY: number) {
    const x = Math.min(clientX, window.innerWidth - 168)
    const y = Math.min(clientY, window.innerHeight - 220)
    setCtxMenu({ project, x, y, mode: 'main', renameValue: project.name })
  }

  // ── Long-press (mobile) ──

  function onCardPointerDown(e: React.PointerEvent, project: Project) {
    if (e.pointerType === 'mouse') return
    pointerDownCoords.current = { x: e.clientX, y: e.clientY }
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      openContextMenu(project, e.clientX, e.clientY)
    }, 500)
  }

  function onCardPointerMove(e: React.PointerEvent) {
    if (!longPressTimer.current || !pointerDownCoords.current) return
    const moved = Math.hypot(
      e.clientX - pointerDownCoords.current.x,
      e.clientY - pointerDownCoords.current.y,
    )
    if (moved > 8) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      pointerDownCoords.current = null
    }
  }

  function onCardPointerUp() {
    clearTimeout(longPressTimer.current!)
    longPressTimer.current = null
    pointerDownCoords.current = null
  }

  // ── Right-click (desktop) ──

  function onCardContextMenu(e: React.MouseEvent, project: Project) {
    e.preventDefault()
    openContextMenu(project, e.clientX, e.clientY)
  }

  // ── Normal tap: navigate (unless long-press fired) ──

  function onCardClick(projectId: string) {
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    navigate(`/projects/${projectId}`)
  }

  // ── Context menu actions ──

  const handleRename = useCallback(async () => {
    if (!ctxMenu) return
    const name = ctxMenu.renameValue.trim()
    if (!name || name === ctxMenu.project.name) { setCtxMenu(null); return }
    const projectId = ctxMenu.project.id
    const originalName = ctxMenu.project.name
    updateProjectInState(projectId, p => ({ ...p, name }))
    setCtxMenu(null)
    try {
      await apiPatch(`/api/projects/${projectId}`, { name })
    } catch {
      updateProjectInState(projectId, p => ({ ...p, name: originalName }))
    }
  }, [ctxMenu])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleColorSelect = useCallback(async (color: string) => {
    if (!ctxMenu) return
    const projectId = ctxMenu.project.id
    const originalColor = ctxMenu.project.color
    updateProjectInState(projectId, p => ({ ...p, color }))
    setCtxMenu(null)
    try {
      await apiPatch(`/api/projects/${projectId}`, { color })
    } catch {
      updateProjectInState(projectId, p => ({ ...p, color: originalColor }))
    }
  }, [ctxMenu])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleArchive = useCallback(async () => {
    if (!ctxMenu) return
    const projectId = ctxMenu.project.id
    const project = ctxMenu.project
    const ownerArea = areas.find(a => (a.projects ?? []).some(p => p.id === projectId))
    removeProjectFromState(projectId)
    setCtxMenu(null)
    try {
      await apiPatch(`/api/projects/${projectId}`, { archived_at: Math.floor(Date.now() / 1000) })
    } catch {
      if (ownerArea) {
        setAreas(prev => prev.map(a => a.id === ownerArea.id
          ? { ...a, projects: [...(a.projects ?? []), project] }
          : a
        ))
      } else {
        setUnassigned(prev => [...prev, project])
      }
    }
  }, [ctxMenu, areas])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteProject = useCallback(async () => {
    if (!ctxMenu) return
    const projectId = ctxMenu.project.id
    const project = ctxMenu.project
    const ownerArea = areas.find(a => (a.projects ?? []).some(p => p.id === projectId))
    removeProjectFromState(projectId)
    setCtxMenu(null)
    try {
      await apiDelete(`/api/projects/${projectId}`)
    } catch {
      if (ownerArea) {
        setAreas(prev => prev.map(a => a.id === ownerArea.id
          ? { ...a, projects: [...(a.projects ?? []), project] }
          : a
        ))
      } else {
        setUnassigned(prev => [...prev, project])
      }
    }
  }, [ctxMenu, areas])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Project card renderer ──

  const renderCard = (p: Project) => (
    <button
      key={p.id}
      className={styles.card}
      onClick={() => onCardClick(p.id)}
      onPointerDown={e => onCardPointerDown(e, p)}
      onPointerMove={onCardPointerMove}
      onPointerUp={onCardPointerUp}
      onPointerCancel={onCardPointerUp}
      onContextMenu={e => onCardContextMenu(e, p)}
    >
      <div className={styles.cardHeader}>
        <div className={styles.colorDot} style={{ background: p.color || 'var(--brand)' }} />
        <span className={styles.name}>{p.name}</span>
        <IconChevronRight size={14} className={styles.chevron} aria-hidden />
      </div>
      {p.description && <p className={styles.desc}>{p.description}</p>}
      <div className={styles.stats}>
        <span>{p.task_count ?? 0} tasks</span>
      </div>
    </button>
  )

  const totalProjects = areas.reduce((n, a) => n + (a.projects?.length ?? 0), 0) + unassigned.length

  return (
    <div className={styles.view}>
      <TopBar title="Projects" />

      <div className={styles.content}>
        {loading && <p className={styles.loading}>Loading…</p>}

        {!loading && totalProjects === 0 && (
          <EmptyState
            icon={<IllustrationProjects />}
            title="No projects yet"
            subtitle="Tap + to create your first project."
          />
        )}

        {areas.map(area => (
          <div key={area.id} className={styles.areaSection}>
            <button
              className={styles.areaHeader}
              onClick={() => toggleArea(area.id)}
              aria-expanded={!collapsed.has(area.id)}
            >
              <div className={styles.areaColorDot} style={{ background: area.color || 'var(--brand)' }} />
              <span className={styles.areaName}>{area.name}</span>
              <span className={styles.areaCount}>{area.projects?.length ?? 0}</span>
              <IconChevronRight
                size={14}
                className={`${styles.areaChevron} ${collapsed.has(area.id) ? '' : styles.areaChevronOpen}`}
                aria-hidden
              />
            </button>
            {!collapsed.has(area.id) && (
              <div className={styles.grid}>
                {(area.projects ?? []).map(renderCard)}
              </div>
            )}
          </div>
        ))}

        {unassigned.length > 0 && (
          <div className={styles.areaSection}>
            <button
              className={styles.areaHeader}
              onClick={() => toggleArea('__unassigned')}
              aria-expanded={!collapsed.has('__unassigned')}
            >
              <span className={`${styles.areaName} ${styles.areaNameMuted}`}>No Area</span>
              <span className={styles.areaCount}>{unassigned.length}</span>
              <IconChevronRight
                size={14}
                className={`${styles.areaChevron} ${collapsed.has('__unassigned') ? '' : styles.areaChevronOpen}`}
                aria-hidden
              />
            </button>
            {!collapsed.has('__unassigned') && (
              <div className={styles.grid}>
                {unassigned.map(renderCard)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating context menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className={styles.ctxMenu}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
          aria-label="Project actions"
        >
          {ctxMenu.mode === 'main' && (
            <>
              <button className={styles.ctxItem} role="menuitem" onClick={() => setCtxMenu(m => m ? { ...m, mode: 'rename' } : m)}>
                Rename
              </button>
              <button className={styles.ctxItem} role="menuitem" onClick={() => setCtxMenu(m => m ? { ...m, mode: 'color' } : m)}>
                Change colour
              </button>
              <div className={styles.ctxDivider} />
              <button className={styles.ctxItem} role="menuitem" onClick={handleArchive}>
                Archive
              </button>
              <button className={`${styles.ctxItem} ${styles.ctxDanger}`} role="menuitem" onClick={handleDeleteProject}>
                Delete
              </button>
            </>
          )}

          {ctxMenu.mode === 'rename' && (
            <div className={styles.ctxRename}>
              <input
                ref={renameInputRef}
                className={styles.ctxRenameInput}
                value={ctxMenu.renameValue}
                onChange={e => setCtxMenu(m => m ? { ...m, renameValue: e.target.value } : m)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setCtxMenu(null) }}
                onBlur={handleRename}
                placeholder="Project name"
              />
            </div>
          )}

          {ctxMenu.mode === 'color' && (
            <div className={styles.ctxColors}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={`${styles.ctxColorSwatch} ${ctxMenu.project.color === c ? styles.ctxColorActive : ''}`}
                  style={{ background: c }}
                  onClick={() => handleColorSelect(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
