import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

import './UpdatePrompt.css'

function UpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [updateServiceWorker, setUpdateServiceWorker] =
    useState<((reloadPage?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedsRefresh(true)
      },
    })

    setUpdateServiceWorker(() => updateSW)
  }, [])

  if (!needsRefresh) {
    return null
  }

  return (
    <aside
      className="update-prompt"
      role="alertdialog"
      aria-labelledby="update-prompt-title"
      aria-describedby="update-prompt-description"
    >
      <div>
        <strong id="update-prompt-title">
          新しいバージョンがあります
        </strong>
        <p id="update-prompt-description">
          更新すると最新版を利用できます。
        </p>
      </div>
      <div className="update-prompt-actions">
        <button
          type="button"
          className="update-prompt-later"
          onClick={() => setNeedsRefresh(false)}
        >
          後で
        </button>
        <button
          type="button"
          className="update-prompt-apply"
          onClick={() => void updateServiceWorker?.(true)}
        >
          更新する
        </button>
      </div>
    </aside>
  )
}

export default UpdatePrompt
