import { ArchitecturePage } from './pages/ArchitecturePage';
import { FilesPage } from './pages/FilesPage';
import { GeneratorPage } from './pages/GeneratorPage';

/** Picks the page from the URL: /generator and /architecture have their own pages; anything else is the file workspace. */
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/generator') return <GeneratorPage />;
  if (path === '/architecture') return <ArchitecturePage />;
  return <FilesPage />;
}
