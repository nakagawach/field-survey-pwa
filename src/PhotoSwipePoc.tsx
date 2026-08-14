import { useEffect, useRef, useState } from 'react'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
import './PhotoSwipePoc.css'

const imageBaseUrl = `${import.meta.env.BASE_URL}photoswipe-poc/`

const testImages = [
  { src: `${imageBaseUrl}photo-1.svg`, width: 2400, height: 1600, alt: '写真1 山と湖' },
  { src: `${imageBaseUrl}photo-2.svg`, width: 2400, height: 1600, alt: '写真2 海岸' },
  { src: `${imageBaseUrl}photo-3.svg`, width: 2400, height: 1600, alt: '写真3 森林' },
]

function PhotoSwipePoc() {
  const viewerRef = useRef<PhotoSwipe | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const openViewer = () => {
    if (viewerRef.current) {
      return
    }

    const viewer = new PhotoSwipe({
      dataSource: testImages,
      index: 0,
      allowPanToNext: false,
      closeOnVerticalDrag: true,
      pinchToClose: false,
      preload: [2, 2],
      loop: true,
      wheelToZoom: true,
      escKey: true,
      arrowKeys: true,
      bgOpacity: 0.96,
      showHideAnimationType: 'fade',
      doubleTapAction: 'zoom',
      imageClickAction: 'zoom',
      tapAction: 'toggle-controls',
      closeTitle: '閉じる',
      zoomTitle: 'ズーム切替',
      arrowPrevTitle: '前の写真',
      arrowNextTitle: '次の写真',
      indexIndicatorSep: ' / ',
    })

    viewer.on('uiRegister', () => {
      viewer.ui?.registerElement({
        name: 'zoom-out',
        order: 8,
        isButton: true,
        title: '縮小',
        ariaLabel: '縮小',
        html: '<span aria-hidden="true">−</span>',
        onClick: () => {
          const slide = viewer.currSlide
          if (!slide) return
          const nextLevel = Math.max(slide.zoomLevels.initial, slide.currZoomLevel / 1.5)
          slide.zoomTo(nextLevel, undefined, viewer.options.zoomAnimationDuration)
        },
      })

      viewer.ui?.registerElement({
        name: 'zoom-in',
        order: 9,
        isButton: true,
        title: '拡大',
        ariaLabel: '拡大',
        html: '<span aria-hidden="true">＋</span>',
        onClick: () => {
          const slide = viewer.currSlide
          if (!slide) return
          const nextLevel = Math.min(slide.zoomLevels.max, slide.currZoomLevel * 1.5)
          slide.zoomTo(nextLevel, undefined, viewer.options.zoomAnimationDuration)
        },
      })
    })

    viewer.on('destroy', () => {
      viewerRef.current = null
      setIsOpen(false)
    })

    viewerRef.current = viewer
    setIsOpen(true)
    viewer.init()
  }

  useEffect(() => {
    openViewer()
    return () => viewerRef.current?.destroy()
  }, [])

  return (
    <main className="photoswipe-poc-page">
      <section className="photoswipe-poc-card">
        <p className="photoswipe-poc-kicker">PhotoSwipe gesture PoC</p>
        <h1>写真Viewer 操作確認</h1>
        <p>
          3枚のテスト画像で、スワイプ、ピンチ、ダブルタップ、パン、下方向ドラッグを確認できます。
        </p>
        <button type="button" onClick={openViewer} disabled={isOpen}>
          {isOpen ? 'Viewerを表示中' : 'Viewerを開く'}
        </button>
        <a href={import.meta.env.BASE_URL}>既存アプリへ戻る</a>
      </section>
    </main>
  )
}

export default PhotoSwipePoc
