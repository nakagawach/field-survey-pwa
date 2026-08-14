import { useEffect, useMemo, useRef, useState } from 'react'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'

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

type PhotoSlide = {
  src: string
  width: number
  height: number
  alt: string
}

const getImageSize = (src: string) => new Promise<{ width: number; height: number }>((resolve) => {
  const image = new Image()
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
  image.onerror = () => resolve({ width: 1, height: 1 })
  image.src = src
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
  const viewerRef = useRef<PhotoSwipe | null>(null)
  const callbacksRef = useRef({ onClose, onIndexChange })
  const firstPhotoId = useRef(photos[activeIndex]?.id)
  const initialIndex = Math.max(0, photos.findIndex((photo) => photo.id === firstPhotoId.current))
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoomPercent, setZoomPercent] = useState(100)

  callbacksRef.current = { onClose, onIndexChange }

  const urls = useMemo(
    () => photos.map((photo) => URL.createObjectURL(photo.blob)),
    [photos],
  )

  useEffect(() => {
    let disposed = false
    let isReactCleanup = false

    Promise.all(urls.map(async (src, index): Promise<PhotoSlide> => ({
      src,
      ...await getImageSize(src),
      alt: photos[index].fileName,
    }))).then((dataSource) => {
      if (disposed || dataSource.length === 0) return

      const index = Math.min(currentIndex, dataSource.length - 1)
      const viewer = new PhotoSwipe({
        dataSource,
        index,
        allowPanToNext: false,
        closeOnVerticalDrag: true,
        pinchToClose: false,
        wheelToZoom: true,
        escKey: true,
        arrowKeys: true,
        loop: false,
        bgOpacity: 0.96,
        showHideAnimationType: 'fade',
        doubleTapAction: 'zoom',
        imageClickAction: 'zoom',
        tapAction: false,
        close: false,
        zoom: false,
        arrowPrev: false,
        arrowNext: false,
        counter: false,
      })

      viewer.on('change', () => {
        setCurrentIndex(viewer.currIndex)
        callbacksRef.current.onIndexChange(viewer.currIndex)
      })
      viewer.on('zoomPanUpdate', () => {
        const slide = viewer.currSlide
        if (slide) setZoomPercent(Math.round(slide.currZoomLevel / slide.zoomLevels.initial * 100))
      })
      viewer.on('destroy', () => {
        viewerRef.current = null
        if (!isReactCleanup) callbacksRef.current.onClose()
      })

      viewerRef.current = viewer
      viewer.init()
    })

    return () => {
      disposed = true
      isReactCleanup = true
      viewerRef.current?.destroy()
      viewerRef.current = null
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [photos, urls])

  const photo = photos[currentIndex]
  if (!photo) return null

  const zoom = (factor: number) => {
    const viewer = viewerRef.current
    const slide = viewer?.currSlide
    if (!viewer || !slide) return
    const nextLevel = Math.min(slide.zoomLevels.max, Math.max(slide.zoomLevels.initial, slide.currZoomLevel * factor))
    slide.zoomTo(nextLevel, undefined, viewer.options.zoomAnimationDuration)
  }

  return (
    <div className="photo-viewer-controls" aria-label={`${boundaryPointName}の写真操作`}>
      <header className="photo-viewer-header">
        <button type="button" className="photo-viewer-round" aria-label="閉じる" onClick={() => viewerRef.current?.close()}>×</button>
        <div className="photo-viewer-title">
          <strong>{boundaryPointName}</strong>
          <span>{currentIndex + 1} / {photos.length}</span>
        </div>
        <div className="photo-viewer-zoom" aria-label="ズーム操作">
          <button type="button" aria-label="縮小" onClick={() => zoom(1 / 1.5)}>−</button>
          <span>{zoomPercent}%</span>
          <button type="button" aria-label="拡大" onClick={() => zoom(1.5)}>＋</button>
        </div>
      </header>

      {currentIndex > 0 && (
        <button type="button" className="photo-viewer-arrow photo-viewer-previous" aria-label="前の写真" onClick={() => viewerRef.current?.prev()}>‹</button>
      )}
      {currentIndex < photos.length - 1 && (
        <button type="button" className="photo-viewer-arrow photo-viewer-next" aria-label="次の写真" onClick={() => viewerRef.current?.next()}>›</button>
      )}

      <footer className="photo-viewer-footer">
        <span className="photo-viewer-file-name" title={photo.fileName}>{photo.fileName}</span>
        <label className="photo-viewer-category">
          <span>写真種別</span>
          <select value={photo.category ?? ''} onChange={(event) => void onCategoryChange(photo, event.target.value)}>
            <option value="">未選択</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <button type="button" className="photo-viewer-delete" onClick={async () => {
          const deleted = await onDelete(photo)
          if (deleted && photos.length === 1) viewerRef.current?.close()
        }}>削除</button>
      </footer>
    </div>
  )
}

export default PhotoViewer
