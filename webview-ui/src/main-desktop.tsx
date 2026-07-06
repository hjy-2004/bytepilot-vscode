import React from 'react';
import ReactDOM from 'react-dom/client';
import AppDesktop from './AppDesktop';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/theme-desktop.css';
import './styles/global.css';
import './styles/desktop-layout.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <AppDesktop />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
