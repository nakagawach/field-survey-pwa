import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'

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
  onCategoryChange: (
    photo: BoundaryPhoto,
    category: string
  ) => Promise<void>
}

type Point = {
  x: number
  y: number
}

type GestureMode = 'pan' | 'pinch' | 'swipe' | null

const SWIPE_THRESHOLD = 60
const EDGE_GESTURE_WIDTH = 24
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const TAP_MOVE_TOLERANCE = 10
const DOUBLE_TAP_DELAY = 280

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const getDistance = (first: Point, second: Point) =>
  Math.hypot(second.x - first.x, second.y - first.y)

const getMidpoint = (first: Point, second: Point): Point => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
})

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
  const [imageUrl, setImageUrl] = useState('')
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const scaleRef = useRef(1)
  const panRef = useRef<Point>({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, Point>())
  const gestureMode = useRef<GestureMode>(null)
  const gestureStart = useRef({
    point: { x: 0, y: 0 },
    pan: { x: 0, y: 0 },
    time: 0,
  })
  const pinchStart = useRef({
    distance: 0,
    scale: 1,
    contentPoint: { x: 0, y: 0 },
  })
  const tapTimer = useRef<number | null>(null)
  const lastTap = useRef<{ point: Point; time: number } | null>(null)
  const slideTimer = useRef<number | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const getContainedImageSize = () => {
    const stage = stageRef.current
    const image = imageRef.current

    if (!stage || !image || !image.naturalWidth || !image.naturalHeight) {
      return { width: 0, height: 0 }
    }

    const stageRatio = stage.clientWidth / stage.clientHeight
    const imageRatio = image.naturalWidth / image.naturalHeight

    if (imageRatio > stageRatio) {
      return {
        width: stage.clientWidth,
        height: stage.clientWidth / imageRatio,
      }
    }

    return {
      width: stage.clientHeight * imageRatio,
      height: stage.clientHeight,
    }
  }

  const constrainPan = (
    nextPan: Point,
    nextScale: number
  ): Point => {
    const stage = stageRef.current
    const imageSize = getContainedImageSize()

    if (!stage || !imageSize.width || !imageSize.height) {
      return { x: 0, y: 0 }
    }

    const maxX = Math.max(
      0,
      (imageSize.width * nextScale - stage.clientWidth) / 2
    )
    const maxY = Math.max(
      0,
      (imageSize.height * nextScale - stage.clientHeight) / 2
    )

    return {
      x: clamp(nextPan.x, -maxX, maxX),
      y: clamp(nextPan.y, -maxY, maxY),
    }
  }

  const resetTransform = () => {
    scaleRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setScale(1)
    setPan({ x: 0, y: 0 })
    setDragOffset(0)
    setIsDragging(false)
    pointers.current.clear()
    gestureMode.current = null
  }

  const showPrevious = () => {
    if (activeIndex > 0) {
      onIndexChange(activeIndex - 1)
    }
  }

  const showNext = () => {
    if (activeIndex < photos.length - 1) {
      onIndexChange(activeIndex + 1)
    }
  }

  useEffect(() => {
    if (!photo) {
      return
    }

    const objectUrl = URL.createObjectURL(photo.blob)
    setImageUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [photo])

  useEffect(() => {
    resetTransform()
  }, [activeIndex])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft') {
        showPrevious()
      } else if (event.key === 'ArrowRight') {
        showNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

  useEffect(() => {
    return () => {
      if (tapTimer.current !== null) {
        window.clearTimeout(tapTimer.current)
      }
      if (slideTimer.current !== null) {
        window.clearTimeout(slideTimer.current)
      }
    }
  }, [])

  if (!photo) {
    return null
  }

  const isControlTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest('button, select, label'))

  const startPinch = () => {
    const [first, second] = Array.from(pointers.current.values())
    const stage = stageRef.current

    if (!first || !second || !stage) {
      return
    }

    const midpoint = getMidpoint(first, second)
    const midpointFromCenter = {
      x: midpoint.x - stage.getBoundingClientRect().left - stage.clientWidth / 2,
      y: midpoint.y - stage.getBoundingClientRect().top - stage.clientHeight / 2,
    }

    gestureMode.current = 'pinch'
    pinchStart.current = {
      distance: getDistance(first, second),
      scale: scaleRef.current,
      contentPoint: {
        x:
          (midpointFromCenter.x - panRef.current.x) /
          scaleRef.current,
        y:
          (midpointFromCenter.y - panRef.current.y) /
          scaleRef.current,
      },
    }
    setIsDragging(true)
    setDragOffset(0)
  }

  const handlePointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (isControlTarget(event.target) || event.button !== 0) {
      return
    }

    if (
      pointers.current.size === 0 &&
      scaleRef.current === 1 &&
      (event.clientX < EDGE_GESTURE_WIDTH ||
        event.clientX > window.innerWidth - EDGE_GESTURE_WIDTH)
    ) {
      return
    }

    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    event.currentTarget.setPointerCapture(event.pointerId)

    if (pointers.current.size === 2) {
      startPinch()
      return
    }

    gestureMode.current = scaleRef.current > 1 ? 'pan' : 'swipe'
    gestureStart.current = {
      point: { x: event.clientX, y: event.clientY },
      pan: panRef.current,
      time: performance.now(),
    }
    setIsDragging(true)
  }

  const handlePointerMove = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!pointers.current.has(event.pointerId)) {
      return
    }

    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (gestureMode.current === 'pinch' && pointers.current.size >= 2) {
      const [first, second] = Array.from(pointers.current.values())
      const stage = stageRef.current

      if (!first || !second || !stage) {
        return
      }

      const nextScale = clamp(
        pinchStart.current.scale *
          (getDistance(first, second) / pinchStart.current.distance),
        1,
        MAX_SCALE
      )
      const midpoint = getMidpoint(first, second)
      const rect = stage.getBoundingClientRect()
      const midpointFromCenter = {
        x: midpoint.x - rect.left - stage.clientWidth / 2,
        y: midpoint.y - rect.top - stage.clientHeight / 2,
      }
      const nextPan = constrainPan(
        {
          x:
            midpointFromCenter.x -
            pinchStart.current.contentPoint.x * nextScale,
          y:
            midpointFromCenter.y -
            pinchStart.current.contentPoint.y * nextScale,
        },
        nextScale
      )

      scaleRef.current = nextScale
      panRef.current = nextPan
      setScale(nextScale)
      setPan(nextPan)
      return
    }

    const deltaX = event.clientX - gestureStart.current.point.x
    const deltaY = event.clientY - gestureStart.current.point.y

    if (gestureMode.current === 'pan') {
      const nextPan = constrainPan(
        {
          x: gestureStart.current.pan.x + deltaX,
          y: gestureStart.current.pan.y + deltaY,
        },
        scaleRef.current
      )
      panRef.current = nextPan
      setPan(nextPan)
    } else if (
      gestureMode.current === 'swipe' &&
      Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      setDragOffset(deltaX)
    }
  }

  const handleDoubleTap = (point: Point) => {
    if (scaleRef.current > 1) {
      resetTransform()
      return
    }

    const stage = stageRef.current

    if (!stage) {
      return
    }

    const rect = stage.getBoundingClientRect()
    const pointFromCenter = {
      x: point.x - rect.left - stage.clientWidth / 2,
      y: point.y - rect.top - stage.clientHeight / 2,
    }
    const nextPan = constrainPan(
      {
        x: pointFromCenter.x * (1 - DOUBLE_TAP_SCALE),
        y: pointFromCenter.y * (1 - DOUBLE_TAP_SCALE),
      },
      DOUBLE_TAP_SCALE
    )

    scaleRef.current = DOUBLE_TAP_SCALE
    panRef.current = nextPan
    setScale(DOUBLE_TAP_SCALE)
    setPan(nextPan)
  }

  const registerTap = (point: Point) => {
    const now = performance.now()
    const previousTap = lastTap.current

    if (
      previousTap &&
      now - previousTap.time <= DOUBLE_TAP_DELAY &&
      getDistance(previousTap.point, point) <= 32
    ) {
      if (tapTimer.current !== null) {
        window.clearTimeout(tapTimer.current)
        tapTimer.current = null
      }
      lastTap.current = null
      handleDoubleTap(point)
      return
    }

    lastTap.current = { point, time: now }
    tapTimer.current = window.setTimeout(() => {
      setControlsVisible((visible) => !visible)
      lastTap.current = null
      tapTimer.current = null
    }, DOUBLE_TAP_DELAY)
  }

  const animatePhotoChange = (direction: -1 | 1) => {
    const canMove =
      direction === -1
        ? activeIndex > 0
        : activeIndex < photos.length - 1

    if (!canMove || slideTimer.current !== null) {
      setDragOffset(0)
      return
    }

    const stageWidth = stageRef.current?.clientWidth ?? window.innerWidth
    setDragOffset(direction === -1 ? stageWidth : -stageWidth)
    slideTimer.current = window.setTimeout(() => {
      if (direction === -1) {
        showPrevious()
      } else {
        showNext()
      }
      setDragOffset(0)
      slideTimer.current = null
    }, 180)
  }

  const finishPointerGesture = (
    event: PointerEvent<HTMLDivElement>,
    cancelled = false
  ) => {
    if (!pointers.current.has(event.pointerId)) {
      return
    }

    const mode = gestureMode.current
    const deltaX = event.clientX - gestureStart.current.point.x
    const deltaY = event.clientY - gestureStart.current.point.y
    const elapsed = performance.now() - gestureStart.current.time
    const wasTap =
      Math.abs(deltaX) <= TAP_MOVE_TOLERANCE &&
      Math.abs(deltaY) <= TAP_MOVE_TOLERANCE &&
      elapsed < 350
    pointers.current.delete(event.pointerId)
    setIsDragging(false)

    if (cancelled) {
      pointers.current.clear()
      gestureMode.current = null
      setDragOffset(0)
      const nextPan = constrainPan(panRef.current, scaleRef.current)
      panRef.current = nextPan
      setPan(nextPan)
      return
    }

    if (mode === 'pinch') {
      if (scaleRef.current <= 1.01) {
        resetTransform()
      } else {
        const nextPan = constrainPan(panRef.current, scaleRef.current)
        panRef.current = nextPan
        setPan(nextPan)
        pointers.current.clear()
        gestureMode.current = null
      }
      return
    }

    gestureMode.current = null

    if (mode === 'pan') {
      const nextPan = constrainPan(panRef.current, scaleRef.current)
      panRef.current = nextPan
      setPan(nextPan)
      if (wasTap) {
        registerTap({ x: event.clientX, y: event.clientY })
      }
      return
    }

    if (wasTap) {
      setDragOffset(0)
      registerTap({ x: event.clientX, y: event.clientY })
    } else if (
      Math.abs(deltaX) >= SWIPE_THRESHOLD &&
      Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      animatePhotoChange(deltaX > 0 ? -1 : 1)
    } else {
      setDragOffset(0)
    }
  }

  const handleDelete = async () => {
    const deleted = await onDelete(photo)

    if (!deleted) {
      return
    }

    if (photos.length === 1) {
      onClose()
    } else if (activeIndex === photos.length - 1) {
      onIndexChange(activeIndex - 1)
    }
  }

  const controlsClassName = controlsVisible
    ? 'photo-viewer-controls is-visible'
    : 'photo-viewer-controls'

  return (
    <div
      ref={dialogRef}
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${boundaryPointName}の写真`}
      tabIndex={-1}
    >
      <header className={`${controlsClassName} photo-viewer-header`}>
        <button
          type="button"
          className="photo-viewer-icon-button"
          aria-label="写真を閉じる"
          onClick={onClose}
        >
          ×
        </button>
        <strong className="photo-viewer-title">
          {boundaryPointName}
        </strong>
        <span className="photo-viewer-position" aria-live="polite">
          {activeIndex + 1} / {photos.length}
        </span>
      </header>

      <div
        ref={stageRef}
        className="photo-viewer-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
      >
        {imageUrl && (
          <img
            ref={imageRef}
            className={
              isDragging
                ? 'photo-viewer-image is-dragging'
                : 'photo-viewer-image'
            }
            src={imageUrl}
            alt={photo.fileName}
            draggable="false"
            style={{
              transform: `translate3d(${pan.x + dragOffset}px, ${pan.y}px, 0) scale(${scale})`,
            }}
          />
        )}

        <div className={`${controlsClassName} photo-viewer-navigation`}>
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-nav-previous"
            aria-label="前の写真"
            disabled={activeIndex === 0}
            onClick={showPrevious}
          >
            ‹
          </button>
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-nav-next"
            aria-label="次の写真"
            disabled={activeIndex === photos.length - 1}
            onClick={showNext}
          >
            ›
          </button>
        </div>
      </div>

      <footer className={`${controlsClassName} photo-viewer-footer`}>
        <label className="photo-viewer-category">
          <span>写真種別</span>
          <select
            value={photo.category || ''}
            onChange={(event) =>
              void onCategoryChange(photo, event.target.value)
            }
          >
            <option value="">未分類</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="photo-viewer-delete"
          onClick={() => void handleDelete()}
        >
          削除
        </button>
      </footer>
    </div>
  )
}

export default PhotoViewer
