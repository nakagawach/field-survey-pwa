import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import './PhotoViewer.css'
import type { BoundaryPhoto } from './types'

type Point = { x: number; y: number }
type Gesture = 'idle' | 'pending' | 'swipe' | 'close' | 'pan' | 'pinch' | 'animating'
type ActiveAnimation = {
  element: HTMLElement
  cancel: () => void
  dispose: () => void
}

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

const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5
const ZOOM_STEP = 0.5
const DIRECTION_LOCK_DISTANCE = 8
const SWIPE_DISTANCE = 56
const CLOSE_DISTANCE = 100
const DOUBLE_TAP_INTERVAL = 350
const DOUBLE_TAP_DISTANCE = 40

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function PhotoViewer({
  photos,
  activeIndex,
  boundaryPointName,
  categories,
  onClose,
  onIndexChange,
  onDelete,
  onCategoryChange,
}: PhotoViewerProps) {
  const firstPhotoId = useRef(photos[activeIndex]?.id)
  const firstIndex = Math.max(0, photos.findIndex((item) => item.id === firstPhotoId.current))
  const [currentIndex, setCurrentIndex] = useState(firstIndex)
  const [committedScale, setCommittedScale] = useState(MIN_SCALE)

  const dialogRef = useRef<HTMLDivElement>(null)
  const photoAreaRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<number | null>(null)
  const activeAnimationRef = useRef<ActiveAnimation | null>(null)
  const indexRef = useRef(firstIndex)
  const gestureRef = useRef<Gesture>('idle')
  const pointersRef = useRef(new Map<number, Point>())
  const startRef = useRef<Point>({ x: 0, y: 0 })
  const panStartRef = useRef<Point>({ x: 0, y: 0 })
  const pinchStartRef = useRef({ distance: 1, scale: 1, center: { x: 0, y: 0 }, pan: { x: 0, y: 0 } })
  const trackXRef = useRef(0)
  const closeYRef = useRef(0)
  const scaleRef = useRef(MIN_SCALE)
  const panRef = useRef<Point>({ x: 0, y: 0 })
  const lastTapRef = useRef<{ time: number; point: Point } | null>(null)

  const urls = useMemo(() => {
    const result = new Map<string, string>()
    photos.forEach((photo) => result.set(photo.id, URL.createObjectURL(photo.blob)))
    return result
  }, [photos])

  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      activeAnimationRef.current?.dispose()
      gestureRef.current = 'idle'
      trackXRef.current = 0
      closeYRef.current = 0
    }
  }, [])

  useLayoutEffect(() => {
    const activeAnimation = activeAnimationRef.current
    if (activeAnimation && !activeAnimation.element.isConnected) activeAnimation.cancel()
  })

  useEffect(() => {
    if (photos.length === 0) {
      onClose()
      return
    }
    if (indexRef.current >= photos.length) {
      const nextIndex = photos.length - 1
      indexRef.current = nextIndex
      setCurrentIndex(nextIndex)
      onIndexChange(nextIndex)
    }
  }, [photos.length, onClose, onIndexChange])

  const renderTransforms = () => {
    frameRef.current = null
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(calc(-100% / 3 + ${trackXRef.current}px), 0, 0)`
    }
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(0, ${closeYRef.current}px, 0)`
    }
    if (dialogRef.current) {
      const height = Math.max(1, photoAreaRef.current?.clientHeight ?? 1)
      dialogRef.current.style.setProperty('--drag-opacity', String(1 - Math.min(0.72, closeYRef.current / height)))
    }
    if (imageRef.current) {
      imageRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${scaleRef.current})`
    }
  }

  const requestRender = () => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(renderTransforms)
  }

  const clearPointers = () => {
    const area = photoAreaRef.current
    const pointerIds = [...pointersRef.current.keys()]
    pointersRef.current.clear()
    if (area) {
      pointerIds.forEach((pointerId) => {
        if (area.hasPointerCapture(pointerId)) area.releasePointerCapture(pointerId)
      })
    }
    startRef.current = { x: 0, y: 0 }
    panStartRef.current = { x: 0, y: 0 }
    pinchStartRef.current = { distance: 1, scale: 1, center: { x: 0, y: 0 }, pan: { x: 0, y: 0 } }
  }

  const finishGesture = () => {
    clearPointers()
    if (gestureRef.current !== 'animating') gestureRef.current = 'idle'
  }

  const getPanBounds = (scale: number) => {
    const area = photoAreaRef.current
    const image = imageRef.current
    if (!area || !image || !image.naturalWidth || !image.naturalHeight) return { x: 0, y: 0 }
    const fit = Math.min(area.clientWidth / image.naturalWidth, area.clientHeight / image.naturalHeight)
    return {
      x: Math.max(0, (image.naturalWidth * fit * scale - area.clientWidth) / 2),
      y: Math.max(0, (image.naturalHeight * fit * scale - area.clientHeight) / 2),
    }
  }

  const constrainPan = (point: Point, scale = scaleRef.current) => {
    const bounds = getPanBounds(scale)
    return { x: clamp(point.x, -bounds.x, bounds.x), y: clamp(point.y, -bounds.y, bounds.y) }
  }

  const animate = (element: HTMLElement, complete: () => void, cancel: () => void) => {
    activeAnimationRef.current?.cancel()
    gestureRef.current = 'animating'
    element.classList.add('is-animating')
    let settled = false

    const removeListeners = () => {
      element.removeEventListener('transitionend', handleTransitionEnd)
      element.removeEventListener('transitioncancel', handleTransitionCancel)
      element.classList.remove('is-animating')
      if (activeAnimationRef.current?.element === element) activeAnimationRef.current = null
    }
    const settle = (completed: boolean) => {
      if (settled) return
      settled = true
      removeListeners()
      if (completed) complete()
      else cancel()
    }
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== element || event.propertyName !== 'transform') return
      settle(true)
    }
    const handleTransitionCancel = (event: TransitionEvent) => {
      if (event.target !== element || event.propertyName !== 'transform') return
      settle(false)
    }

    element.addEventListener('transitionend', handleTransitionEnd)
    element.addEventListener('transitioncancel', handleTransitionCancel)
    activeAnimationRef.current = {
      element,
      cancel: () => settle(false),
      dispose: () => {
        if (settled) return
        settled = true
        removeListeners()
      },
    }
  }

  const resetPhotoView = () => {
    scaleRef.current = MIN_SCALE
    panRef.current = { x: 0, y: 0 }
    setCommittedScale(MIN_SCALE)
    requestRender()
  }

  const setZoom = (requestedScale: number, focalPoint?: Point) => {
    if (gestureRef.current === 'animating') return
    const oldScale = scaleRef.current
    const nextScale = clamp(requestedScale, MIN_SCALE, MAX_SCALE)
    if (nextScale === oldScale) return
    const area = photoAreaRef.current
    if (focalPoint && area && nextScale > MIN_SCALE) {
      const rect = area.getBoundingClientRect()
      const local = { x: focalPoint.x - rect.left - rect.width / 2, y: focalPoint.y - rect.top - rect.height / 2 }
      const ratio = nextScale / oldScale
      panRef.current = constrainPan({
        x: local.x - (local.x - panRef.current.x) * ratio,
        y: local.y - (local.y - panRef.current.y) * ratio,
      }, nextScale)
    } else {
      panRef.current = nextScale === MIN_SCALE ? { x: 0, y: 0 } : constrainPan(panRef.current, nextScale)
    }
    scaleRef.current = nextScale
    setCommittedScale(nextScale)
    const image = imageRef.current
    if (!image) {
      requestRender()
      return
    }
    const finishZoom = () => {
      gestureRef.current = 'idle'
      requestRender()
    }
    animate(image, finishZoom, finishZoom)
    requestRender()
  }

  const commitIndex = (direction: -1 | 1) => {
    const nextIndex = indexRef.current + direction
    indexRef.current = nextIndex
    trackXRef.current = 0
    resetPhotoView()
    setCurrentIndex(nextIndex)
    onIndexChange(nextIndex)
    gestureRef.current = 'idle'
  }

  const animateSwipe = (direction: -1 | 0 | 1) => {
    const track = trackRef.current
    const area = photoAreaRef.current
    if (!track || !area) return finishGesture()
    const cancelSwipe = () => {
      trackXRef.current = 0
      gestureRef.current = 'idle'
      requestRender()
    }
    animate(track, () => {
      if (direction === 0) cancelSwipe()
      else commitIndex(direction)
    }, cancelSwipe)
    trackXRef.current = direction === 0 ? 0 : -direction * area.clientWidth
    requestRender()
  }

  const changePhoto = (direction: -1 | 1) => {
    if (gestureRef.current !== 'idle') return
    if (indexRef.current + direction < 0 || indexRef.current + direction >= photos.length) return
    resetPhotoView()
    animateSwipe(direction)
  }

  const endPointerGesture = (cancelled: boolean, endPoint: Point, timeStamp: number) => {
    const gesture = gestureRef.current
    const moved = distance(startRef.current, endPoint)
    clearPointers()

    if (gesture === 'swipe') {
      const direction = trackXRef.current < 0 ? 1 : -1
      const valid = indexRef.current + direction >= 0 && indexRef.current + direction < photos.length
      animateSwipe(!cancelled && valid && Math.abs(trackXRef.current) >= SWIPE_DISTANCE ? direction : 0)
      return
    }
    if (gesture === 'close') {
      const content = contentRef.current
      if (!content) return finishGesture()
      if (!cancelled && closeYRef.current >= CLOSE_DISTANCE) {
        animate(content, () => {
          gestureRef.current = 'idle'
          onClose()
        }, () => {
          closeYRef.current = 0
          gestureRef.current = 'idle'
          requestRender()
        })
        closeYRef.current = photoAreaRef.current?.clientHeight ?? window.innerHeight
      } else {
        const finishCloseSnap = () => {
          closeYRef.current = 0
          gestureRef.current = 'idle'
          requestRender()
        }
        animate(content, finishCloseSnap, finishCloseSnap)
        closeYRef.current = 0
      }
      requestRender()
      return
    }
    if (gesture === 'pan' || gesture === 'pinch') {
      scaleRef.current = clamp(scaleRef.current, MIN_SCALE, MAX_SCALE)
      panRef.current = scaleRef.current === MIN_SCALE ? { x: 0, y: 0 } : constrainPan(panRef.current)
      setCommittedScale(scaleRef.current)
      gestureRef.current = 'idle'
      requestRender()
      return
    }

    gestureRef.current = 'idle'
    if (cancelled || moved >= DIRECTION_LOCK_DISTANCE) {
      lastTapRef.current = null
      return
    }
    const tap = { time: timeStamp, point: endPoint }
    const previous = lastTapRef.current
    if (previous && tap.time - previous.time <= DOUBLE_TAP_INTERVAL && distance(tap.point, previous.point) <= DOUBLE_TAP_DISTANCE) {
      lastTapRef.current = null
      setZoom(scaleRef.current > MIN_SCALE ? MIN_SCALE : DOUBLE_TAP_SCALE, tap.point)
    } else {
      lastTapRef.current = tap
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current === 'animating' || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      gestureRef.current = 'pinch'
      trackXRef.current = 0
      closeYRef.current = 0
      pinchStartRef.current = {
        distance: Math.max(1, distance(a, b)),
        scale: scaleRef.current,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        pan: panRef.current,
      }
      requestRender()
      return
    }
    if (pointersRef.current.size !== 1) return
    startRef.current = { x: event.clientX, y: event.clientY }
    panStartRef.current = panRef.current
    gestureRef.current = scaleRef.current > MIN_SCALE ? 'pan' : 'pending'
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (gestureRef.current === 'pinch' && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const pinch = pinchStartRef.current
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const nextScale = clamp(pinch.scale * distance(a, b) / pinch.distance, MIN_SCALE, MAX_SCALE)
      const rect = photoAreaRef.current?.getBoundingClientRect()
      if (rect) {
        const local = { x: pinch.center.x - rect.left - rect.width / 2, y: pinch.center.y - rect.top - rect.height / 2 }
        const ratio = nextScale / pinch.scale
        panRef.current = constrainPan({
          x: local.x - (local.x - pinch.pan.x) * ratio + center.x - pinch.center.x,
          y: local.y - (local.y - pinch.pan.y) * ratio + center.y - pinch.center.y,
        }, nextScale)
      }
      scaleRef.current = nextScale
      requestRender()
      return
    }

    const dx = event.clientX - startRef.current.x
    const dy = event.clientY - startRef.current.y
    if (gestureRef.current === 'pending' && Math.hypot(dx, dy) >= DIRECTION_LOCK_DISTANCE) {
      if (Math.abs(dx) > Math.abs(dy)) gestureRef.current = 'swipe'
      else if (dy > 0 && event.pointerType !== 'mouse') gestureRef.current = 'close'
      else gestureRef.current = 'idle'
      lastTapRef.current = null
    }

    if (gestureRef.current === 'swipe') {
      const atEdge = (dx > 0 && indexRef.current === 0) || (dx < 0 && indexRef.current === photos.length - 1)
      trackXRef.current = atEdge ? dx * 0.28 : dx
    } else if (gestureRef.current === 'close') {
      closeYRef.current = Math.max(0, dy)
    } else if (gestureRef.current === 'pan') {
      panRef.current = constrainPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy })
    }
    requestRender()
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointersRef.current.has(event.pointerId)) return
    if (gestureRef.current === 'pinch' || pointersRef.current.size === 1) {
      endPointerGesture(cancelled, { x: event.clientX, y: event.clientY }, event.timeStamp)
    } else {
      pointersRef.current.delete(event.pointerId)
    }
  }

  const photo = photos[currentIndex]
  const slides = [photos[currentIndex - 1], photo, photos[currentIndex + 1]]
  if (!photo) return null

  return (
    <div ref={dialogRef} className="photo-viewer" role="dialog" aria-modal="true" aria-label={`${boundaryPointName}の写真`} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
        else if (event.key === 'ArrowLeft') changePhoto(-1)
        else if (event.key === 'ArrowRight') changePhoto(1)
      }}>
      <div ref={contentRef} className="photo-viewer-content">
        <div ref={photoAreaRef} className={`photo-viewer-photo-area${committedScale > MIN_SCALE ? ' is-zoomed' : ''}`}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={(event) => handlePointerEnd(event)} onPointerCancel={(event) => handlePointerEnd(event, true)}
          onLostPointerCapture={(event) => {
            if (pointersRef.current.has(event.pointerId)) handlePointerEnd(event, true)
          }}>
          <div ref={trackRef} className="photo-viewer-track">
            {slides.map((item, slot) => (
              <div className="photo-viewer-slide" key={item?.id ?? `empty-${slot}`}>
                {item && <img ref={slot === 1 ? imageRef : undefined} className="photo-viewer-image"
                  src={urls.get(item.id)} alt={item.fileName} draggable={false} decoding="async" />}
              </div>
            ))}
          </div>
        </div>

        <div className="photo-viewer-controls">
          <header className="photo-viewer-header">
            <button type="button" className="photo-viewer-round" aria-label="閉じる" onClick={onClose}>×</button>
            <div className="photo-viewer-title"><strong>{boundaryPointName}</strong><span>{currentIndex + 1} / {photos.length}</span></div>
            <div className="photo-viewer-zoom" aria-label="ズーム操作">
              <button type="button" aria-label="縮小" onClick={() => setZoom(scaleRef.current - ZOOM_STEP)}>−</button>
              <span>{Math.round(committedScale * 100)}%</span>
              <button type="button" aria-label="拡大" onClick={() => setZoom(scaleRef.current + ZOOM_STEP)}>＋</button>
            </div>
          </header>

          {currentIndex > 0 && <button type="button" className="photo-viewer-arrow photo-viewer-previous" aria-label="前の写真" onClick={() => changePhoto(-1)}>‹</button>}
          {currentIndex < photos.length - 1 && <button type="button" className="photo-viewer-arrow photo-viewer-next" aria-label="次の写真" onClick={() => changePhoto(1)}>›</button>}

          <footer className="photo-viewer-footer">
            <span className="photo-viewer-file-name" title={photo.fileName}>{photo.fileName}</span>
            <label className="photo-viewer-category"><span>写真種別</span>
              <select value={photo.category ?? ''} onChange={(event) => void onCategoryChange(photo, event.target.value)}>
                <option value="">未選択</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <button type="button" className="photo-viewer-delete" onClick={async () => {
              const deleted = await onDelete(photo)
              if (deleted && photos.length === 1) onClose()
            }}>削除</button>
          </footer>
        </div>
      </div>
    </div>
  )
}

export default PhotoViewer
