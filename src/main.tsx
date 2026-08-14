import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PhotoLibraryPointerUp from './PhotoLibraryPointerUp.tsx'
import UpdatePrompt from './UpdatePrompt.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhotoLibraryPointerUp>
      <App />
      <UpdatePrompt />
    </PhotoLibraryPointerUp>
  </StrictMode>,
)
