import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DirectPhotoLibraryPointerUp from './DirectPhotoLibraryPointerUp.tsx'
import ImmediateTouchButtons from './ImmediateTouchButtons.tsx'
import UpdatePrompt from './UpdatePrompt.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ImmediateTouchButtons>
      <DirectPhotoLibraryPointerUp />
      <App />
      <UpdatePrompt />
    </ImmediateTouchButtons>
  </StrictMode>,
)
