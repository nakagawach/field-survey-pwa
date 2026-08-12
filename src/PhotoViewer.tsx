import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent, TransitionEvent } from 'react'

import './PhotoViewer.css'

import type { BoundaryPhoto } from './types'

type PhotoViewerProps = {
  photos: BoundaryPhoto[]
  activeIndex: number
  boundaryPointName: string
  categories: readonly string[]
  onClose: () => void
  onIndexChange: (index: number) => void
  onDelete: (photo: BoundaryPhoto) => Promise<boolean>
  onCategoryChange: (photo: BoundaryPhoto, category: string) => Promise<void>
}

type Point = { x: number; y: number }
type GestureMode = 'pending' | 'pan' | 'pinch' | 'horizontal' | 'dismiss' | null

const SWIPE_THRESHOLD = 64
const DISMISS_THRESHOLD = 120
const VELOCITY_THRESHOLD = 0.55
const AXIS_LOCK_DISTANCE = 8
const EDGE_GESTURE_WIDTH = 24
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const TAP_MOVE_TOLERANCE = 10
const DOUBLE_TAP_DELAY = 280

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)
const getDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const getMidpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function PhotoViewer(props: PhotoViewerProps) {
  const { photos, activeIndex, boundaryPointName, categories, onClose,
    onIndexChange, onDelete, onCategoryChange } = props
  const photo = photos[activeIndex]
  const [urls, setUrls] = useState<Record<number, string>>({})
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [drag, setDrag] = useState<Point>({ x: 0, y: 0 })
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)
  const scaleRef = useRef(1)
  const panRef = useRef<Point>({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, Point>())
  const mode = useRef<GestureMode>(null)
  const start = useRef({ point: { x: 0, y: 0 }, pan: { x: 0, y: 0 }, time: 0 })
  const pinchStart = useRef({ distance: 0, scale: 1, contentPoint: { x: 0, y: 0 } })
  const tapTimer = useRef<number | null>(null)
  const lastTap = useRef<{ point: Point; time: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const activeImageRef = useRef<HTMLImageElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const next: Record<number, string> = {}
    for (let index = Math.max(0, activeIndex - 1); index <= Math.min(photos.length - 1, activeIndex + 1); index += 1) {
      next[index] = URL.createObjectURL(photos[index].blob)
    }
    setUrls(next)
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url))
  }, [activeIndex, photos])

  const imageSize = () => {
    const stage = stageRef.current
    const image = activeImageRef.current
    if (!stage || !image?.naturalWidth || !image.naturalHeight) return { width: 0, height: 0 }
    const stageRatio = stage.clientWidth / stage.clientHeight
    const ratio = image.naturalWidth / image.naturalHeight
    return ratio > stageRatio
      ? { width: stage.clientWidth, height: stage.clientWidth / ratio }
      : { width: stage.clientHeight * ratio, height: stage.clientHeight }
  }

  const constrainPan = (value: Point, nextScale: number): Point => {
    const stage = stageRef.current
    const size = imageSize()
    if (!stage || !size.width) return { x: 0, y: 0 }
    const maxX = Math.max(0, (size.width * nextScale - stage.clientWidth) / 2)
    const maxY = Math.max(0, (size.height * nextScale - stage.clientHeight) / 2)
    return { x: clamp(value.x, -maxX, maxX), y: clamp(value.y, -maxY, maxY) }
  }

  const resetTransform = () => {
    scaleRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setScale(1)
    setPan({ x: 0, y: 0 })
    setDrag({ x: 0, y: 0 })
    setIsDragging(false)
    setIsAnimating(false)
    setPendingIndex(null)
    pointers.current.clear()
    mode.current = null
  }

  // Reset in the same pre-paint phase as the parent's index update. The incoming
  // slide is already centered, so it never flashes back to the old position.
  useLayoutEffect(resetTransform, [activeIndex])
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = previous }
  }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && activeIndex > 0) onIndexChange(activeIndex - 1)
      if (event.key === 'ArrowRight' && activeIndex < photos.length - 1) onIndexChange(activeIndex + 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeIndex, onClose, onIndexChange, photos.length])
  useEffect(() => () => { if (tapTimer.current !== null) window.clearTimeout(tapTimer.current) }, [])

  if (!photo) return null
  const isControl = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('button, select, label'))

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()]
    const stage = stageRef.current
    if (!a || !b || !stage) return
    const midpoint = getMidpoint(a, b)
    const rect = stage.getBoundingClientRect()
    const centered = { x: midpoint.x - rect.left - stage.clientWidth / 2, y: midpoint.y - rect.top - stage.clientHeight / 2 }
    mode.current = 'pinch'
    pinchStart.current = {
      distance: getDistance(a, b), scale: scaleRef.current,
      contentPoint: { x: (centered.x - panRef.current.x) / scaleRef.current, y: (centered.y - panRef.current.y) / scaleRef.current },
    }
    setDrag({ x: 0, y: 0 })
  }

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isControl(event.target) || event.button !== 0 || isAnimating) return
    if (!pointers.current.size && scaleRef.current === 1 &&
      (event.clientX < EDGE_GESTURE_WIDTH || event.clientX > window.innerWidth - EDGE_GESTURE_WIDTH)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
    if (pointers.current.size === 2) return startPinch()
    mode.current = scaleRef.current > 1 ? 'pan' : 'pending'
    start.current = { point: { x: event.clientX, y: event.clientY }, pan: panRef.current, time: performance.now() }
  }

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (mode.current === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const stage = stageRef.current
      if (!a || !b || !stage) return
      const nextScale = clamp(pinchStart.current.scale * getDistance(a, b) / pinchStart.current.distance, 1, MAX_SCALE)
      const midpoint = getMidpoint(a, b)
      const rect = stage.getBoundingClientRect()
      const centered = { x: midpoint.x - rect.left - stage.clientWidth / 2, y: midpoint.y - rect.top - stage.clientHeight / 2 }
      const nextPan = constrainPan({ x: centered.x - pinchStart.current.contentPoint.x * nextScale, y: centered.y - pinchStart.current.contentPoint.y * nextScale }, nextScale)
      scaleRef.current = nextScale; panRef.current = nextPan
      setScale(nextScale); setPan(nextPan)
      return
    }
    const dx = event.clientX - start.current.point.x
    const dy = event.clientY - start.current.point.y
    if (mode.current === 'pending' && Math.hypot(dx, dy) >= AXIS_LOCK_DISTANCE) {
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) mode.current = 'dismiss'
      else if (Math.abs(dx) > Math.abs(dy) * 1.2) mode.current = 'horizontal'
    }
    if (mode.current === 'pan') {
      const next = constrainPan({ x: start.current.pan.x + dx, y: start.current.pan.y + dy }, scaleRef.current)
      panRef.current = next; setPan(next)
    } else if (mode.current === 'horizontal') {
      const atEdge = (dx > 0 && activeIndex === 0) || (dx < 0 && activeIndex === photos.length - 1)
      setDrag({ x: atEdge ? dx * 0.28 : dx, y: 0 })
    } else if (mode.current === 'dismiss') {
      setDrag({ x: 0, y: Math.max(0, dy) })
    }
  }

  const doubleTap = (point: Point) => {
    if (scaleRef.current > 1) return resetTransform()
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const centered = { x: point.x - rect.left - stage.clientWidth / 2, y: point.y - rect.top - stage.clientHeight / 2 }
    const next = constrainPan({ x: centered.x * (1 - DOUBLE_TAP_SCALE), y: centered.y * (1 - DOUBLE_TAP_SCALE) }, DOUBLE_TAP_SCALE)
    scaleRef.current = DOUBLE_TAP_SCALE; panRef.current = next
    setScale(DOUBLE_TAP_SCALE); setPan(next)
  }

  const registerTap = (point: Point) => {
    const now = performance.now()
    if (lastTap.current && now - lastTap.current.time <= DOUBLE_TAP_DELAY && getDistance(lastTap.current.point, point) <= 32) {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current)
      tapTimer.current = null; lastTap.current = null; doubleTap(point); return
    }
    lastTap.current = { point, time: now }
    tapTimer.current = window.setTimeout(() => {
      setControlsVisible((value) => !value); lastTap.current = null; tapTimer.current = null
    }, DOUBLE_TAP_DELAY)
  }

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.has(event.pointerId)) return
    const gesture = mode.current
    const dx = event.clientX - start.current.point.x
    const dy = event.clientY - start.current.point.y
    const elapsed = performance.now() - start.current.time
    pointers.current.delete(event.pointerId)
    if (gesture === 'pinch' && pointers.current.size) return
    pointers.current.clear(); mode.current = null; setIsDragging(false)
    if (cancelled) { setIsAnimating(true); setDrag({ x: 0, y: 0 }); return }
    if (gesture === 'pinch' || gesture === 'pan') {
      if (scaleRef.current <= 1.01) resetTransform()
      else { const next = constrainPan(panRef.current, scaleRef.current); panRef.current = next; setPan(next) }
      return
    }
    const wasTap = Math.abs(dx) <= TAP_MOVE_TOLERANCE && Math.abs(dy) <= TAP_MOVE_TOLERANCE && elapsed < 350
    if (wasTap) { setDrag({ x: 0, y: 0 }); registerTap({ x: event.clientX, y: event.clientY }); return }
    if (gesture === 'dismiss') {
      const velocity = dy / Math.max(elapsed, 1)
      if (dy >= DISMISS_THRESHOLD || velocity >= VELOCITY_THRESHOLD) {
        setIsAnimating(true); setDrag({ x: 0, y: stageRef.current?.clientHeight ?? window.innerHeight }); setPendingIndex(-1)
      } else { setIsAnimating(true); setDrag({ x: 0, y: 0 }) }
      return
    }
    if (gesture === 'horizontal' && Math.abs(dx) >= SWIPE_THRESHOLD) {
      const next = dx > 0 ? activeIndex - 1 : activeIndex + 1
      if (next >= 0 && next < photos.length) {
        setPendingIndex(next); setIsAnimating(true)
        setDrag({ x: dx > 0 ? stageRef.current?.clientWidth ?? window.innerWidth : -(stageRef.current?.clientWidth ?? window.innerWidth), y: 0 })
        return
      }
    }
    setIsAnimating(true); setDrag({ x: 0, y: 0 })
  }

  const transitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
    if (pendingIndex === -1) return onClose()
    if (pendingIndex !== null) {
      onIndexChange(pendingIndex)
    } else {
      setIsAnimating(false)
    }
  }

  const handleDelete = async () => {
    if (!await onDelete(photo)) return
    if (photos.length === 1) onClose()
    else if (activeIndex === photos.length - 1) onIndexChange(activeIndex - 1)
  }
  const controls = `photo-viewer-controls${controlsVisible ? ' is-visible' : ''}`
  const backgroundOpacity = clamp(1 - drag.y / 420, 0.28, 1)
  const visibleIndexes = Object.keys(urls).map(Number)

  return <div ref={dialogRef} className="photo-viewer" role="dialog" aria-modal="true"
    aria-label={`${boundaryPointName}の写真`} tabIndex={-1} style={{ backgroundColor: `rgba(0, 0, 0, ${backgroundOpacity})` }}>
    <header className={`${controls} photo-viewer-header`}>
      <button type="button" className="photo-viewer-icon-button" aria-label="写真を閉じる" onClick={onClose}>×</button>
      <strong className="photo-viewer-title">{boundaryPointName}</strong>
      <span className="photo-viewer-position" aria-live="polite">{activeIndex + 1} / {photos.length}</span>
    </header>
    <div ref={stageRef} className="photo-viewer-stage" onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={finish} onPointerCancel={(event) => finish(event, true)}>
      <div className={`photo-viewer-track${isDragging ? ' is-dragging' : ''}${isAnimating ? ' is-animating' : ''}`}
        style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0)` }} onTransitionEnd={transitionEnd}>
        {visibleIndexes.map((index) => <div className="photo-viewer-slide" key={photos[index].id}
          style={{ transform: `translate3d(${(index - activeIndex) * 100}%, 0, 0)` }}>
          <img ref={index === activeIndex ? activeImageRef : undefined} className="photo-viewer-image"
            src={urls[index]} alt={photos[index].fileName} draggable="false"
            style={index === activeIndex ? { transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` } : undefined} />
        </div>)}
      </div>
      <div className={`${controls} photo-viewer-navigation`}>
        <button type="button" className="photo-viewer-nav photo-viewer-nav-previous" aria-label="前の写真" disabled={activeIndex === 0} onClick={() => onIndexChange(activeIndex - 1)}>‹</button>
        <button type="button" className="photo-viewer-nav photo-viewer-nav-next" aria-label="次の写真" disabled={activeIndex === photos.length - 1} onClick={() => onIndexChange(activeIndex + 1)}>›</button>
      </div>
    </div>
    <footer className={`${controls} photo-viewer-footer`}>
      <label className="photo-viewer-category"><span>写真種別</span><select value={photo.category || ''}
        onChange={(event) => void onCategoryChange(photo, event.target.value)}>
        <option value="">未分類</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select></label>
      <button type="button" className="photo-viewer-delete" onClick={() => void handleDelete()}>削除</button>
    </footer>
  </div>
}

export default PhotoViewer
