import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import { AdminApp } from './admin/AdminApp';
import './index.css';

const path = window.location.pathname;
const isAdminRoute = path === '/admin' || path.startsWith('/admin/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {isAdminRoute ? <AdminApp /> : <App />}
    </AuthProvider>
  </StrictMode>
);
