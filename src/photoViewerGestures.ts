export type GestureMode =
  | 'idle'
  | 'pending'
  | 'horizontalSwipe'
  | 'verticalDismiss'
  | 'pan'
  | 'pinch'
  | 'animating'

export type Point = { x: number; y: number }

export const DOUBLE_TAP_SCALE = 2.5
export const MAX_SCALE = 4
export const SCALE_EPSILON = 1.01
export const AXIS_LOCK_DISTANCE = 8
export const SWIPE_THRESHOLD = 64
export const DISMISS_THRESHOLD = 120
export const DISMISS_VELOCITY = 0.55

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const isBaseScale = (scale: number) => scale <= SCALE_EPSILON

export const canNavigatePhotos = (scale: number) => isBaseScale(scale)

export const getRequestedPhotoIndex = (
  activeIndex: number,
  photoCount: number,
  nextIndex: number,
  scale: number
) =>
  canNavigatePhotos(scale) &&
  nextIndex >= 0 &&
  nextIndex < photoCount &&
  nextIndex !== activeIndex
    ? nextIndex
    : null

export const getDoubleTapScale = (scale: number) =>
  isBaseScale(scale) ? DOUBLE_TAP_SCALE : 1

export const getDistance = (first: Point, second: Point) =>
  Math.hypot(second.x - first.x, second.y - first.y)

export const getMidpoint = (first: Point, second: Point): Point => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
})

export const chooseDragMode = (
  scale: number,
  deltaX: number,
  deltaY: number
): GestureMode => {
  if (!isBaseScale(scale)) return 'pan'
  if (Math.hypot(deltaX, deltaY) < AXIS_LOCK_DISTANCE) return 'pending'
  if (deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
    return 'verticalDismiss'
  }
  if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
    return 'horizontalSwipe'
  }
  return 'pending'
}

export const shouldDismiss = (
  scale: number,
  deltaY: number,
  elapsedMs: number
) =>
  isBaseScale(scale) &&
  (deltaY >= DISMISS_THRESHOLD ||
    deltaY / Math.max(elapsedMs, 1) >= DISMISS_VELOCITY)

export const getSwipeIndex = (
  activeIndex: number,
  photoCount: number,
  deltaX: number
) => {
  if (Math.abs(deltaX) < SWIPE_THRESHOLD) return null
  const nextIndex = activeIndex + (deltaX < 0 ? 1 : -1)
  return nextIndex >= 0 && nextIndex < photoCount ? nextIndex : null
}

export const getPanBounds = (
  imageWidth: number,
  imageHeight: number,
  stageWidth: number,
  stageHeight: number,
  scale: number
) => ({
  x: Math.max(0, (imageWidth * scale - stageWidth) / 2),
  y: Math.max(0, (imageHeight * scale - stageHeight) / 2),
})

export const createResetGestureState = () => ({
  scale: 1,
  pan: { x: 0, y: 0 },
  drag: { x: 0, y: 0 },
  mode: 'idle' as GestureMode,
  pendingIndex: null,
  lastTap: null,
  tapTimer: null,
})
