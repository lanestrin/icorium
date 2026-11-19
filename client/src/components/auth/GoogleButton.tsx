import { useState } from 'react';
import { authErrorMessage, redirectUrl } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';
import { Button } from '../ui/Button';

/**
 * Continue with Google. Supabase sends the browser to Google and back to /sign-in, which shows a failed
 * sign-in (such as the invite-only rejection) or opens the file workspace. A new account still needs an
 * invitation, which the sign-up hook checks (17.2a). onError receives the message when the redirect
 * can't start.
 */
export function GoogleButton({ onError }: { onError: (message: string | null) => void }) {
  const [starting, setStarting] = useState(false);

  async function start() {
    onError(null);
    setStarting(true);
    try {
      const supabase = await getSupabase();
      const { error } = (await supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl('/sign-in') } })) ?? { error: null };
      if (!error) return; // the browser is leaving for Google
      onError(authErrorMessage(error));
    } catch (error) {
      onError(authErrorMessage(error));
    }
    setStarting(false);
  }

  return <Button variant="outline" loading={starting} onClick={() => void start()}>Continue with Google</Button>;
}
