/*
  # Auto-create profile on signup

  Creates a trigger function that inserts a row into `profiles` whenever a
  new user signs up via `auth.users`. The display name is pulled from raw
  user metadata if available, otherwise left empty.

  ## Changes
  - New function `handle_new_user()` in public schema
  - Trigger `on_auth_user_created` on `auth.users`
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'display_name', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
