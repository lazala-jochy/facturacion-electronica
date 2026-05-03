import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultDocumentTitle } from './utils/productBranding'
import './index.css'
import App from './App.tsx'

document.title = defaultDocumentTitle

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
