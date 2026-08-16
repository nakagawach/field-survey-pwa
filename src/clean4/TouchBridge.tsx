import { useEffect } from 'react'
import type { ReactNode } from 'react'

type Props = { children: ReactNode }
type PickerCapable = { showPicker?: () => void }

export default function TouchBridge({ children }: Props) {
  useEffect(() => {
    let syntheticClick = false
    let suppressNextTrustedClick = false

    const handlePointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return

      // 前のpointer系列でnative clickが生成されなかった場合も、
      // 新しい操作へ抑止状態を持ち越さない。
      suppressNextTrustedClick = false

      const target = event.target
      if (!(target instanceof Element)) return

      const select = target.closest('select')
      if (select instanceof HTMLSelectElement) {
        const picker = select as HTMLSelectElement & PickerCapable
        if (typeof picker.showPicker === 'function') {
          try {
            picker.showPicker()
            event.preventDefault()
          } catch {
            // 未対応・失敗時はブラウザ標準のselect操作へfallback。
          }
        }
        return
      }

      const fileInput = target.closest('input[type="file"]')
      if (fileInput instanceof HTMLInputElement) {
        const picker = fileInput as HTMLInputElement & PickerCapable
        if (typeof picker.showPicker === 'function') {
          try {
            picker.showPicker()
            event.preventDefault()
          } catch {
            // 未対応・失敗時は実input自身のnative操作へfallback。
          }
        }
      }
    }

    const handlePointerUpCapture = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return

      const target = event.target
      if (!(target instanceof Element)) return

      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement) || button.disabled) return

      // Android Chromiumでgesture終了直後のnative clickが抑止されても、
      // pointerupまで届いたbuttonは同じ操作内で一度だけactivateする。
      syntheticClick = true
      suppressNextTrustedClick = true
      button.click()
      syntheticClick = false
    }

    const handleClickCapture = (event: MouseEvent) => {
      if (syntheticClick) return
      if (!event.isTrusted || !suppressNextTrustedClick) return

      // pointerup内のbutton.click()に続く同一pointer系列のnative clickだけを抑止。
      // 固定時間による抑止は使用しない。
      suppressNextTrustedClick = false
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    document.addEventListener('pointerdown', handlePointerDownCapture, true)
    document.addEventListener('pointerup', handlePointerUpCapture, true)
    document.addEventListener('click', handleClickCapture, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownCapture, true)
      document.removeEventListener('pointerup', handlePointerUpCapture, true)
      document.removeEventListener('click', handleClickCapture, true)
    }
  }, [])

  return <>{children}</>
}
