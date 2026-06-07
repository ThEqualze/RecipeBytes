/*
# Create shared_recipes table for public recipe sharing

1. New Tables
  - `shared_recipes`
    - `id` (uuid, primary key)
    - `recipe_id` (uuid, FK to recipes, not null)
    - `user_id` (uuid, FK to auth.users, not null, defaults to auth.uid())
    - `token` (text, unique, not null) - public share identifier for URLs
    - `message` (text) - optional message like "I just made this!"
    - `created_at` (timestamptz)

2. Security
  - RLS enabled on `shared_recipes`
  - Authenticated users can CRUD their own shares
  - Anonymous users can SELECT shared_recipes (to resolve tokens)
  - Anonymous users can SELECT recipes that have a corresponding shared_recipes entry
  - Anonymous users can SELECT ingredients for shared recipes
  - Anonymous users can SELECT tags/recipe_tags for shared recipes
  - Anonymous users CANNOT select instructions (gated behind login)

3. Important Notes
  - Instructions remain locked to authenticated users only - this drives signups
  - The token is used in public URLs like /r/{token}
  - Each recipe can have multiple shares (different messages/times)
*/

-- Shared recipes table
CREATE TABLE IF NOT EXISTS shared_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_recipes_token ON shared_recipes(token);
CREATE INDEX IF NOT EXISTS idx_shared_recipes_user_id ON shared_recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_recipes_recipe_id ON shared_recipes(recipe_id);

ALTER TABLE shared_recipes ENABLE ROW LEVEL SECURITY;

-- Owner policies for shared_recipes
DROP POLICY IF EXISTS "select_own_shares" ON shared_recipes;
CREATE POLICY "select_own_shares" ON shared_recipes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_shares" ON shared_recipes;
CREATE POLICY "insert_own_shares" ON shared_recipes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_shares" ON shared_recipes;
CREATE POLICY "delete_own_shares" ON shared_recipes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Anonymous can look up share tokens (needed for public recipe view)
DROP POLICY IF EXISTS "anon_select_shares_by_token" ON shared_recipes;
CREATE POLICY "anon_select_shares_by_token" ON shared_recipes FOR SELECT
  TO anon USING (true);

-- Allow anonymous to read recipes that have been shared publicly
DROP POLICY IF EXISTS "anon_select_shared_recipes" ON recipes;
CREATE POLICY "anon_select_shared_recipes" ON recipes FOR SELECT
  TO anon USING (
    EXISTS (
      SELECT 1 FROM shared_recipes WHERE shared_recipes.recipe_id = recipes.id
    )
  );

-- Allow anonymous to read ingredients for shared recipes
DROP POLICY IF EXISTS "anon_select_shared_ingredients" ON ingredients;
CREATE POLICY "anon_select_shared_ingredients" ON ingredients FOR SELECT
  TO anon USING (
    EXISTS (
      SELECT 1 FROM shared_recipes WHERE shared_recipes.recipe_id = ingredients.recipe_id
    )
  );

-- Allow anonymous to read recipe_tags for shared recipes
DROP POLICY IF EXISTS "anon_select_shared_recipe_tags" ON recipe_tags;
CREATE POLICY "anon_select_shared_recipe_tags" ON recipe_tags FOR SELECT
  TO anon USING (
    EXISTS (
      SELECT 1 FROM shared_recipes WHERE shared_recipes.recipe_id = recipe_tags.recipe_id
    )
  );

-- Allow anonymous to read tags referenced by shared recipes
DROP POLICY IF EXISTS "anon_select_shared_tags" ON tags;
CREATE POLICY "anon_select_shared_tags" ON tags FOR SELECT
  TO anon USING (
    EXISTS (
      SELECT 1 FROM recipe_tags rt
      JOIN shared_recipes sr ON sr.recipe_id = rt.recipe_id
      WHERE rt.tag_id = tags.id
    )
  );

-- NOTE: instructions table does NOT get an anon policy - this is intentional.
-- Users must sign up to see cooking instructions, driving engagement.
