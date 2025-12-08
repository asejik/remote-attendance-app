import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// IMPORT THESE FOR CAMERA TO WORK ON WEB
import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Call the loader
defineCustomElements(window);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);