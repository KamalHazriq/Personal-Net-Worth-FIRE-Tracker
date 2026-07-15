import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Confirm';
import { AuthGate } from './components/AuthGate';
import { UiVersionProvider } from './lib/uiVersion';
import { PageSkeleton } from './components/ui';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Investments = lazy(() => import('./pages/Investments'));
const Holdings = lazy(() => import('./pages/Holdings'));
const Fire = lazy(() => import('./pages/Fire'));
const Playbook = lazy(() => import('./pages/Playbook'));
const Goals = lazy(() => import('./pages/Goals'));
const Studio = lazy(() => import('./pages/Studio'));
const Assistant = lazy(() => import('./pages/Assistant'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Recurring = lazy(() => import('./pages/Recurring'));

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
          <Route path="/studio" element={<Studio />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/recurring" element={<Recurring />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UiVersionProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthGate>
              <Layout>
                <AppRoutes />
              </Layout>
            </AuthGate>
          </ConfirmProvider>
        </ToastProvider>
      </UiVersionProvider>
    </BrowserRouter>
  );
}
