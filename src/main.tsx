import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './rebuild/App'
import MobileInputBridge from './rebuild/MobileInputBridge'
import UpdatePrompt from './UpdatePrompt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileInputBridge>
      <App />
      <UpdatePrompt />
    </MobileInputBridge>
  </StrictMode>,
)
