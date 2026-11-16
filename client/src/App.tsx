import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ArchitecturePage } from './pages/ArchitecturePage';
import { FilesPage } from './pages/FilesPage';
import { GeneratorPage } from './pages/GeneratorPage';
import { PAGES } from './lib/pages';

/** Picks the page from the URL: /generator and /architecture have their own pages; anything else is the file workspace. */
function CurrentPage() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === PAGES.generator) return <GeneratorPage />;
  if (path === PAGES.architecture) return <ArchitecturePage />;
  return <FilesPage />;
}

/** The app: the current page, with a readable message instead of a blank screen if it fails to render. */
export default function App() {
  return (
    <AppErrorBoundary>
      <CurrentPage />
    </AppErrorBoundary>
  );
}
