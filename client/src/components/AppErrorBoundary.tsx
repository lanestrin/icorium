import { Component, useEffect, useRef, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { classNames } from '../lib/class-names';
import page from '../styles/page.module.scss';
import styles from './AppErrorBoundary.module.scss';

type Props = {
  children: ReactNode;
  /** What Reload page does. Defaults to reloading the browser page; tests pass their own. */
  onReload?: () => void;
};

/**
 * Shows a readable message with a Reload page button when a page throws while rendering, instead of a
 * blank screen. Request failures are not caught here; they stay in the pages' error banners. React
 * already logs the error to the console, so nothing else is logged or sent.
 */
export class AppErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <RenderFailure onReload={this.props.onReload ?? (() => window.location.reload())} />;
  }
}

function RenderFailure({ onReload }: { onReload: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);

  // The page that held focus is gone; put keyboard and screen-reader users on the message.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <main className={classNames(page.shell, styles.page)}>
      <Card className={styles.card}>
        <h1 ref={heading} tabIndex={-1} className={classNames(page.title, styles.heading)}>Something went wrong</h1>
        <p className={styles.message}>This page couldn't be shown. Your files aren't affected. Reload the page to try again.</p>
        <Button icon={<RotateCw aria-hidden="true" />} onClick={onReload}>Reload page</Button>
      </Card>
    </main>
  );
}
