import { lazy, Suspense } from 'react';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { FilesPage } from './pages/FilesPage';
import { PAGES } from './lib/pages';
import page from './styles/page.module.scss';

// The CSV Generator and Architecture pages download only when opened; the file workspace is the
// default page, so it stays in the main bundle.
const GeneratorPage = lazy(() => import('./pages/GeneratorPage').then((m) => ({ default: m.GeneratorPage })));
const ArchitecturePage = lazy(() => import('./pages/ArchitecturePage').then((m) => ({ default: m.ArchitecturePage })));

/** Picks the page from the URL: /generator and /architecture have their own pages; anything else is the file workspace. */
function CurrentPage() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === PAGES.generator) return <GeneratorPage />;
  if (path === PAGES.architecture) return <ArchitecturePage />;
  return <FilesPage />;
}

/** Shown while a page's code downloads; screen readers announce it politely. */
function PageLoading() {
  return (
    <main className={page.shell}>
      <p role="status" className={page.intro}>Loading page…</p>
    </main>
  );
}

/**
 * The app: the current page, with a readable message instead of a blank screen if it fails to render
 * or its code fails to download (Reload page fetches it again).
 */
export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <CurrentPage />
      </Suspense>
    </AppErrorBoundary>
  );
}
