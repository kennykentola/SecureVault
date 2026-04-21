import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const savedTheme = localStorage.getItem('app-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

try {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
} catch (e) {
    document.body.innerHTML = `<div style="color:white; background:red; padding:20px;"><h1>CRASH DETECTED</h1><pre>${e}</pre></div>`;
    console.error("BOOT CRASH:", e);
}

