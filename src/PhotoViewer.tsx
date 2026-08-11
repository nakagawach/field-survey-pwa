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

const SWIPE_THRESHOLD = 60
const EDGE_GESTURE_WIDTH = 24

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
  const [dragOffset, setDragOffset] = useState(0)
  const pointerStart = useRef<{
    id: number
    x: number
    y: number
  } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

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

  if (!photo) {
    return null
  }

  const handlePointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.clientX < EDGE_GESTURE_WIDTH ||
      event.clientX > window.innerWidth - EDGE_GESTURE_WIDTH
    ) {
      return
    }

    pointerStart.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    const start = pointerStart.current

    if (!start || start.id !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setDragOffset(deltaX)
    }
  }

  const finishPointerGesture = (
    event: PointerEvent<HTMLDivElement>,
    cancelled = false
  ) => {
    const start = pointerStart.current

    if (!start || start.id !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    pointerStart.current = null
    setDragOffset(0)

    if (
      cancelled ||
      Math.abs(deltaX) < SWIPE_THRESHOLD ||
      Math.abs(deltaX) <= Math.abs(deltaY)
    ) {
      return
    }

    if (deltaX > 0) {
      showPrevious()
    } else {
      showNext()
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

  return (
    <div
      ref={dialogRef}
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${boundaryPointName}の写真`}
      tabIndex={-1}
    >
      <header className="photo-viewer-header">
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
        className="photo-viewer-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
      >
        {imageUrl && (
          <img
            className="photo-viewer-image"
            src={imageUrl}
            alt={photo.fileName}
            draggable="false"
            style={{ transform: `translate3d(${dragOffset}px, 0, 0)` }}
          />
        )}

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

      <footer className="photo-viewer-footer">
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
