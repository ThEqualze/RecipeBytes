<?php
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/uuid.php';
require __DIR__ . '/db.php';

// Path after the /api prefix, e.g. "/auth/login"
$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^.*?/api#', '', $uri);
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];

// Expose to route files
$GLOBALS['ROUTE_PATH'] = $path;
$GLOBALS['ROUTE_METHOD'] = $method;

try {
    if ($path === '/health') {
        json_ok(['status' => 'ok']);
    }

    if (str_starts_with($path, '/auth')) {
        require __DIR__ . '/routes/auth.php';
        json_error('Not found', 404);
    }

    if (str_starts_with($path, '/recipes')) {
        require __DIR__ . '/auth.php';
        require __DIR__ . '/lib/ownership.php';
        $user = require_auth();

        if ($path === '/recipes' && $method === 'GET') {
            $stmt = db()->prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC');
            $stmt->execute([$user['id']]);
            json_ok($stmt->fetchAll());
        }
        if ($path === '/recipes' && $method === 'POST') {
            $body = read_json_body();
            $id = uuid4();
            $now = gmdate('Y-m-d H:i:s');
            $stmt = db()->prepare(
                'INSERT INTO recipes (id, user_id, title, description, notes, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?)'
            );
            $stmt->execute([$id, $user['id'], $body['title'] ?? 'Untitled Recipe', '', '', $now, $now]);
            json_ok(['id' => $id]);
        }
        if (preg_match('#^/recipes/([a-f0-9-]{36})$#', $path, $m) && $method === 'GET') {
            require_owner('recipes', $m[1], $user['id']);
            $stmt = db()->prepare('SELECT * FROM recipes WHERE id = ?');
            $stmt->execute([$m[1]]);
            json_ok($stmt->fetch());
        }
        json_error('Not found', 404);
    }

    json_error('Not found', 404);
} catch (Throwable $e) {
    error_log('API error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_error('Server error', 500);
}
