import { Buffer } from 'buffer';
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './lib/toolkit';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
