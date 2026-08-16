import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './clean4/App'
import TouchBridge from './clean4/TouchBridge'
import UpdatePrompt from './UpdatePrompt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TouchBridge>
      <App />
      <UpdatePrompt />
    </TouchBridge>
  </StrictMode>,
)
