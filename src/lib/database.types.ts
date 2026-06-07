export type SourceType =
  | 'manual'
  | 'web'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'other';

export type RecipeStatus = 'active' | 'archived';

export type TagCategory = 'cuisine' | 'meal_type' | 'dietary' | 'custom';

export type UnitSystem = 'metric' | 'imperial';

export type ExtractionStatus =
  | 'pending'
  | 'fetching'
  | 'transcribing'
  | 'analyzing'
  | 'ready_for_review'
  | 'completed'
  | 'failed';

export type Aisle =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'pantry'
  | 'frozen'
  | 'bakery'
  | 'spices'
  | 'beverages'
  | 'other';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string;
  default_unit_system: UnitSystem;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  category: TagCategory;
  created_at: string;
}

export interface Recipe {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  description: string;
  source_type: SourceType;
  source_url: string;
  source_author: string;
  cover_image_url: string;
  yield_amount: number;
  yield_unit: string;
  prep_time_minutes: number;
  cook_time_minutes: number;
  total_time_minutes: number;
  notes: string;
  is_favorite: boolean;
  status: RecipeStatus;
  last_cooked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  recipe_id: string;
  position: number;
  group_name: string;
  quantity: number | null;
  unit: string;
  name: string;
  prep_note: string;
  raw_text: string;
  created_at: string;
}

export interface Instruction {
  id: string;
  recipe_id: string;
  position: number;
  step_number: number;
  group_name: string;
  content: string;
  timer_seconds: number | null;
  created_at: string;
}

export interface RecipeTag {
  recipe_id: string;
  tag_id: string;
  created_at: string;
}

export interface ExtractionJob {
  id: string;
  user_id: string;
  source_url: string;
  source_type: SourceType;
  status: ExtractionStatus;
  raw_transcript: string;
  raw_ocr_text: string;
  extracted_data: Record<string, unknown>;
  thumbnail_url: string;
  recipe_id: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface GroceryList {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroceryListItem {
  id: string;
  grocery_list_id: string;
  recipe_id: string | null;
  ingredient_id: string | null;
  name: string;
  quantity: number | null;
  unit: string;
  aisle: Aisle;
  updated_at: string;
}

export interface SharedRecipe {
  id: string;
  recipe_id: string;
  user_id: string;
  token: string;
  message: string;
  created_at: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlan {
  id: string;
  user_id: string;
  recipe_id: string;
  planned_date: string;
  meal_type: MealType;
  position: number;
  created_at: string;
}

export interface Collection {
  id: string;
  user_id: string;
  title: string;
  description: string;
  cover_image_url: string;
  is_public: boolean;
  share_token: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionRecipe {
  id: string;
  collection_id: string;
  recipe_id: string;
  position: number;
  added_at: string;
}
