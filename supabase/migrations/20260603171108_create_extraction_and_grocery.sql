/*
  # Extraction Queue and Grocery Planning

  Adds the workflow tables for the AI video extraction pipeline (the
  "Inbox / Needs Review" queue) and the grocery planning module
  (lists + consolidated items with aisle sorting).

  ## 1. New Tables

  ### `extraction_jobs`
  Inbox queue for AI-extracted recipes pending user review. The Node.js
  worker writes its progress (transcript, OCR, LLM JSON) to this row, and
  the row transitions through a status lifecycle. Once the user accepts
  the extraction, a row is created in `recipes` and `recipe_id` is set.
    - `id` (uuid, pk)
    - `user_id` (uuid, fk -> auth.users.id)
    - `source_url` (text)
    - `source_type` (text, 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'web' | 'other')
    - `status` (text, 'pending' | 'fetching' | 'transcribing' | 'analyzing' | 'ready_for_review' | 'completed' | 'failed')
    - `raw_transcript` (text)
    - `raw_ocr_text` (text)
    - `extracted_data` (jsonb, the LLM-structured recipe pre-review)
    - `thumbnail_url` (text)
    - `recipe_id` (uuid, fk -> recipes.id, set after commit)
    - `error_message` (text)
    - `created_at` / `updated_at` (timestamptz)

  ### `grocery_lists`
  Named shopping lists owned by the user. `is_active` marks the user's
  current list (typically only one is active at a time).
    - `id` (uuid, pk)
    - `user_id` (uuid, fk -> auth.users.id)
    - `name` (text)
    - `is_active` (boolean)
    - `created_at` / `updated_at` (timestamptz)

  ### `grocery_list_items`
  Individual items on a list. Items consolidated from recipe ingredients
  carry source pointers (`recipe_id`, `ingredient_id`) so the UI can
  surface "this came from Recipe X". `aisle` powers store-layout grouping.
    - `id` (uuid, pk)
    - `grocery_list_id` (uuid, fk -> grocery_lists.id)
    - `recipe_id` (uuid, fk -> recipes.id, nullable)
    - `ingredient_id` (uuid, fk -> ingredients.id, nullable)
    - `name` (text)
    - `quantity` (numeric)
    - `unit` (text)
    - `aisle` (text, 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'spices' | 'beverages' | 'other')
    - `is_checked` (boolean)
    - `position` (integer)
    - `created_at` / `updated_at` (timestamptz)

  ## 2. Security
    1. RLS enabled on all three tables.
    2. `extraction_jobs` and `grocery_lists` restrict access to the owner
       via `auth.uid() = user_id`.
    3. `grocery_list_items` checks ownership through the parent
       `grocery_lists` row.

  ## 3. Indexes
    1. `extraction_jobs` indexed on `user_id` and `status` for queue
       polling and inbox queries.
    2. `grocery_list_items` indexed on `grocery_list_id` and `aisle`.
*/

-- extraction_jobs -------------------------------------------------------
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  source_type text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'pending',
  raw_transcript text NOT NULL DEFAULT '',
  raw_ocr_text text NOT NULL DEFAULT '',
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url text NOT NULL DEFAULT '',
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extraction_jobs_user_id_idx ON extraction_jobs(user_id);
CREATE INDEX IF NOT EXISTS extraction_jobs_status_idx ON extraction_jobs(status);

ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own extraction jobs"
  ON extraction_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own extraction jobs"
  ON extraction_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own extraction jobs"
  ON extraction_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own extraction jobs"
  ON extraction_jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- grocery_lists ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS grocery_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Shopping List',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_lists_user_id_idx ON grocery_lists(user_id);

ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grocery lists"
  ON grocery_lists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own grocery lists"
  ON grocery_lists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own grocery lists"
  ON grocery_lists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own grocery lists"
  ON grocery_lists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- grocery_list_items ----------------------------------------------------
CREATE TABLE IF NOT EXISTS grocery_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id uuid NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  ingredient_id uuid REFERENCES ingredients(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  quantity numeric,
  unit text NOT NULL DEFAULT '',
  aisle text NOT NULL DEFAULT 'other',
  is_checked boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_list_items_list_id_idx ON grocery_list_items(grocery_list_id);
CREATE INDEX IF NOT EXISTS grocery_list_items_aisle_idx ON grocery_list_items(aisle);

ALTER TABLE grocery_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items of own grocery lists"
  ON grocery_list_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grocery_lists
      WHERE grocery_lists.id = grocery_list_items.grocery_list_id
        AND grocery_lists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert items into own grocery lists"
  ON grocery_list_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grocery_lists
      WHERE grocery_lists.id = grocery_list_items.grocery_list_id
        AND grocery_lists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items of own grocery lists"
  ON grocery_list_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grocery_lists
      WHERE grocery_lists.id = grocery_list_items.grocery_list_id
        AND grocery_lists.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grocery_lists
      WHERE grocery_lists.id = grocery_list_items.grocery_list_id
        AND grocery_lists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items of own grocery lists"
  ON grocery_list_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM grocery_lists
      WHERE grocery_lists.id = grocery_list_items.grocery_list_id
        AND grocery_lists.user_id = auth.uid()
    )
  );
