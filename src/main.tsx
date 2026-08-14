import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ImmediateTouchButtons from './ImmediateTouchButtons.tsx'
import PhotoLibraryPointerDown from './PhotoLibraryPointerDown.tsx'
import UpdatePrompt from './UpdatePrompt.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ImmediateTouchButtons>
      <PhotoLibraryPointerDown>
        <App />
        <UpdatePrompt />
      </PhotoLibraryPointerDown>
    </ImmediateTouchButtons>
  </StrictMode>,
)
