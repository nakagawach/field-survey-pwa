import type { ButtonHTMLAttributes, PointerEvent } from 'react'

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerUp' | 'type'
> & {
  onPress: () => void
}

export default function ActionButton({ onPress, disabled, ...props }: Props) {
  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    // pointerupを実処理の起点に固定する。
    // 後続のsynthetic clickには処理を持たせないため、
    // Androidのpost-gesture click抑止と二重発火の両方を避ける。
    event.preventDefault()
    onPress()
  }

  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      onPointerUp={handlePointerUp}
      onClick={(event) => {
        // キーボード/支援技術によるclickだけを受ける。
        // pointer由来のclickはdetail > 0なので無視する。
        if (!disabled && event.detail === 0) onPress()
      }}
    />
  )
}
