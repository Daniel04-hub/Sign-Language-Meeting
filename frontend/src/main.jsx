import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Bootstrap CSS must come before our overrides
import 'bootstrap/dist/css/bootstrap.min.css';
// Bootstrap JS bundle (includes Popper — needed for dropdowns, tooltips, modals)
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
// Our dark-theme overrides and custom classes (loaded after Bootstrap so they win)
import './index.css';

import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
