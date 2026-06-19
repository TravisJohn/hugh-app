-- Add admin flag to existing profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Set the platform owner as Pro + admin
-- (runs after column exists; safe to re-run: ON CONFLICT DO NOTHING)
UPDATE profiles
SET    plan     = 'pro',
       is_admin = true
WHERE  user_id = (SELECT id FROM auth.users WHERE email = 'tjmariohn@gmail.com');
