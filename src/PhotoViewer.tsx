import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import './PhotoViewer.css'
import type { BoundaryPhoto } from './types'

type Point = { x: number; y: number }
type DragKind = 'swipe' | 'pan' | 'pinch'

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
const SWIPE_DISTANCE = 56
const DOUBLE_TAP_INTERVAL = 350
const DOUBLE_TAP_DISTANCE = 40
const ZOOM_STEP = 0.5

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
  const initialPhotoId = useRef(photos[activeIndex]?.id)
  const initialIndex = Math.max(0, photos.findIndex((item) => item.id === initialPhotoId.current))
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [committedScale, setCommittedScale] = useState(MIN_SCALE)

  const dialogRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<number | null>(null)
  const transitionCleanupRef = useRef<(() => void) | null>(null)
  const imageTransitionCleanupRef = useRef<(() => void) | null>(null)
  const pendingSlideRef = useRef<-1 | 0 | 1 | null>(null)
  const currentIndexRef = useRef(initialIndex)
  const pointersRef = useRef(new Map<number, Point>())
  const dragRef = useRef<DragKind | null>(null)
  const originRef = useRef<Point>({ x: 0, y: 0 })
  const panOriginRef = useRef<Point>({ x: 0, y: 0 })
  const pinchRef = useRef({ distance: 1, scale: 1, center: { x: 0, y: 0 } })
  const swipeXRef = useRef(0)
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
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      transitionCleanupRef.current?.()
      imageTransitionCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (photos.length === 0) {
      onClose()
      return
    }
    if (currentIndexRef.current >= photos.length) {
      const nextIndex = photos.length - 1
      currentIndexRef.current = nextIndex
      setCurrentIndex(nextIndex)
      onIndexChange(nextIndex)
    }
  }, [photos.length, onClose, onIndexChange])

  const renderTransforms = () => {
    frameRef.current = null
    if (stripRef.current) {
      stripRef.current.style.transform = `translate3d(calc(-100% / 3 + ${swipeXRef.current}px), 0, 0)`
    }
    if (imageRef.current) {
      imageRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${scaleRef.current})`
    }
  }

  const requestTransforms = () => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(renderTransforms)
  }

  const clearTransition = () => {
    transitionCleanupRef.current?.()
    transitionCleanupRef.current = null
    pendingSlideRef.current = null
    stripRef.current?.classList.remove('is-animating')
    imageRef.current?.classList.remove('is-animating')
    imageTransitionCleanupRef.current?.()
    imageTransitionCleanupRef.current = null
  }

  const resetView = () => {
    scaleRef.current = MIN_SCALE
    panRef.current = { x: 0, y: 0 }
    swipeXRef.current = 0
    setCommittedScale(MIN_SCALE)
    requestTransforms()
  }

  useLayoutEffect(() => {
    clearTransition()
    resetView()
  }, [currentIndex])

  const photo = photos[currentIndex]

  const getPanBounds = (scale: number) => {
    const surface = surfaceRef.current
    const image = imageRef.current
    if (!surface || !image || !image.naturalWidth || !image.naturalHeight) return { x: 0, y: 0 }
    const fit = Math.min(surface.clientWidth / image.naturalWidth, surface.clientHeight / image.naturalHeight)
    const width = image.naturalWidth * fit * scale
    const height = image.naturalHeight * fit * scale
    return {
      x: Math.max(0, (width - surface.clientWidth) / 2),
      y: Math.max(0, (height - surface.clientHeight) / 2),
    }
  }

  const constrainPan = (point: Point, scale = scaleRef.current) => {
    const bounds = getPanBounds(scale)
    return {
      x: clamp(point.x, -bounds.x, bounds.x),
      y: clamp(point.y, -bounds.y, bounds.y),
    }
  }

  const animateImage = () => {
    const image = imageRef.current
    if (!image) return
    imageTransitionCleanupRef.current?.()
    image.classList.add('is-animating')
    const finish = (event: TransitionEvent) => {
      if (event.target !== image || event.propertyName !== 'transform') return
      image.removeEventListener('transitionend', finish)
      image.classList.remove('is-animating')
      imageTransitionCleanupRef.current = null
    }
    image.addEventListener('transitionend', finish)
    imageTransitionCleanupRef.current = () => image.removeEventListener('transitionend', finish)
  }

  const setZoom = (nextScale: number, focalPoint?: Point) => {
    const surface = surfaceRef.current
    const oldScale = scaleRef.current
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE)
    if (focalPoint && surface && scale > MIN_SCALE) {
      const rect = surface.getBoundingClientRect()
      const local = { x: focalPoint.x - rect.left - rect.width / 2, y: focalPoint.y - rect.top - rect.height / 2 }
      const ratio = scale / oldScale
      panRef.current = constrainPan({
        x: local.x - (local.x - panRef.current.x) * ratio,
        y: local.y - (local.y - panRef.current.y) * ratio,
      }, scale)
    } else if (scale === MIN_SCALE) {
      panRef.current = { x: 0, y: 0 }
    } else {
      panRef.current = constrainPan(panRef.current, scale)
    }
    scaleRef.current = scale
    setCommittedScale(scale)
    animateImage()
    requestTransforms()
  }

  const commitIndex = (direction: -1 | 1) => {
    clearTransition()
    const nextIndex = currentIndexRef.current + direction
    if (nextIndex < 0 || nextIndex >= photos.length) {
      swipeXRef.current = 0
      requestTransforms()
      return
    }
    currentIndexRef.current = nextIndex
    setCurrentIndex(nextIndex)
    onIndexChange(nextIndex)
  }

  const animateSwipe = (direction: -1 | 0 | 1) => {
    const strip = stripRef.current
    const surface = surfaceRef.current
    if (!strip || !surface) return
    clearTransition()
    pendingSlideRef.current = direction
    strip.classList.add('is-animating')
    swipeXRef.current = direction === 0 ? 0 : -direction * surface.clientWidth
    requestTransforms()
    const finish = (event: TransitionEvent) => {
      if (event.target !== strip || event.propertyName !== 'transform') return
      clearTransition()
      if (direction === 0) {
        swipeXRef.current = 0
        requestTransforms()
      } else {
        commitIndex(direction)
      }
    }
    strip.addEventListener('transitionend', finish)
    transitionCleanupRef.current = () => strip.removeEventListener('transitionend', finish)
  }

  const changePhoto = (direction: -1 | 1) => {
    if (pendingSlideRef.current !== null) {
      const pendingDirection = pendingSlideRef.current
      clearTransition()
      if (pendingDirection !== 0) commitIndex(pendingDirection)
      else {
        swipeXRef.current = 0
        requestTransforms()
      }
      return
    }
    if (scaleRef.current !== MIN_SCALE) resetView()
    if (currentIndexRef.current + direction < 0 || currentIndexRef.current + direction >= photos.length) return
    animateSwipe(direction)
  }

  const endGesture = (cancelled: boolean) => {
    const kind = dragRef.current
    dragRef.current = null
    pointersRef.current.clear()
    if (kind === 'swipe') {
      const width = surfaceRef.current?.clientWidth ?? 0
      const direction = swipeXRef.current < 0 ? 1 : -1
      const validDirection = currentIndexRef.current + direction >= 0 && currentIndexRef.current + direction < photos.length
      animateSwipe(!cancelled && validDirection && Math.abs(swipeXRef.current) >= Math.min(SWIPE_DISTANCE, width * 0.2) ? direction : 0)
    } else if (kind === 'pan' || kind === 'pinch') {
      scaleRef.current = clamp(scaleRef.current, MIN_SCALE, MAX_SCALE)
      panRef.current = scaleRef.current === MIN_SCALE ? { x: 0, y: 0 } : constrainPan(panRef.current)
      setCommittedScale(scaleRef.current)
      animateImage()
      requestTransforms()
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    clearTransition()
    swipeXRef.current = 0
    requestTransforms()
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') event.currentTarget.setPointerCapture(event.pointerId)
    if (pointersRef.current.size === 1) {
      originRef.current = { x: event.clientX, y: event.clientY }
      panOriginRef.current = panRef.current
      dragRef.current = scaleRef.current > MIN_SCALE ? 'pan' : 'swipe'
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      dragRef.current = 'pinch'
      swipeXRef.current = 0
      pinchRef.current = {
        distance: Math.max(1, distance(a, b)),
        scale: scaleRef.current,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      requestTransforms()
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (dragRef.current === 'pinch' && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const nextScale = clamp(pinchRef.current.scale * distance(a, b) / pinchRef.current.distance, MIN_SCALE, MAX_SCALE)
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const ratio = nextScale / scaleRef.current
      const rect = surfaceRef.current?.getBoundingClientRect()
      if (rect) {
        const local = { x: center.x - rect.left - rect.width / 2, y: center.y - rect.top - rect.height / 2 }
        panRef.current = constrainPan({
          x: local.x - (local.x - panRef.current.x) * ratio + center.x - pinchRef.current.center.x,
          y: local.y - (local.y - panRef.current.y) * ratio + center.y - pinchRef.current.center.y,
        }, nextScale)
      }
      pinchRef.current.center = center
      scaleRef.current = nextScale
    } else if (dragRef.current === 'pan') {
      panRef.current = constrainPan({
        x: panOriginRef.current.x + event.clientX - originRef.current.x,
        y: panOriginRef.current.y + event.clientY - originRef.current.y,
      })
    } else if (dragRef.current === 'swipe') {
      const raw = event.clientX - originRef.current.x
      const atEdge = (raw > 0 && currentIndexRef.current === 0) || (raw < 0 && currentIndexRef.current === photos.length - 1)
      swipeXRef.current = atEdge ? raw * 0.28 : raw
    }
    requestTransforms()
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.delete(event.pointerId)
    if (dragRef.current === 'pinch') {
      endGesture(cancelled)
    } else if (pointersRef.current.size === 0) {
      const moved = distance(originRef.current, { x: event.clientX, y: event.clientY })
      const tap = { time: event.timeStamp, point: { x: event.clientX, y: event.clientY } }
      const previousTap = lastTapRef.current
      endGesture(cancelled)
      if (!cancelled && moved < 8 && previousTap && tap.time - previousTap.time <= DOUBLE_TAP_INTERVAL && distance(tap.point, previousTap.point) <= DOUBLE_TAP_DISTANCE) {
        lastTapRef.current = null
        setZoom(scaleRef.current > MIN_SCALE ? MIN_SCALE : DOUBLE_TAP_SCALE, tap.point)
      } else {
        lastTapRef.current = !cancelled && moved < 8 ? tap : null
      }
    }
  }

  const handleLostCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) endGesture(true)
  }

  const slides = [photos[currentIndex - 1], photo, photos[currentIndex + 1]]

  if (!photo) return null

  return (
    <div ref={dialogRef} className="photo-viewer" role="dialog" aria-modal="true" aria-label={`${boundaryPointName}の写真`} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
        else if (event.key === 'ArrowLeft') changePhoto(-1)
        else if (event.key === 'ArrowRight') changePhoto(1)
      }}>
      <div ref={surfaceRef} className={`photo-viewer-surface${committedScale > MIN_SCALE ? ' is-zoomed' : ''}`}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={(event) => handlePointerEnd(event)} onPointerCancel={(event) => handlePointerEnd(event, true)}
        onLostPointerCapture={handleLostCapture}>
        <div ref={stripRef} className="photo-viewer-strip">
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
  )
}

export default PhotoViewer
