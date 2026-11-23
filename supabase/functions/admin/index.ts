// Supabase Edge Function "admin" (build-plan 17.3): wires the real services to handler.ts.
// Secrets (Supabase dashboard > Edge Functions > Secrets; see supabase/README.md):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  provided by Supabase to every function
//   SITE_URL                                 the site's address, for CORS and the activation link
//   SMTP_USER, SMTP_PASSWORD, SMTP_FROM      the Gmail account, its app password and the sender address
// The service-role key never leaves this function and is never sent to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import nodemailer from 'npm:nodemailer@6.9.16';
import { handleAdminRequest } from './handler.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const mail = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASSWORD') },
});

Deno.serve((request: Request) =>
  handleAdminRequest(request, {
    siteUrl: Deno.env.get('SITE_URL')!,
    verifyToken: async (token) => {
      const { data, error } = await supabase.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    rpc: async (name, args) => {
      const { data, error } = await supabase.rpc(name, args);
      return { data, error: error ? { message: error.message } : null };
    },
    // A ban lasts about a hundred years; reactivation lifts it with "none".
    setBan: async (userId, banned) => {
      const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: banned ? '876000h' : 'none' });
      return !error;
    },
    sendEmail: async ({ to, subject, text }) => {
      await mail.sendMail({ from: Deno.env.get('SMTP_FROM'), to, subject, text });
    },
  }),
);
