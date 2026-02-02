import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary, GlobalErrorFallback } from './components/ErrorBoundary';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary
    fallback={<GlobalErrorFallback onRetry={() => window.location.reload()} />}
    onReset={() => window.location.reload()}
  >
    <App />
  </ErrorBoundary>
);
