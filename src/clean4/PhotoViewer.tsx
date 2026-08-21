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
    let metaElement: HTMLElement | null = null
    let pendingEditPhotoId: string | null = null
    let disposed = false

    const getCurrentPhoto = () => {
      if (!viewer) return null
      return photos[viewer.currIndex] ?? null
    }

    const renderMeta = () => {
      if (!metaElement) return
      const photo = getCurrentPhoto()
      metaElement.replaceChildren()
      if (!photo) return

      const categoryLine = document.createElement('div')
      categoryLine.textContent = `写真種別：${photo.category || '未分類'}`
      categoryLine.style.fontWeight = '800'
      categoryLine.style.fontSize = '14px'

      const tagLine = document.createElement('div')
      tagLine.textContent = `タグ：${(photo.tags ?? []).length ? (photo.tags ?? []).join(' ・ ') : 'なし'}`
      tagLine.style.marginTop = '4px'
      tagLine.style.fontSize = '13px'
      tagLine.style.lineHeight = '1.35'

      metaElement.append(categoryLine, tagLine)
    }

    const openExistingPhotoEditor = (photoId: string) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const card = document.getElementById(`photo-${photoId}`)
          if (!card) return
          card.scrollIntoView({ behavior: 'smooth', block: 'center' })
          card.querySelector<HTMLButtonElement>('.photo-tag-edit-button')?.click()
        })
      })
    }

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

      viewer.on('uiRegister', () => {
        if (!viewer?.ui) return
        const ui = viewer.ui

        ui.registerElement({
          name: 'photo-edit',
          order: 9,
          isButton: true,
          ariaLabel: '通常画面で写真タグを編集',
          html: '編集',
          onInit: (element) => {
            element.style.width = '58px'
            element.style.padding = '0 8px'
            element.style.fontSize = '14px'
            element.style.fontWeight = '800'
            element.style.color = '#ffffff'
          },
          onClick: (event) => {
            event.stopPropagation()
            const photo = getCurrentPhoto()
            if (!photo || !viewer) return
            pendingEditPhotoId = photo.id
            viewer.close()
          },
        })

        ui.registerElement({
          name: 'photo-meta-summary',
          className: 'pswp__photo-meta-summary',
          appendTo: 'root',
          onInit: (element) => {
            metaElement = element
            element.style.position = 'absolute'
            element.style.left = '12px'
            element.style.right = '12px'
            element.style.bottom = 'calc(12px + env(safe-area-inset-bottom))'
            element.style.zIndex = '20'
            element.style.maxWidth = '680px'
            element.style.margin = '0 auto'
            element.style.padding = '9px 12px'
            element.style.borderRadius = '10px'
            element.style.background = 'rgba(0, 0, 0, 0.62)'
            element.style.color = '#ffffff'
            element.style.pointerEvents = 'none'
            element.style.boxSizing = 'border-box'
            renderMeta()
          },
        })
      })

      viewer.on('change', () => {
        if (!viewer) return
        callbacksRef.current.onIndexChange(viewer.currIndex)
        renderMeta()
      })

      viewer.on('destroy', () => {
        if (disposed) return
        callbacksRef.current.onClose()
        if (pendingEditPhotoId) openExistingPhotoEditor(pendingEditPhotoId)
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
