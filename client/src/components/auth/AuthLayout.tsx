import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AppVersion } from '../AppVersion';
import { Card } from '../ui/Card';
import page from '../../styles/page.module.scss';
import styles from './auth.module.scss';

/** The frame of a sign-in page: navigation back to CSV Files, the title and intro, and a card for the form. */
export function AuthLayout({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className={page.shell}>
      <main className={styles.page}>
        <div className={styles.content}>
          <nav aria-label="Pages" className={page.nav}>
            <a href="/" className={page.navLink}><ArrowLeft aria-hidden /> Back to CSV Files</a>
            <AppVersion />
          </nav>
          <header className={styles.header}>
            <h1 className={page.title}>{title}</h1>
            {intro && <p className={page.intro}>{intro}</p>}
          </header>
          <Card>{children}</Card>
        </div>
      </main>
    </div>
  );
}

/** What every sign-in page shows on a site without Supabase settings. */
export function NotSetUp({ message }: { message: string }) {
  return <p role="status" className={styles.notice}>{message}</p>;
}
