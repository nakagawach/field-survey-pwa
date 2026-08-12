import assert from 'node:assert/strict'

import {
  canNavigatePhotos,
  chooseDragMode,
  createResetGestureState,
  getDoubleTapScale,
  getSwipeIndex,
  getRequestedPhotoIndex,
  shouldDismiss,
} from '../src/photoViewerGestures.ts'

assert.equal(getDoubleTapScale(1), 2.5, 'A: base scale zooms to 2.5')
assert.equal(getDoubleTapScale(2.5), 1, 'B: zoomed scale resets to 1')

const nextIndex = getSwipeIndex(0, 3, -100)
assert.equal(nextIndex, 1, 'C: swipe selects photo 2')
const resetAfterSwipe = createResetGestureState()
assert.equal(
  getDoubleTapScale(resetAfterSwipe.scale),
  2.5,
  'C: reset photo accepts double tap'
)

assert.equal(resetAfterSwipe.lastTap, null, 'D: reset removes previous lastTap')
assert.equal(resetAfterSwipe.tapTimer, null, 'D: reset removes previous tapTimer')

assert.equal(chooseDragMode(2.5, 100, 0), 'pan', 'E: zoomed drag pans')
assert.equal(shouldDismiss(1, 120, 500), true, 'F: 120px dismisses')
assert.equal(shouldDismiss(2.5, 120, 100), false, 'G: zoom cannot dismiss')

assert.equal(createResetGestureState().mode, 'idle', 'H: cancel reset is idle')

assert.equal(canNavigatePhotos(1), true, 'I: base scale enables navigation')
assert.equal(canNavigatePhotos(2.5), false, 'J: double-tap zoom disables navigation')
assert.equal(canNavigatePhotos(4), false, 'K: maximum zoom disables navigation')
assert.equal(
  getRequestedPhotoIndex(0, 3, 1, 2.5),
  null,
  'L: zoomed next/previous request cannot change index'
)
assert.equal(
  getRequestedPhotoIndex(0, 3, 1, 1),
  1,
  'M: returning to base scale enables navigation'
)

console.log('PhotoViewer gesture assertions passed (A-M)')
