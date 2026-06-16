import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { AuthGate } from './components/AuthGate';
import { PageSkeleton } from './components/ui';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Investments = lazy(() => import('./pages/Investments'));
const Holdings = lazy(() => import('./pages/Holdings'));
const Fire = lazy(() => import('./pages/Fire'));
const Playbook = lazy(() => import('./pages/Playbook'));
const Goals = lazy(() => import('./pages/Goals'));
const Assistant = lazy(() => import('./pages/Assistant'));
const SettingsPage = lazy(() => import('./pages/Settings'));

function AppRoutes() {
  const loc = useLocation();
  return (
    <ErrorBoundary resetKey={loc.pathname}>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/fire" element={<Fire />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/playbook" element={<Playbook />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthGate>
          <Layout>
            <AppRoutes />
          </Layout>
        </AuthGate>
      </ToastProvider>
    </BrowserRouter>
  );
}
