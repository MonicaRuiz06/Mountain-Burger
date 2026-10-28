import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { initBackend } from './backend.js';
import App from './App.jsx';

const root = createRoot(document.getElementById('root'));

initBackend()
  .then(() => root.render(<App />))
  .catch(err => {
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h2>No se pudo iniciar la app</h2>
        <p>{String(err.message || err)}</p>
      </div>
    );
  });
