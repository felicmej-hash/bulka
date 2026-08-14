<?php
// Личный файловый деплой-эндпоинт (шаблон).
// Перед использованием замени $TOKEN на свой длинный случайный секрет
// (например, сгенерированный командой: openssl rand -hex 32)
// и НЕ публикуй файл с реальным токеном нигде, включая git.

declare(strict_types=1);

$TOKEN = 'REPLACE_WITH_YOUR_OWN_LONG_RANDOM_SECRET';
$BASE_DIR = __DIR__;
$MAX_SIZE = 5 * 1024 * 1024; // 5 MB на файл

header('Content-Type: application/json; charset=utf-8');

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function safe_path(string $baseDir, string $relPath): ?string {
    $relPath = ltrim(str_replace('\\', '/', $relPath), '/');
    if ($relPath === '' || strpos($relPath, "\0") !== false) {
        return null;
    }
    foreach (explode('/', $relPath) as $part) {
        if ($part === '' || $part === '.' || $part === '..') {
            return null;
        }
    }
    return $baseDir . '/' . $relPath;
}

$providedToken = $_SERVER['HTTP_X_DEPLOY_TOKEN'] ?? ($_POST['token'] ?? '');
if (!hash_equals($TOKEN, (string)$providedToken)) {
    respond(['error' => 'unauthorized'], 401);
}

$raw = file_get_contents('php://input');
$body = [];
if ($raw !== false && $raw !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}
$action = $body['action'] ?? ($_POST['action'] ?? ($_GET['action'] ?? ''));

switch ($action) {
    case 'ping':
        respond(['ok' => true, 'time' => date('c')]);
        break;

    case 'list': {
        $rel = $body['path'] ?? ($_GET['path'] ?? '');
        $dir = $rel === '' ? $BASE_DIR : safe_path($BASE_DIR, (string)$rel);
        if ($dir === null || !is_dir($dir)) {
            respond(['error' => 'not_found'], 404);
        }
        $items = [];
        foreach (scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $full = $dir . '/' . $entry;
            $items[] = [
                'name' => $entry,
                'type' => is_dir($full) ? 'dir' : 'file',
                'size' => is_file($full) ? filesize($full) : null,
                'modified' => date('c', filemtime($full)),
            ];
        }
        respond(['ok' => true, 'items' => $items]);
        break;
    }

    case 'read': {
        $rel = $body['path'] ?? ($_GET['path'] ?? '');
        $path = safe_path($BASE_DIR, (string)$rel);
        if ($path === null || !is_file($path)) {
            respond(['error' => 'not_found'], 404);
        }
        respond(['ok' => true, 'content' => file_get_contents($path)]);
        break;
    }

    case 'write': {
        $rel = $body['path'] ?? '';
        $content = $body['content'] ?? '';
        $path = safe_path($BASE_DIR, (string)$rel);
        if ($path === null) {
            respond(['error' => 'invalid_path'], 400);
        }
        if (strlen($content) > $MAX_SIZE) {
            respond(['error' => 'too_large'], 413);
        }
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
            respond(['error' => 'mkdir_failed'], 500);
        }
        if (file_put_contents($path, $content) === false) {
            respond(['error' => 'write_failed'], 500);
        }
        respond(['ok' => true, 'path' => $rel, 'size' => strlen($content)]);
        break;
    }

    case 'delete': {
        $rel = $body['path'] ?? '';
        $path = safe_path($BASE_DIR, (string)$rel);
        if ($path === null || !file_exists($path)) {
            respond(['error' => 'not_found'], 404);
        }
        if (is_dir($path)) {
            respond(['error' => 'is_a_directory'], 400);
        }
        if (!unlink($path)) {
            respond(['error' => 'delete_failed'], 500);
        }
        respond(['ok' => true]);
        break;
    }

    case 'mkdir': {
        $rel = $body['path'] ?? '';
        $path = safe_path($BASE_DIR, (string)$rel);
        if ($path === null) {
            respond(['error' => 'invalid_path'], 400);
        }
        if (!is_dir($path) && !mkdir($path, 0755, true)) {
            respond(['error' => 'mkdir_failed'], 500);
        }
        respond(['ok' => true]);
        break;
    }

    default:
        respond(['error' => 'unknown_action'], 400);
}
