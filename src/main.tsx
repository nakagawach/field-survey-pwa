import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import UpdatePrompt from './UpdatePrompt.tsx'
import PhotoSwipePoc from './PhotoSwipePoc.tsx'

const isPhotoSwipePoc = window.location.pathname.endsWith('/photoswipe-poc')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPhotoSwipePoc ? (
      <PhotoSwipePoc />
    ) : (
      <>
        <App />
        <UpdatePrompt />
      </>
    )}
  </StrictMode>,
)
