import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import { nativePlatform } from './native/bridge';

if ('serviceWorker' in navigator && import.meta.env.PROD && !nativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update().catch(() => undefined))
      .catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);