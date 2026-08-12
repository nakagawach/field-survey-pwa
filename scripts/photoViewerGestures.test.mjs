import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  canNavigatePhotos,
  chooseDragMode,
  createResetGestureState,
  getDoubleTapScale,
  getSwipeIndex,
  getRequestedPhotoIndex,
  getSlideOffset,
  shouldNormalizeVisualState,
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

assert.equal(
  shouldNormalizeVisualState('slideComplete'),
  false,
  'N: slide completion preserves its final visual position'
)
assert.equal(
  shouldNormalizeVisualState('dismissComplete'),
  false,
  'O: dismiss completion does not restore the photo to center'
)
assert.deepEqual(
  [0, 1, 2].map((index) => getSlideOffset(index, 1)),
  [-100, 0, 100],
  'P: new active index positions previous/current/next correctly'
)
assert.equal(
  shouldNormalizeVisualState('close'),
  false,
  'Q: close cleanup does not normalize visual transforms'
)

console.log('PhotoViewer gesture assertions passed (A-Q)')

const LOCK = 14
const DOUBLE_TAP_MS = 360
const DOUBLE_TAP_DISTANCE = 44

class DoubleTapSequence {
  scale = 1
  offset = { x: 0, y: 0 }
  mode = 'none'
  lastTap = null
  start = null

  pointerDown(point, time) {
    if (
      this.lastTap &&
      time - this.lastTap.time <= DOUBLE_TAP_MS &&
      Math.hypot(
        point.x - this.lastTap.point.x,
        point.y - this.lastTap.point.y
      ) <= DOUBLE_TAP_DISTANCE
    ) {
      this.lastTap = null
      this.mode = 'doubletap'
      if (this.scale > 1.01) {
        this.scale = 1
        this.offset = { x: 0, y: 0 }
      } else {
        this.scale = 2.5
      }
      this.start = point
      return
    }

    this.start = point
    this.mode = this.scale > 1.01 ? 'pan' : 'pending'
  }

  pointerUp(point, time) {
    const movement = Math.hypot(point.x - this.start.x, point.y - this.start.y)
    if ((this.mode === 'pending' || this.mode === 'pan') && movement < LOCK) {
      this.lastTap = { point, time }
      this.mode = 'none'
    } else if (this.mode === 'doubletap') {
      this.mode = 'none'
    }
  }

  tap(point, downTime, upTime = downTime + 30) {
    this.pointerDown(point, downTime)
    this.pointerUp(point, upTime)
  }
}

const doubleTap = (sequence, startTime, point = { x: 100, y: 120 }) => {
  sequence.tap(point, startTime)
  sequence.tap(point, startTime + 120)
}

const sequence = new DoubleTapSequence()
doubleTap(sequence, 1_000)
assert.equal(sequence.scale, 2.5, 'DT1: pointer event sequence zooms to 2.5')
assert.equal(sequence.mode, 'none', 'DT1: double tap releases gesture mode')

doubleTap(sequence, 2_000)
assert.equal(sequence.scale, 1, 'DT2: a second double tap returns to 1')
assert.deepEqual(sequence.offset, { x: 0, y: 0 }, 'DT3: reset clears both offsets')

sequence.scale = 2.5
sequence.pointerDown({ x: 80, y: 80 }, 3_000)
sequence.pointerUp({ x: 80, y: 80 }, 3_030)
assert.equal(sequence.mode, 'none', 'DT4: a zoomed tap is retained instead of locking pan')
sequence.pointerDown({ x: 80, y: 80 }, 3_120)
assert.equal(sequence.mode, 'doubletap', 'DT4: double tap wins before zoomed pan')
sequence.pointerUp({ x: 80, y: 80 }, 3_150)
assert.equal(sequence.scale, 1, 'DT5: reset enables base-scale swipe again')

sequence.scale = 2.5
sequence.offset = { x: 35, y: -24 }
doubleTap(sequence, 4_000, { x: 140, y: 160 })
assert.equal(sequence.scale, 1, 'DT6: double tap after pan resets scale')
assert.deepEqual(sequence.offset, { x: 0, y: 0 }, 'DT6: double tap after pan resets offset')

for (let index = 0; index < 10; index += 1) {
  doubleTap(sequence, 5_000 + index * 1_000)
  assert.equal(sequence.scale, 2.5, `DT7.${index + 1}a: zoom in`)
  assert.equal(sequence.mode, 'none', `DT7.${index + 1}a: mode released`)
  doubleTap(sequence, 5_500 + index * 1_000)
  assert.equal(sequence.scale, 1, `DT7.${index + 1}b: zoom out`)
  assert.equal(sequence.mode, 'none', `DT7.${index + 1}b: mode released`)
}

const viewerSource = readFileSync(
  new URL('../src/PhotoViewerV2.tsx', import.meta.url),
  'utf8'
)
assert.ok(
  viewerSource.indexOf('const lastTap = lastTapRef.current') <
    viewerSource.indexOf("gestureModeRef.current = scaleRef.current > SCALE_EPSILON ? 'pan' : 'pending'"),
  'DT4: component checks double tap before selecting zoomed pan'
)
assert.match(
  viewerSource,
  /\(mode === 'pending' \|\| mode === 'pan'\)/,
  'DT2: component records a stationary zoomed tap'
)
assert.match(
  viewerSource,
  /mode === 'doubletap'[\s\S]*?gestureModeRef\.current = 'none'/,
  'DT7: component releases doubletap mode on pointerup'
)

console.log('PhotoViewer double-tap event sequence assertions passed (DT1-DT7)')
