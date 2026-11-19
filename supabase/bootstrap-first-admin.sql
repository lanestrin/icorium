-- First Admin (run once per Supabase project, after the identity migration).
-- Contract 5 in blueprint/hosted-services.md: the project owner becomes the first Admin by
-- accepting a normal invitation. No application code can create an Admin without an existing one.
--
-- Replace owner@example.com with the project owner's real address (lowercase) in the SQL editor
-- before running. Never commit the real address.
insert into public.invitations (email, role) values ('owner@example.com', 'Admin');
