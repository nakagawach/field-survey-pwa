import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './v1/styles.css'
import App from './v1/App.tsx'
import UpdatePrompt from './UpdatePrompt.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
)
