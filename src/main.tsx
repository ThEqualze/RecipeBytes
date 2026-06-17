import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import { AdminApp } from './admin/AdminApp';
import { ResetPassword } from './components/ResetPassword';
import './index.css';

const path = window.location.pathname;
const isAdminRoute = path === '/admin' || path.startsWith('/admin/');
const isResetRoute = path === '/reset';

function Root() {
  if (isResetRoute) return <ResetPassword />;
  if (isAdminRoute) return <AdminApp />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>
);
