import { useEffect, useRef } from 'react'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
import type { BoundaryPhoto } from '../types'

type Props = {
  photos: BoundaryPhoto[]
  activeIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
}

type Slide = {
  src: string
  width: number
  height: number
  alt: string
}

const getSize = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.onerror = () => resolve({ width: 1, height: 1 })
    image.src = src
  })

function PhotoViewer({ photos, activeIndex, onClose, onIndexChange }: Props) {
  const callbacks = useRef({ onClose, onIndexChange })
  const initialIndex = useRef(activeIndex)
  callbacks.current = { onClose, onIndexChange }

  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo.blob))
    let viewer: PhotoSwipe | null = null
    let disposed = false

    Promise.all(
      urls.map(async (src, index): Promise<Slide> => ({
        src,
        ...(await getSize(src)),
        alt: photos[index]?.fileName ?? `photo-${index + 1}`,
      }))
    ).then((dataSource) => {
      if (disposed) return
      if (dataSource.length === 0) {
        callbacks.current.onClose()
        return
      }

      viewer = new PhotoSwipe({
        dataSource,
        index: Math.min(initialIndex.current, dataSource.length - 1),
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
        bgOpacity: 0.96,
      })

      viewer.on('change', () => {
        if (viewer) callbacks.current.onIndexChange(viewer.currIndex)
      })

      viewer.on('destroy', () => {
        if (!disposed) callbacks.current.onClose()
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
