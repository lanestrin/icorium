import { lazy, Suspense } from 'react';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AccessGate, PageStatus } from './components/layout/AccessGate';
import { PAGES } from './lib/pages';

// Every page downloads only when opened, and AccessGate opens a protected page only for an account allowed to see it,
// so a denied page's code is never downloaded by the app.
const FilesPage = lazy(() => import('./pages/FilesPage').then((m) => ({ default: m.FilesPage })));
const GeneratorPage = lazy(() => import('./pages/GeneratorPage').then((m) => ({ default: m.GeneratorPage })));
const ArchitecturePage = lazy(() => import('./pages/ArchitecturePage').then((m) => ({ default: m.ArchitecturePage })));
const SignInPage = lazy(() => import('./pages/SignInPage').then((m) => ({ default: m.SignInPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ActivatePage = lazy(() => import('./pages/ActivatePage').then((m) => ({ default: m.ActivatePage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));

/** Picks the page from the URL: each path in PAGES has its own page; anything else is the file workspace. Only the sign-in pages are public (17.6). */
function CurrentPage() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === PAGES.generator) return <AccessGate requirement="admin">{(account) => <GeneratorPage account={account} />}</AccessGate>;
  if (path === PAGES.architecture) return <AccessGate requirement="admin">{(account) => <ArchitecturePage account={account} />}</AccessGate>;
  if (path === PAGES.admin) return <AccessGate requirement="admin">{(account) => <AdminPage account={account} />}</AccessGate>;
  if (path === PAGES.signIn) return <SignInPage />;
  if (path === PAGES.activate) return <ActivatePage />;
  if (path === PAGES.resetPassword) return <ResetPasswordPage />;
  return <AccessGate requirement="workspace">{(account) => <FilesPage account={account} />}</AccessGate>;
}

/**
 * The app: the current page, with a readable message instead of a blank screen if it fails to render
 * or its code fails to download (Reload page fetches it again).
 */
export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<PageStatus>Loading page…</PageStatus>}>
        <CurrentPage />
      </Suspense>
    </AppErrorBoundary>
  );
}
