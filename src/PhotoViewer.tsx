import { useEffect, useRef } from 'react'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'

import type { BoundaryPhoto } from './types'

type PhotoViewerProps = {
  photos: BoundaryPhoto[]
  activeIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
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

function PhotoViewer({ photos, activeIndex, onClose, onIndexChange }: PhotoViewerProps) {
  const callbacksRef = useRef({ onClose, onIndexChange })
  const initialIndexRef = useRef(activeIndex)
  callbacksRef.current = { onClose, onIndexChange }

  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo.blob))
    let viewer: PhotoSwipe | null = null
    let disposed = false

    Promise.all(urls.map(async (src, index): Promise<PhotoSlide> => ({
      src,
      ...await getImageSize(src),
      alt: photos[index].fileName,
    }))).then((dataSource) => {
      if (disposed) return
      if (dataSource.length === 0) {
        callbacksRef.current.onClose()
        return
      }

      viewer = new PhotoSwipe({
        dataSource,
        index: Math.min(initialIndexRef.current, dataSource.length - 1),
        close: true,
        zoom: true,
        arrowPrev: true,
        arrowNext: true,
        counter: true,
        closeOnVerticalDrag: true,
        allowPanToNext: false,
        doubleTapAction: 'zoom',
        wheelToZoom: true,
        escKey: true,
        arrowKeys: true,
        loop: false,
      })

      viewer.on('change', () => {
        if (viewer) callbacksRef.current.onIndexChange(viewer.currIndex)
      })
      viewer.on('destroy', () => {
        if (!disposed) callbacksRef.current.onClose()
      })
      viewer.init()
    })

    return () => {
      disposed = true
      viewer?.destroy()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [photos])

  return null
}

export default PhotoViewer
