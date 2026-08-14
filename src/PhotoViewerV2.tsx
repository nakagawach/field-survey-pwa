import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import './PhotoViewerV2.css'

import type { BoundaryPhoto } from './types'

type GestureMode =
  | 'none'
  | 'pending'
  | 'swipe'
  | 'pan'
  | 'pinch'
  | 'doubletap'

type Point = {
  x: number
  y: number
}

type PhotoViewerV2Props = {
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

export const MIN_SCALE = 1
export const MAX_SCALE = 5
export const DOUBLE_TAP_SCALE = 2.5

export const GESTURE_LOCK = 14
export const SWIPE_THRESHOLD = 56

export const DOUBLE_TAP_MS = 360
export const DOUBLE_TAP_DISTANCE = 44

export const SLIDE_DURATION = 280

const SLIDE_EASING =
  'cubic-bezier(.22,.61,.36,1)'

const SCALE_EPSILON = 1.01

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.min(max, Math.max(min, value))

const distance = (
  a: Point,
  b: Point
) => Math.hypot(
  a.x - b.x,
  a.y - b.y
)

const midpoint = (
  a: Point,
  b: Point
): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

function PhotoViewerV2({
  photos,
  activeIndex,
  boundaryPointName,
  categories,
  onClose,
  onIndexChange,
  onDelete,
  onCategoryChange,
}: PhotoViewerV2Props) {
  const initialPhotoIdRef =
    useRef(photos[activeIndex]?.id)

  const initialIndex = Math.max(
    0,
    photos.findIndex(
      (item) =>
        item.id === initialPhotoIdRef.current
    )
  )

  const [currentIndex, setCurrentIndex] =
    useState(initialIndex)

  const [scale, setScale] =
    useState(MIN_SCALE)

  const [imageOffset, setImageOffset] =
    useState<Point>({
      x: 0,
      y: 0,
    })

  const [trackDragX, setTrackDragX] =
    useState(0)

  const [
    slideAnimating,
    setSlideAnimating,
  ] = useState(false)

  const viewerRef =
    useRef<HTMLDivElement>(null)

  const stageRef =
    useRef<HTMLDivElement>(null)

  const imageRef =
    useRef<HTMLImageElement>(null)

  const activePointersRef =
    useRef(
      new Map<number, Point>()
    )

  const primaryPointerIdRef =
    useRef<number | null>(null)

  const gestureModeRef =
    useRef<GestureMode>('none')

  const gestureStartRef =
    useRef({
      point: {
        x: 0,
        y: 0,
      },
      image: {
        x: 0,
        y: 0,
      },
    })

  const pinchStartRef =
    useRef({
      distance: 0,
      scale: MIN_SCALE,
      image: {
        x: 0,
        y: 0,
      },
      center: {
        x: 0,
        y: 0,
      },
    })

  const lastTapRef =
    useRef<{
      time: number
      point: Point
    } | null>(null)

  const scaleRef =
    useRef(scale)

  const imageOffsetRef =
    useRef(imageOffset)

  const trackDragXRef =
    useRef(trackDragX)

  const animationTimerRef =
    useRef<number | null>(null)

  scaleRef.current = scale
  imageOffsetRef.current = imageOffset
  trackDragXRef.current = trackDragX

  /*
   * Object URL
   */
  const urls = useMemo(() => {
    const map =
      new Map<string, string>()

    photos.forEach((item) => {
      map.set(
        item.id,
        URL.createObjectURL(
          item.blob
        )
      )
    })

    return map
  }, [photos])

  useEffect(() => {
    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url)
      })
    }
  }, [urls])

  /*
   * 全画面中は背面スクロールを止める
   */
  useEffect(() => {
    const oldOverflow =
      document.body.style.overflow

    document.body.style.overflow =
      'hidden'

    return () => {
      document.body.style.overflow =
        oldOverflow

      if (
        animationTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          animationTimerRef.current
        )
      }
    }
  }, [])

  useEffect(() => {
    if (photos.length === 0) {
      onClose()
      return
    }

    setCurrentIndex(
      (index) =>
        Math.min(
          index,
          photos.length - 1
        )
    )
  }, [
    photos.length,
    onClose,
  ])

  const photo =
    photos[currentIndex]

  const stageWidth =
    stageRef.current?.clientWidth ||
    window.innerWidth

  /*
   * timer
   */
  const clearAnimationTimer =
    () => {
      if (
        animationTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          animationTimerRef.current
        )
      }

      animationTimerRef.current =
        null
    }

  /*
   * zoom reset
   */
  const resetZoom = () => {
    scaleRef.current =
      MIN_SCALE

    imageOffsetRef.current = {
      x: 0,
      y: 0,
    }

    setScale(MIN_SCALE)

    setImageOffset({
      x: 0,
      y: 0,
    })
  }

  const syncTrack = (
    value: number
  ) => {
    trackDragXRef.current =
      value

    setTrackDragX(value)
  }

  /*
   * Pointer Captureを明示解除
   */
  const releaseAllPointers =
    () => {
      const stage =
        stageRef.current

      if (stage) {
        activePointersRef.current.forEach(
          (_, pointerId) => {
            try {
              if (
                stage.hasPointerCapture(
                  pointerId
                )
              ) {
                stage.releasePointerCapture(
                  pointerId
                )
              }
            } catch {
              // Android等で解除済みでも
              // gesture処理を続行する
            }
          }
        )
      }

      activePointersRef.current.clear()

      primaryPointerIdRef.current =
        null

      gestureModeRef.current =
        'none'
    }

  /*
   * 写真切替
   */
  const changePhoto = (
    direction: -1 | 1
  ) => {
    const nextIndex =
      currentIndex + direction

    if (
      nextIndex < 0 ||
      nextIndex >= photos.length ||
      scaleRef.current >
        SCALE_EPSILON
    ) {
      return
    }

    clearAnimationTimer()

    setSlideAnimating(true)

    syncTrack(
      direction > 0
        ? -stageWidth
        : stageWidth
    )

    animationTimerRef.current =
      window.setTimeout(
        () => {
          setCurrentIndex(
            nextIndex
          )

          onIndexChange(
            nextIndex
          )

          resetZoom()

          setSlideAnimating(false)

          syncTrack(0)

          gestureModeRef.current =
            'none'
        },
        SLIDE_DURATION
      )
  }

  /*
   * swipe不成立
   */
  const snapTrackBack = () => {
    clearAnimationTimer()

    setSlideAnimating(true)

    syncTrack(0)

    animationTimerRef.current =
      window.setTimeout(
        () => {
          setSlideAnimating(false)

          gestureModeRef.current =
            'none'
        },
        SLIDE_DURATION
      )
  }

  /*
   * pan制限
   */
  const getPanBounds = (
    nextScale: number
  ) => {
    const stage =
      stageRef.current

    const image =
      imageRef.current

    if (
      !stage ||
      !image
    ) {
      return {
        x: 0,
        y: 0,
      }
    }

    const baseWidth =
      Math.min(
        image.naturalWidth,
        stage.clientWidth
      )

    const baseHeight =
      Math.min(
        image.naturalHeight,
        stage.clientHeight
      )

    return {
      x: Math.max(
        0,
        (
          baseWidth *
            nextScale -
          stage.clientWidth
        ) / 2
      ),

      y: Math.max(
        0,
        (
          baseHeight *
            nextScale -
          stage.clientHeight
        ) / 2
      ),
    }
  }

  const constrainOffset = (
    point: Point,
    nextScale: number
  ): Point => {
    const bounds =
      getPanBounds(nextScale)

    return {
      x: clamp(
        point.x,
        -bounds.x,
        bounds.x
      ),

      y: clamp(
        point.y,
        -bounds.y,
        bounds.y
      ),
    }
  }

  /*
   * double tap
   */
  const applyDoubleTap = (
    point: Point
  ) => {
    gestureModeRef.current =
      'doubletap'

    if (
      scaleRef.current >
      SCALE_EPSILON
    ) {
      resetZoom()
      return
    }

    const rect =
      stageRef.current
        ?.getBoundingClientRect()

    const center =
      rect
        ? {
            x:
              rect.left +
              rect.width / 2,

            y:
              rect.top +
              rect.height / 2,
          }
        : point

    const nextOffset =
      constrainOffset(
        {
          x:
            (
              center.x -
              point.x
            ) *
            (
              DOUBLE_TAP_SCALE -
              1
            ),

          y:
            (
              center.y -
              point.y
            ) *
            (
              DOUBLE_TAP_SCALE -
              1
            ),
        },
        DOUBLE_TAP_SCALE
      )

    scaleRef.current =
      DOUBLE_TAP_SCALE

    imageOffsetRef.current =
      nextOffset

    setScale(
      DOUBLE_TAP_SCALE
    )

    setImageOffset(
      nextOffset
    )
  }

  /*
   * pinch開始
   */
  const startPinch = () => {
    const points =
      [
        ...activePointersRef
          .current
          .values(),
      ]

    if (
      points.length < 2
    ) {
      return
    }

    const center =
      midpoint(
        points[0],
        points[1]
      )

    pinchStartRef.current = {
      distance:
        distance(
          points[0],
          points[1]
        ),

      scale:
        scaleRef.current,

      image:
        imageOffsetRef.current,

      center,
    }

    gestureModeRef.current =
      'pinch'
  }

  /*
   * Pointer Down
   */
  const handlePointerDown = (
    event:
      ReactPointerEvent<HTMLDivElement>
  ) => {
    if (slideAnimating) {
      return
    }


    const point = {
      x: event.clientX,
      y: event.clientY,
    }

    activePointersRef.current.set(
      event.pointerId,
      point
    )

    /*
     * 2本指 → pinch
     */
    if (
      activePointersRef.current.size ===
      2
    ) {
      lastTapRef.current =
        null

      startPinch()

      return
    }

    /*
     * double tap
     */
    const lastTap =
      lastTapRef.current

    if (
      lastTap &&
      Date.now() -
        lastTap.time <=
        DOUBLE_TAP_MS &&
      distance(
        lastTap.point,
        point
      ) <=
        DOUBLE_TAP_DISTANCE
    ) {
      lastTapRef.current =
        null

      primaryPointerIdRef.current =
        event.pointerId

      applyDoubleTap(point)

      return
    }

    primaryPointerIdRef.current =
      event.pointerId

    gestureStartRef.current = {
      point,
      image:
        imageOffsetRef.current,
    }

    gestureModeRef.current =
      scaleRef.current >
      SCALE_EPSILON
        ? 'pan'
        : 'pending'
  }

  /*
   * Pointer Move
   */
  const handlePointerMove = (
    event:
      ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      !activePointersRef.current.has(
        event.pointerId
      )
    ) {
      return
    }

    const point = {
      x: event.clientX,
      y: event.clientY,
    }

    activePointersRef.current.set(
      event.pointerId,
      point
    )

    /*
     * pinch
     */
    if (
      activePointersRef.current.size >=
      2
    ) {
      if (
        gestureModeRef.current !==
        'pinch'
      ) {
        startPinch()
      }

      const points =
        [
          ...activePointersRef
            .current
            .values(),
        ]

      const start =
        pinchStartRef.current

      const center =
        midpoint(
          points[0],
          points[1]
        )

      const nextScale =
        clamp(
          start.scale *
            (
              distance(
                points[0],
                points[1]
              ) /
              Math.max(
                1,
                start.distance
              )
            ),
          MIN_SCALE,
          MAX_SCALE
        )

      const ratio =
        nextScale /
        start.scale

      const nextOffset =
        constrainOffset(
          {
            x:
              center.x -
              start.center.x +
              start.image.x *
                ratio,

            y:
              center.y -
              start.center.y +
              start.image.y *
                ratio,
          },
          nextScale
        )

      scaleRef.current =
        nextScale

      const finalOffset =
        nextScale <=
        SCALE_EPSILON
          ? {
              x: 0,
              y: 0,
            }
          : nextOffset

      imageOffsetRef.current =
        finalOffset

      setScale(
        nextScale
      )

      setImageOffset(
        finalOffset
      )

      return
    }

    if (
      event.pointerId !==
      primaryPointerIdRef.current
    ) {
      return
    }

    const dx =
      point.x -
      gestureStartRef.current
        .point.x

    const dy =
      point.y -
      gestureStartRef.current
        .point.y

    let mode =
      gestureModeRef.current

    /*
     * 軸確定
     */
    if (
      mode === 'pending' &&
      Math.hypot(
        dx,
        dy
      ) >=
        GESTURE_LOCK
    ) {
      if (
        Math.abs(dx) >
        Math.abs(dy) *
          1.05
      ) {
        mode = 'swipe'
      }

      gestureModeRef.current =
        mode
    }

    /*
     * swipe
     */
    if (
      mode === 'swipe'
    ) {
      const atEdge =
        (
          dx > 0 &&
          currentIndex === 0
        ) ||
        (
          dx < 0 &&
          currentIndex ===
            photos.length - 1
        )

      syncTrack(
        atEdge
          ? dx * 0.28
          : dx
      )

      return
    }

    /*
     * pan
     */
    if (
      mode === 'pan'
    ) {
      const nextOffset =
        constrainOffset(
          {
            x:
              gestureStartRef
                .current
                .image.x +
              dx,

            y:
              gestureStartRef
                .current
                .image.y +
              dy,
          },
          scaleRef.current
        )

      imageOffsetRef.current =
        nextOffset

      setImageOffset(
        nextOffset
      )
    }
  }

  /*
   * Pointer Up
   */
  const endPointer = (
    event:
      ReactPointerEvent<HTMLDivElement>
  ) => {
    try {
      if (
        event.currentTarget
          .hasPointerCapture(
            event.pointerId
          )
      ) {
        event.currentTarget
          .releasePointerCapture(
            event.pointerId
          )
      }
    } catch {
      // 解除済みでも継続
    }

    const wasPrimary =
      event.pointerId ===
      primaryPointerIdRef.current

    activePointersRef.current.delete(
      event.pointerId
    )

    /*
     * pinch終了
     */
    if (
      gestureModeRef.current ===
      'pinch'
    ) {
      if (
        activePointersRef.current.size ===
        1
      ) {
        const [
          remainingId,
          remainingPoint,
        ] =
          [
            ...activePointersRef
              .current
              .entries(),
          ][0]

        primaryPointerIdRef.current =
          remainingId

        gestureStartRef.current = {
          point:
            remainingPoint,

          image:
            imageOffsetRef.current,
        }

        gestureModeRef.current =
          scaleRef.current >
          SCALE_EPSILON
            ? 'pan'
            : 'pending'
      } else if (
        activePointersRef.current.size ===
        0
      ) {
        gestureModeRef.current =
          'none'
      }

      return
    }

    if (
      !wasPrimary
    ) {
      return
    }

    const mode =
      gestureModeRef.current

    const movement =
      distance(
        gestureStartRef.current
          .point,
        {
          x: event.clientX,
          y: event.clientY,
        }
      )

    /*
     * swipe終了
     */
    if (
      mode === 'swipe'
    ) {
      if (
        Math.abs(
          trackDragXRef.current
        ) >=
        SWIPE_THRESHOLD
      ) {
        changePhoto(
          trackDragXRef.current <
            0
            ? 1
            : -1
        )
      } else {
        snapTrackBack()
      }
    }

    /*
     * tap
     */
    else if (
      (
        mode ===
          'pending' ||
        mode ===
          'pan'
      ) &&
      movement <
        GESTURE_LOCK
    ) {
      lastTapRef.current = {
        time:
          Date.now(),

        point: {
          x: event.clientX,
          y: event.clientY,
        },
      }

      gestureModeRef.current =
        'none'
    }

    /*
     * double tap終了
     */
    else if (
      mode ===
      'doubletap'
    ) {
      gestureModeRef.current =
        'none'
    }

    else {
      gestureModeRef.current =
        'none'
    }

    primaryPointerIdRef.current =
      null
  }

  /*
   * Pointer Cancel
   */
  const handlePointerCancel =
    () => {
      releaseAllPointers()

      lastTapRef.current =
        null

      syncTrack(0)

      setSlideAnimating(
        false
      )
    }

  /*
   * ± zoom
   */
  const handleWheel = (
    delta: number
  ) => {
    const nextScale =
      clamp(
        scaleRef.current +
          (
            delta > 0
              ? -0.5
              : 0.5
          ),
        MIN_SCALE,
        MAX_SCALE
      )

    scaleRef.current =
      nextScale

    const nextOffset =
      nextScale ===
      MIN_SCALE
        ? {
            x: 0,
            y: 0,
          }
        : constrainOffset(
            imageOffsetRef.current,
            nextScale
          )

    imageOffsetRef.current =
      nextOffset

    setScale(
      nextScale
    )

    setImageOffset(
      nextOffset
    )
  }

  /*
   * 3 slide
   */
  const previous =
    currentIndex > 0
      ? photos[
          currentIndex - 1
        ]
      : undefined

  const next =
    currentIndex <
    photos.length - 1
      ? photos[
          currentIndex + 1
        ]
      : undefined

  const slides = [
    previous,
    photo,
    next,
  ]

  const trackTransition =
    slideAnimating
      ? `transform ${SLIDE_DURATION}ms ${SLIDE_EASING}`
      : 'none'

  if (!photo) {
    return null
  }

  return (
    <div
      ref={viewerRef}
      className="field-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${boundaryPointName}の写真`}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.key ===
          'Escape'
        ) {
          onClose()
        } else if (
          event.key ===
          'ArrowLeft'
        ) {
          changePhoto(-1)
        } else if (
          event.key ===
          'ArrowRight'
        ) {
          changePhoto(1)
        }
      }}
    >
      <header
        className="field-viewer-header"
      >
        <button
          className="field-viewer-close"
          type="button"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>

        <div
          className="field-viewer-title"
        >
          <strong>
            {boundaryPointName}
          </strong>

          <span>
            {currentIndex + 1}
            {' / '}
            {photos.length}
          </span>
        </div>

        <div
          className="field-viewer-zoom"
          aria-label="ズーム操作"
        >
          <button
            type="button"
            onClick={() =>
              handleWheel(1)
            }
            aria-label="縮小"
          >
            −
          </button>

          <span>
            {Math.round(
              scale * 100
            )}
            %
          </span>

          <button
            type="button"
            onClick={() =>
              handleWheel(-1)
            }
            aria-label="拡大"
          >
            ＋
          </button>
        </div>
      </header>

      <main
        ref={stageRef}
        className={
          `field-viewer-stage${
            scale >
            SCALE_EPSILON
              ? ' zoomed'
              : ''
          }`
        }
        onPointerDown={
          handlePointerDown
        }
        onPointerMove={
          handlePointerMove
        }
        onPointerUp={
          endPointer
        }
        onPointerCancel={
          handlePointerCancel
        }
        onWheel={(event) => {
          event.preventDefault()
          handleWheel(
            event.deltaY
          )
        }}
      >
        <div
          className="field-viewer-track"
          style={{
            width:
              `${stageWidth * 3}px`,

            transform:
              `translate3d(${
                -stageWidth +
                trackDragX
              }px, 0, 0)`,

            transition:
              trackTransition,
          }}
        >
          {slides.map(
            (item, slot) => (
              <div
                className="field-viewer-slide"
                style={{
                  width:
                    `${stageWidth}px`,
                }}
                key={
                  item?.id ??
                  `empty-${slot}`
                }
              >
                {item && (
                  <img
                    ref={
                      slot === 1
                        ? imageRef
                        : undefined
                    }
                    className={
                      slot === 1
                        ? 'field-viewer-image'
                        : 'field-viewer-neighbor-image'
                    }
                    src={
                      urls.get(
                        item.id
                      )
                    }
                    alt={
                      item.fileName
                    }
                    draggable={
                      false
                    }
                    style={
                      slot === 1
                        ? {
                            transform:
                              `translate3d(${imageOffset.x}px, ${imageOffset.y}px, 0) scale(${scale})`,
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            )
          )}
        </div>
      </main>

      {scale <=
        SCALE_EPSILON &&
        photos.length >
          1 && (
          <>
            {currentIndex >
              0 && (
              <button
                className="field-viewer-arrow field-viewer-arrow-left"
                type="button"
                onClick={() =>
                  changePhoto(-1)
                }
                aria-label="前の写真"
              >
                ‹
              </button>
            )}

            {currentIndex <
              photos.length -
                1 && (
              <button
                className="field-viewer-arrow field-viewer-arrow-right"
                type="button"
                onClick={() =>
                  changePhoto(1)
                }
                aria-label="次の写真"
              >
                ›
              </button>
            )}
          </>
        )}

      <footer
        className="field-viewer-footer"
      >
        <span
          className="field-viewer-file-name"
          title={
            photo.fileName
          }
        >
          {photo.fileName}
        </span>

        <label
          className="field-viewer-category"
        >
          <span>
            写真種別
          </span>

          <select
            value={
              photo.category ??
              ''
            }
            onChange={(
              event
            ) =>
              void onCategoryChange(
                photo,
                event.target
                  .value
              )
            }
          >
            <option value="">
              未選択
            </option>

            {categories.map(
              (category) => (
                <option
                  key={
                    category
                  }
                  value={
                    category
                  }
                >
                  {category}
                </option>
              )
            )}
          </select>
        </label>

        <button
          className="field-viewer-delete"
          type="button"
          onClick={async () => {
            const deleted =
              await onDelete(
                photo
              )

            if (
              deleted &&
              photos.length ===
                1
            ) {
              onClose()
            }
          }}
        >
          削除
        </button>
      </footer>
    </div>
  )
}

export default PhotoViewerV2