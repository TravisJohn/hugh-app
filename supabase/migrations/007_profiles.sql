-- ── User profiles ─────────────────────────────────────────────────────────
-- Stores the subscription plan per user.
-- A trigger auto-creates a row in this table whenever a new auth user signs up,
-- so every user always has a profile without any manual insert from the app.

CREATE TABLE IF NOT EXISTS profiles (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan       TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own profile only
CREATE POLICY "profiles_owner" ON profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Auto-create profile on signup ─────────────────────────────────────────
-- SECURITY DEFINER lets this function run as the DB owner so it can write
-- to public.profiles even though the inserting user doesn't exist yet.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
