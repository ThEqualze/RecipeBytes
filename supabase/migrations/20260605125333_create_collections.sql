/*
# Create collections (cookbooks) schema

1. New Tables
- `collections`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users)
  - `title` (text, not null) - collection name e.g. "Weeknight Dinners"
  - `description` (text) - optional description
  - `cover_image_url` (text) - optional cover image
  - `is_public` (boolean, default false) - whether collection is publicly viewable
  - `share_token` (text, unique) - URL token for public access
  - `position` (integer, default 0) - ordering in sidebar
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

- `collection_recipes`
  - `id` (uuid, primary key)
  - `collection_id` (uuid, references collections)
  - `recipe_id` (uuid, references recipes)
  - `position` (integer, default 0) - ordering within collection
  - `added_at` (timestamptz)

2. Security
- Enable RLS on both tables.
- Owner-scoped CRUD for collections.
- Collection_recipes: scoped through parent collection ownership.
- Public SELECT on collections when is_public = true (for shared links).

3. Indexes
- collections(user_id) for fast user lookups
- collection_recipes(collection_id) for fast recipe listing
- collections(share_token) for public lookups

4. Notes
- share_token generated via gen_random_uuid() cast to text (first 12 chars hex)
*/

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_image_url text NOT NULL DEFAULT '',
  is_public boolean NOT NULL DEFAULT false,
  share_token text UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_share_token ON collections(share_token);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_collections" ON collections;
CREATE POLICY "select_own_collections" ON collections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_public_collections" ON collections;
CREATE POLICY "select_public_collections" ON collections FOR SELECT
  TO anon, authenticated USING (is_public = true);

DROP POLICY IF EXISTS "insert_own_collections" ON collections;
CREATE POLICY "insert_own_collections" ON collections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_collections" ON collections;
CREATE POLICY "update_own_collections" ON collections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_collections" ON collections;
CREATE POLICY "delete_own_collections" ON collections FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS collection_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz DEFAULT now(),
  UNIQUE(collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_recipes_collection ON collection_recipes(collection_id);

ALTER TABLE collection_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_collection_recipes" ON collection_recipes;
CREATE POLICY "select_own_collection_recipes" ON collection_recipes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_recipes.collection_id AND collections.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "select_public_collection_recipes" ON collection_recipes;
CREATE POLICY "select_public_collection_recipes" ON collection_recipes FOR SELECT
  TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_recipes.collection_id AND collections.is_public = true)
  );

DROP POLICY IF EXISTS "insert_own_collection_recipes" ON collection_recipes;
CREATE POLICY "insert_own_collection_recipes" ON collection_recipes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_recipes.collection_id AND collections.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_collection_recipes" ON collection_recipes;
CREATE POLICY "update_own_collection_recipes" ON collection_recipes FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_recipes.collection_id AND collections.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_recipes.collection_id AND collections.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_collection_recipes" ON collection_recipes;
CREATE POLICY "delete_own_collection_recipes" ON collection_recipes FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_recipes.collection_id AND collections.user_id = auth.uid())
  );
