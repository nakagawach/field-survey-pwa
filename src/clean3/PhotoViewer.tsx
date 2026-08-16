import { useEffect, useRef } from 'react'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
import type { BoundaryPhoto } from '../types'

type Props = {
  photos: BoundaryPhoto[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}

const imageSize = (src: string) => new Promise<{ width: number; height: number }>((resolve) => {
  const image = new Image()
  image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
  image.onerror = () => resolve({ width: 1, height: 1 })
  image.src = src
})

export default function PhotoViewer({ photos, index, onClose, onIndexChange }: Props) {
  const callbacks = useRef({ onClose, onIndexChange })
  callbacks.current = { onClose, onIndexChange }
  const initialIndex = useRef(index)

  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo.blob))
    let viewer: PhotoSwipe | null = null
    let disposed = false

    Promise.all(urls.map(async (src, i) => ({
      src,
      ...(await imageSize(src)),
      alt: photos[i].fileName,
    }))).then((dataSource) => {
      if (disposed || dataSource.length === 0) return
      viewer = new PhotoSwipe({
        dataSource,
        index: Math.min(initialIndex.current, dataSource.length - 1),
        close: true,
        zoom: true,
        counter: true,
        arrowPrev: true,
        arrowNext: true,
        closeOnVerticalDrag: true,
        doubleTapAction: 'zoom',
        wheelToZoom: true,
        escKey: true,
        arrowKeys: true,
        loop: false,
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
      urls.forEach(URL.revokeObjectURL)
    }
  }, [photos])

  return null
}
