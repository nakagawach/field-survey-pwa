import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent, TransitionEvent } from 'react'

import './PhotoViewer.css'

import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  canNavigatePhotos,
  chooseDragMode,
  clamp,
  getDistance,
  getDoubleTapScale,
  getMidpoint,
  getPanBounds,
  getRequestedPhotoIndex,
  getSwipeIndex,
  isBaseScale,
  shouldDismiss,
} from './photoViewerGestures'
import type { GestureMode, Point } from './photoViewerGestures'
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

type Animation = 'snapImage' | 'doubleTap' | null

const EDGE_GESTURE_WIDTH = 24
const TAP_MOVE_TOLERANCE = 10
const DOUBLE_TAP_DELAY = 280
const IMAGE_TRANSITION = 'transform 180ms ease-out'

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
  const photo = photos[activeIndex]
  const [urls, setUrls] = useState<Record<number, string>>({})
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isZoomed, setIsZoomed] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const urlsRef = useRef<Record<number, { photoId: string; url: string }>>({})
  const viewerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const activeImageRef = useRef<HTMLImageElement>(null)
  const scaleRef = useRef(1)
  const isZoomedRef = useRef(false)
  const panRef = useRef<Point>({ x: 0, y: 0 })
  const dragRef = useRef<Point>({ x: 0, y: 0 })
  const pointersRef = useRef(new Map<number, Point>())
  const capturedPointersRef = useRef(new Set<number>())
  const modeRef = useRef<GestureMode>('idle')
  const animationRef = useRef<Animation>(null)
  const pendingIndexRef = useRef<number | null>(null)
  const gestureStartRef = useRef({
    point: { x: 0, y: 0 },
    pan: { x: 0, y: 0 },
    time: 0,
  })
  const pinchStartRef = useRef({
    distance: 0,
    scale: 1,
    contentPoint: { x: 0, y: 0 },
  })
  const lastTapRef = useRef<{ point: Point; time: number } | null>(null)
  const tapTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  const clearTap = () => {
    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current)
    tapTimerRef.current = null
    lastTapRef.current = null
  }

  const releaseCaptures = () => {
    const stage = stageRef.current
    if (stage) {
      capturedPointersRef.current.forEach((pointerId) => {
        if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId)
      })
    }
    capturedPointersRef.current.clear()
  }

  const renderTransforms = () => {
    rafRef.current = null
    if (activeImageRef.current) {
      activeImageRef.current.style.transform =
        `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${scaleRef.current})`
    }
    if (viewerRef.current) {
      const opacity = clamp(1 - dragRef.current.y / 420, 0.28, 1)
      viewerRef.current.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`
    }
  }

  const scheduleRender = () => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(renderTransforms)
  }

  const setImageTransition = (image: string) => {
    if (activeImageRef.current) activeImageRef.current.style.transition = image
  }

  const cleanupGestureState = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    releaseCaptures()
    clearTap()
    scaleRef.current = 1
    isZoomedRef.current = false
    panRef.current = { x: 0, y: 0 }
    dragRef.current = { x: 0, y: 0 }
    pointersRef.current.clear()
    modeRef.current = 'idle'
    animationRef.current = null
    pendingIndexRef.current = null
  }

  const normalizeVisualState = () => {
    setImageTransition('')
    stageRef.current
      ?.querySelectorAll<HTMLImageElement>('.photo-viewer-image')
      .forEach((image) => {
        image.style.transform = 'translate3d(0, 0, 0) scale(1)'
        image.style.transition = ''
      })
  }

  const resetGestureForNewPhoto = () => {
    cleanupGestureState()
    setIsZoomed(false)
    normalizeVisualState()
  }

  const syncZoomedState = () => {
    const nextIsZoomed = !canNavigatePhotos(scaleRef.current)
    if (nextIsZoomed === isZoomedRef.current) return
    isZoomedRef.current = nextIsZoomed
    setIsZoomed(nextIsZoomed)
  }

  const closeViewer = () => {
    cleanupGestureState()
    onClose()
  }

  const requestIndexChange = (nextIndex: number) => {
    const requestedIndex = getRequestedPhotoIndex(
      activeIndex,
      photos.length,
      nextIndex,
      scaleRef.current
    )
    if (requestedIndex === null) return false
    onIndexChange(requestedIndex)
    return true
  }

  useLayoutEffect(() => {
    const nextUrls: Record<number, string> = {}
    const first = Math.max(0, activeIndex - 1)
    const last = Math.min(photos.length - 1, activeIndex + 1)
    for (let index = first; index <= last; index += 1) {
      const cached = urlsRef.current[index]
      if (cached?.photoId === photos[index].id) {
        nextUrls[index] = cached.url
      } else {
        if (cached) URL.revokeObjectURL(cached.url)
        nextUrls[index] = URL.createObjectURL(photos[index].blob)
      }
    }
    Object.entries(urlsRef.current).forEach(([index, cached]) => {
      if (!(Number(index) in nextUrls)) URL.revokeObjectURL(cached.url)
    })
    urlsRef.current = Object.fromEntries(
      Object.entries(nextUrls).map(([index, url]) => [
        index,
        { photoId: photos[Number(index)].id, url },
      ])
    )
    setUrls(nextUrls)
  }, [activeIndex, photos])

  useLayoutEffect(() => {
    resetGestureForNewPhoto()
    setImageLoading(true)
  }, [activeIndex])

  useEffect(() => () => {
    Object.values(urlsRef.current).forEach(({ url }) => URL.revokeObjectURL(url))
    urlsRef.current = {}
  }, [])

  useEffect(() => {
    ;[activeIndex - 1, activeIndex + 1].forEach((index) => {
      const url = urls[index]
      if (!url) return
      const image = new Image()
      image.src = url
      void image.decode?.().catch(() => undefined)
    })
  }, [activeIndex, urls])

  useEffect(() => () => {
    Object.values(urlsRef.current).forEach(({ url }) => URL.revokeObjectURL(url))
    urlsRef.current = {}
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    viewerRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      releaseCaptures()
      clearTap()
      pointersRef.current.clear()
      modeRef.current = 'idle'
      animationRef.current = null
      pendingIndexRef.current = null
    }
  }, [])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (modeRef.current === 'animating') return
      if (event.key === 'Escape') closeViewer()
      else if (event.key === 'ArrowLeft') requestIndexChange(activeIndex - 1)
      else if (event.key === 'ArrowRight') requestIndexChange(activeIndex + 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, onClose, onIndexChange, photos.length])

  if (!photo) return null

  const getContainedImageSize = () => {
    const stage = stageRef.current
    const image = activeImageRef.current
    if (!stage || !image?.naturalWidth || !image.naturalHeight) return { width: 0, height: 0 }
    const imageRatio = image.naturalWidth / image.naturalHeight
    const stageRatio = stage.clientWidth / stage.clientHeight
    return imageRatio > stageRatio
      ? { width: stage.clientWidth, height: stage.clientWidth / imageRatio }
      : { width: stage.clientHeight * imageRatio, height: stage.clientHeight }
  }

  const constrainPan = (pan: Point, scale: number) => {
    const stage = stageRef.current
    const image = getContainedImageSize()
    if (!stage || !image.width) return { x: 0, y: 0 }
    const bounds = getPanBounds(
      image.width,
      image.height,
      stage.clientWidth,
      stage.clientHeight,
      scale
    )
    return {
      x: clamp(pan.x, -bounds.x, bounds.x),
      y: clamp(pan.y, -bounds.y, bounds.y),
    }
  }

  const startPinch = () => {
    const [first, second] = [...pointersRef.current.values()]
    const stage = stageRef.current
    if (!first || !second || !stage) return
    const midpoint = getMidpoint(first, second)
    const rect = stage.getBoundingClientRect()
    const centered = {
      x: midpoint.x - rect.left - stage.clientWidth / 2,
      y: midpoint.y - rect.top - stage.clientHeight / 2,
    }
    modeRef.current = 'pinch'
    dragRef.current = { x: 0, y: 0 }
    pinchStartRef.current = {
      distance: getDistance(first, second),
      scale: scaleRef.current,
      contentPoint: {
        x: (centered.x - panRef.current.x) / scaleRef.current,
        y: (centered.y - panRef.current.y) / scaleRef.current,
      },
    }
    scheduleRender()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || modeRef.current === 'animating') return
    if (event.target instanceof Element && event.target.closest('button, select, label')) return
    if (
      pointersRef.current.size === 0 &&
      isBaseScale(scaleRef.current) &&
      (event.clientX < EDGE_GESTURE_WIDTH ||
        event.clientX > window.innerWidth - EDGE_GESTURE_WIDTH)
    ) return

    clearTapIfGestureIsStale()
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    capturedPointersRef.current.add(event.pointerId)
    setImageTransition('')
    if (pointersRef.current.size === 2) {
      startPinch()
      return
    }
    modeRef.current = isBaseScale(scaleRef.current) ? 'pending' : 'pan'
    gestureStartRef.current = {
      point: { x: event.clientX, y: event.clientY },
      pan: { ...panRef.current },
      time: performance.now(),
    }
  }

  const clearTapIfGestureIsStale = () => {
    if (
      lastTapRef.current &&
      performance.now() - lastTapRef.current.time > DOUBLE_TAP_DELAY
    ) clearTap()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (modeRef.current === 'pinch' && pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()]
      const stage = stageRef.current
      if (!first || !second || !stage) return
      const scale = clamp(
        pinchStartRef.current.scale *
          getDistance(first, second) / pinchStartRef.current.distance,
        1,
        MAX_SCALE
      )
      const midpoint = getMidpoint(first, second)
      const rect = stage.getBoundingClientRect()
      const centered = {
        x: midpoint.x - rect.left - stage.clientWidth / 2,
        y: midpoint.y - rect.top - stage.clientHeight / 2,
      }
      scaleRef.current = scale
      syncZoomedState()
      panRef.current = constrainPan({
        x: centered.x - pinchStartRef.current.contentPoint.x * scale,
        y: centered.y - pinchStartRef.current.contentPoint.y * scale,
      }, scale)
      scheduleRender()
      return
    }

    const deltaX = event.clientX - gestureStartRef.current.point.x
    const deltaY = event.clientY - gestureStartRef.current.point.y
    if (modeRef.current === 'pending') {
      modeRef.current = chooseDragMode(scaleRef.current, deltaX, deltaY)
      if (modeRef.current !== 'pending') clearTap()
    }
    if (modeRef.current === 'pan') {
      dragRef.current = { x: 0, y: 0 }
      panRef.current = constrainPan({
        x: gestureStartRef.current.pan.x + deltaX,
        y: gestureStartRef.current.pan.y + deltaY,
      }, scaleRef.current)
    } else if (modeRef.current === 'horizontalSwipe') {
      dragRef.current = { x: 0, y: 0 }
    } else if (modeRef.current === 'verticalDismiss') {
      dragRef.current = { x: 0, y: Math.max(0, deltaY) }
    }
    scheduleRender()
  }

  const applyDoubleTap = (point: Point) => {
    const nextScale = getDoubleTapScale(scaleRef.current)
    setImageTransition(IMAGE_TRANSITION)
    animationRef.current = 'doubleTap'
    if (nextScale === 1) {
      scaleRef.current = 1
      panRef.current = { x: 0, y: 0 }
    } else {
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const centered = {
        x: point.x - rect.left - stage.clientWidth / 2,
        y: point.y - rect.top - stage.clientHeight / 2,
      }
      scaleRef.current = DOUBLE_TAP_SCALE
      panRef.current = constrainPan({
        x: centered.x * (1 - DOUBLE_TAP_SCALE),
        y: centered.y * (1 - DOUBLE_TAP_SCALE),
      }, DOUBLE_TAP_SCALE)
    }
    syncZoomedState()
    dragRef.current = { x: 0, y: 0 }
    scheduleRender()
  }

  const registerTap = (point: Point) => {
    const now = performance.now()
    const previous = lastTapRef.current
    if (previous && now - previous.time <= DOUBLE_TAP_DELAY && getDistance(previous.point, point) <= 32) {
      clearTap()
      applyDoubleTap(point)
      return
    }
    clearTap()
    lastTapRef.current = { point, time: now }
    tapTimerRef.current = window.setTimeout(() => {
      setControlsVisible((visible) => !visible)
      lastTapRef.current = null
      tapTimerRef.current = null
    }, DOUBLE_TAP_DELAY)
  }

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    capturedPointersRef.current.delete(event.pointerId)
    pointersRef.current.delete(event.pointerId)
  }

  const handlePointerEnd = (
    event: PointerEvent<HTMLDivElement>,
    cancelled = false
  ) => {
    if (!pointersRef.current.has(event.pointerId)) return
    const gesture = modeRef.current
    const deltaX = event.clientX - gestureStartRef.current.point.x
    const deltaY = event.clientY - gestureStartRef.current.point.y
    const elapsed = performance.now() - gestureStartRef.current.time
    releasePointer(event)

    if (gesture === 'pinch' && pointersRef.current.size > 0) return
    releaseCaptures()
    pointersRef.current.clear()

    if (cancelled) {
      clearTap()
      modeRef.current = 'idle'
      animationRef.current = null
      pendingIndexRef.current = null
      dragRef.current = { x: 0, y: 0 }
      panRef.current = constrainPan(panRef.current, scaleRef.current)
      setImageTransition('')
      scheduleRender()
      return
    }

    const wasTap =
      Math.abs(deltaX) <= TAP_MOVE_TOLERANCE &&
      Math.abs(deltaY) <= TAP_MOVE_TOLERANCE &&
      elapsed < 350

    // A stationary pointer at a zoomed scale starts in pan mode, but it is
    // still a tap. Handling it here makes the second double tap deterministic.
    if (gesture === 'pan' && wasTap) {
      modeRef.current = 'idle'
      registerTap({ x: event.clientX, y: event.clientY })
      return
    }

    if (gesture === 'pinch' || gesture === 'pan') {
      if (isBaseScale(scaleRef.current)) {
        scaleRef.current = 1
        panRef.current = { x: 0, y: 0 }
      } else {
        panRef.current = constrainPan(panRef.current, scaleRef.current)
      }
      syncZoomedState()
      modeRef.current = 'idle'
      setImageTransition(IMAGE_TRANSITION)
      scheduleRender()
      return
    }

    if (gesture === 'pending' && wasTap) {
      modeRef.current = 'idle'
      registerTap({ x: event.clientX, y: event.clientY })
      return
    }
    clearTap()

    if (
      gesture === 'verticalDismiss' &&
      shouldDismiss(scaleRef.current, deltaY, elapsed)
    ) {
      closeViewer()
      return
    }

    if (gesture === 'horizontalSwipe') {
      const nextIndex = getSwipeIndex(activeIndex, photos.length, deltaX)
      if (nextIndex !== null) {
        requestIndexChange(nextIndex)
        return
      }
    }
    pendingIndexRef.current = null
    modeRef.current = 'idle'
  }

  const handleImageTransitionEnd = (event: TransitionEvent<HTMLImageElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
    if (animationRef.current === 'doubleTap') animationRef.current = null
    if (modeRef.current === 'idle') setImageTransition('')
  }

  const handleDelete = async () => {
    if (!await onDelete(photo)) return
    if (photos.length === 1) closeViewer()
    else if (!canNavigatePhotos(scaleRef.current)) closeViewer()
    else if (activeIndex === photos.length - 1) requestIndexChange(activeIndex - 1)
  }

  const controlsClass = `photo-viewer-controls${controlsVisible ? ' is-visible' : ''}`
  const activeUrl = urls[activeIndex]

  return (
    <div
      ref={viewerRef}
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${boundaryPointName}の写真`}
      tabIndex={-1}
    >
      <header className={`${controlsClass} photo-viewer-header`}>
        <button type="button" className="photo-viewer-icon-button" aria-label="写真を閉じる" onClick={closeViewer}>×</button>
        <strong className="photo-viewer-title">{boundaryPointName}</strong>
        <span className="photo-viewer-position" aria-live="polite">{activeIndex + 1} / {photos.length}</span>
      </header>
      <div
        ref={stageRef}
        className="photo-viewer-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={(event) => handlePointerEnd(event, true)}
      >
        <div className="photo-viewer-current">
          {activeUrl && (
            <img
              key={photo.id}
              ref={activeImageRef}
              className="photo-viewer-image"
              src={activeUrl}
              alt={photo.fileName}
              draggable="false"
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
              onTransitionEnd={handleImageTransitionEnd}
            />
          )}
          {imageLoading && (
            <div className="photo-viewer-loading" role="status">読み込み中…</div>
          )}
        </div>
        {!isZoomed && (
          <div className={`${controlsClass} photo-viewer-navigation`}>
            <button type="button" className="photo-viewer-nav photo-viewer-nav-previous" aria-label="前の写真" disabled={activeIndex === 0} onClick={() => requestIndexChange(activeIndex - 1)}>‹</button>
            <button type="button" className="photo-viewer-nav photo-viewer-nav-next" aria-label="次の写真" disabled={activeIndex === photos.length - 1} onClick={() => requestIndexChange(activeIndex + 1)}>›</button>
          </div>
        )}
      </div>
      <footer className={`${controlsClass} photo-viewer-footer`}>
        <label className="photo-viewer-category">
          <span>写真種別</span>
          <select value={photo.category || ''} onChange={(event) => void onCategoryChange(photo, event.target.value)}>
            <option value="">未分類</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <button type="button" className="photo-viewer-delete" onClick={() => void handleDelete()}>削除</button>
      </footer>
  </div>
  )
}

export default PhotoViewer
