import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { t } from './i18n/i18n'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackLabel={t('error.appCrash')}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
