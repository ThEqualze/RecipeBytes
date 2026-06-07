# Deploying RecipeBytes to 20i

The app is **static frontend + PHP API + MySQL**, all on 20i. Frontend and API are
same-origin, so no CORS config is needed.

## One-time setup
1. **Create a MySQL database** in the 20i control panel (Manage MySQL Databases).
   Note the DB name, username, password, and host (often `localhost` on 20i).
2. **Import the schema:** open phpMyAdmin for that database and import `api/schema.sql`.
   Confirm 16 tables are created.
3. **Production config:** create `api/config.php` on the server (do NOT commit it) with
   the real DB credentials and production cookie setting:
   ```php
   <?php
   return [
       'db_host' => 'localhost',          // per 20i panel
       'db_name' => 'YOUR_DB_NAME',
       'db_user' => 'YOUR_DB_USER',
       'db_pass' => 'YOUR_DB_PASSWORD',
       'db_charset' => 'utf8mb4',
       'session_ttl' => 60 * 60 * 24,     // 24h
       'cookie_secure' => true,           // HTTPS on 20i -> Secure cookie
   ];
   ```
   (Optionally place this file above the web root and `require` it from `api/config.php`.)

## Each deploy
1. Local: `npm run build` -> produces `dist/`.
2. Upload the **contents of `dist/`** (index.html + assets/) into `public_html/`.
3. Upload the **`api/` folder** to `public_html/api/` (include `api/.htaccess`; do NOT
   upload `api/config.php` from your machine — the server has its own).
4. Upload the root **`.htaccess`** to `public_html/.htaccess` (SPA fallback).
5. Ensure the server PHP version is 8.x (20i panel) and `pdo_mysql` is enabled (default).

## Smoke test (live)
- Visit `https://yourdomain/api/health` -> `{"data":{"status":"ok"}}`.
- Visit the site root -> sign up -> create a recipe -> generate a share link -> open
  `/r/{token}` while logged out (recipe + ingredients show; instructions hidden).

## Notes
- `api/config.php`, `.env*`, and `node_modules/` are gitignored and never deployed from git.
- Set `display_errors = Off` in production PHP (20i default) so errors never leak to clients.
