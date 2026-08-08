import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}
const root = ReactDOM.createRoot(rootEl);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
