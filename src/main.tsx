import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './clean3/App'
import UpdatePrompt from './UpdatePrompt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
)
