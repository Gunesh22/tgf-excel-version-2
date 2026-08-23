import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// Suppress noisy Chrome Extension (e.g., MetaMask) warnings from cluttering the console
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('MaxListenersExceededWarning') ||
      args[0].includes('ObjectMultiplex') ||
      args[0].includes('app-init-liveness') ||
      args[0].includes('background-liveness'))
  ) {
    return;
  }
  originalWarn(...args);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
