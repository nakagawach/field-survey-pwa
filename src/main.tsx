import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ImmediateTouchButtons from './ImmediateTouchButtons.tsx'
import UpdatePrompt from './UpdatePrompt.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ImmediateTouchButtons>
      <App />
      <UpdatePrompt />
    </ImmediateTouchButtons>
  </StrictMode>,
)
