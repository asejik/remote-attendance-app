import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// IMPORT THESE FOR CAMERA TO WORK ON WEB
import { defineCustomElements } from '@ionic/pwa-elements/loader';

import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import { requestPersistentStorage } from './lib/storage';
import { removeLegacyDeviceData } from './lib/legacyCleanup';
import { queue } from './lib/queue';
import { initMonitoring } from './lib/monitoring';

initMonitoring();

// Call the loader
defineCustomElements(window);

// The native app bundles its files, so only the web app needs the service worker.
if (!Capacitor.isNativePlatform()) {
  registerSW({ immediate: true });
}
requestPersistentStorage();
removeLegacyDeviceData();
queue.prune().catch((err) => console.error('Queue prune failed', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);