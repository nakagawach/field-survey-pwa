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

const readImageSize = (src: string) => new Promise<{ width: number; height: number }>((resolve) => {
  const image = new Image()
  image.onload = () => resolve({
    width: Math.max(1, image.naturalWidth),
    height: Math.max(1, image.naturalHeight),
  })
  image.onerror = () => resolve({ width: 1, height: 1 })
  image.src = src
})

export default function PhotoViewer({ photos, index, onClose, onIndexChange }: Props) {
  const callbacksRef = useRef({ onClose, onIndexChange })
  callbacksRef.current = { onClose, onIndexChange }
  const initialIndexRef = useRef(index)

  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo.blob))
    let viewer: PhotoSwipe | null = null
    let disposed = false

    void Promise.all(
      urls.map(async (src, photoIndex) => ({
        src,
        ...(await readImageSize(src)),
        alt: photos[photoIndex]?.fileName ?? '写真',
      })),
    ).then((dataSource) => {
      if (disposed || dataSource.length === 0) {
        if (!disposed) callbacksRef.current.onClose()
        return
      }

      viewer = new PhotoSwipe({
        dataSource,
        index: Math.min(initialIndexRef.current, dataSource.length - 1),
        close: true,
        zoom: true,
        counter: true,
        arrowPrev: true,
        arrowNext: true,
        closeOnVerticalDrag: true,
        allowPanToNext: false,
        doubleTapAction: 'zoom',
        wheelToZoom: true,
        escKey: true,
        arrowKeys: true,
        loop: false,
        bgOpacity: 1,
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
