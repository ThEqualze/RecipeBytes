-- Add the "I cooked this" photo column to recipes.
-- Safe to run once per environment (phpMyAdmin -> SQL, or mysql CLI).
SET NAMES utf8mb4;
ALTER TABLE recipes
  ADD COLUMN cook_image_url VARCHAR(2048) NOT NULL DEFAULT '' AFTER cover_image_url;
