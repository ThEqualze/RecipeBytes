/*
  # Recipe Core Schema

  Initial schema for the Social Recipe Engine. Establishes the foundational
  tables for organizing and storing user recipes, including the relational
  links between recipes, their ingredient lines, step-by-step instructions,
  folders, and tags.

  ## 1. New Tables

  ### `profiles`
  Extends `auth.users` with app-specific user metadata (display name, avatar,
  preferred unit system).

  ### `folders`
  Hierarchical folders for organizing recipes (Notion-like sidebar tree).
  Self-referencing `parent_id` allows nesting.

  ### `tags`
  Reusable tags scoped to a user. Categorized by tag type for faceted filters
  (cuisine, meal type, dietary, custom).

  ### `recipes`
  Core recipe record. Source metadata captures where the recipe was clipped
  from (manual entry, web blog, or social video platform).

  ### `ingredients`
  Structured ingredient lines per recipe. Quantity is split from unit and name
  to enable scaling and metric/imperial conversion. `raw_text` preserves the
  original parsed string for audit and re-parsing.

  ### `instructions`
  Ordered step-by-step instructions. `timer_seconds` is parsed from the step
  text so the UI can hyperlink durations to in-app timers.

  ### `recipe_tags`
  Many-to-many join between recipes and tags.

  ## 2. Security
    1. RLS enabled on all tables (no exceptions).
    2. Each owner-scoped table restricts SELECT/INSERT/UPDATE/DELETE to
       `auth.uid()`.
    3. Recipe-scoped child tables (ingredients, instructions, recipe_tags)
       check ownership via the parent recipe's `user_id`.
    4. Profiles are readable only by the owner.

  ## 3. Indexes
    1. User-scoped lookups indexed on `user_id`.
    2. Recipe-scoped child tables indexed on `recipe_id`.
    3. Folder tree traversal indexed on `parent_id`.
    4. Trigram index on `recipes.title` enables fuzzy full-text search.

  ## 4. Extensions
    1. `pg_trgm` enabled for trigram-based similarity search on titles.
*/

-- extensions ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- profiles --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  default_unit_system text NOT NULL DEFAULT 'imperial',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- folders ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled',
  icon text NOT NULL DEFAULT 'folder',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders(user_id);
CREATE INDEX IF NOT EXISTS folders_parent_id_idx ON folders(parent_id);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders"
  ON folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own folders"
  ON folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
  ON folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- tags ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  category text NOT NULL DEFAULT 'custom',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS tags_user_id_idx ON tags(user_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tags"
  ON tags FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tags"
  ON tags FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON tags FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON tags FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- recipes ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled Recipe',
  description text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'manual',
  source_url text NOT NULL DEFAULT '',
  source_author text NOT NULL DEFAULT '',
  cover_image_url text NOT NULL DEFAULT '',
  yield_amount numeric NOT NULL DEFAULT 1,
  yield_unit text NOT NULL DEFAULT 'servings',
  prep_time_minutes integer NOT NULL DEFAULT 0,
  cook_time_minutes integer NOT NULL DEFAULT 0,
  total_time_minutes integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  is_favorite boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  last_cooked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes(user_id);
CREATE INDEX IF NOT EXISTS recipes_folder_id_idx ON recipes(folder_id);
CREATE INDEX IF NOT EXISTS recipes_source_type_idx ON recipes(source_type);
CREATE INDEX IF NOT EXISTS recipes_status_idx ON recipes(status);
CREATE INDEX IF NOT EXISTS recipes_title_trgm_idx ON recipes USING gin (title gin_trgm_ops);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recipes"
  ON recipes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recipes"
  ON recipes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipes"
  ON recipes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipes"
  ON recipes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ingredients -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  group_name text NOT NULL DEFAULT '',
  quantity numeric,
  unit text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  prep_note text NOT NULL DEFAULT '',
  raw_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingredients_recipe_id_idx ON ingredients(recipe_id);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ingredients of own recipes"
  ON ingredients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ingredients into own recipes"
  ON ingredients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ingredients of own recipes"
  ON ingredients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete ingredients of own recipes"
  ON ingredients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = ingredients.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

-- instructions ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  step_number integer NOT NULL DEFAULT 1,
  group_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  timer_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructions_recipe_id_idx ON instructions(recipe_id);

ALTER TABLE instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view instructions of own recipes"
  ON instructions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = instructions.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert instructions into own recipes"
  ON instructions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = instructions.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update instructions of own recipes"
  ON instructions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = instructions.recipe_id
        AND recipes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = instructions.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete instructions of own recipes"
  ON instructions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = instructions.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

-- recipe_tags -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE INDEX IF NOT EXISTS recipe_tags_tag_id_idx ON recipe_tags(tag_id);

ALTER TABLE recipe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recipe_tags of own recipes"
  ON recipe_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_tags.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert recipe_tags for own recipes"
  ON recipe_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_tags.recipe_id
        AND recipes.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM tags
      WHERE tags.id = recipe_tags.tag_id
        AND tags.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete recipe_tags from own recipes"
  ON recipe_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_tags.recipe_id
        AND recipes.user_id = auth.uid()
    )
  );
