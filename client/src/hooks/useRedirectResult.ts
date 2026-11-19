import { useEffect, useState } from 'react';
import { redirectError, withoutRedirectError } from '../lib/auth';

/**
 * What the page learned from the address it opened with, read once before Supabase handles it:
 * - error: the message for a failed Google sign-in, confirmation or reset link, or null;
 * - fromRedirect: true when it came back from Supabase with a sign-in code (?code=).
 * The error parameters are then removed from the address bar, so a reload doesn't show them again.
 */
export function useRedirectResult() {
  const [result] = useState(() => ({
    error: redirectError(window.location.search, window.location.hash),
    fromRedirect: new URLSearchParams(window.location.search).has('code'),
  }));

  useEffect(() => {
    if (result.error) window.history.replaceState(window.history.state, '', withoutRedirectError(window.location.href));
  }, [result.error]);

  return result;
}
