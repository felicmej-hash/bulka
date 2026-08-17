<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$stateFile = __DIR__ . '/state.json';
$lockFile = __DIR__ . '/state.lock';

function load_state(string $file): array {
    if (!file_exists($file)) {
        return ['players' => []];
    }
    $raw = file_get_contents($file);
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : ['players' => []];
}

function save_state(string $file, array $data): void {
    file_put_contents($file, json_encode($data));
}

$fp = fopen($lockFile, 'c');
if ($fp === false) {
    http_response_code(500);
    echo json_encode(['error' => 'lock_failed']);
    exit;
}
flock($fp, LOCK_EX);

$state = load_state($stateFile);
if (!isset($state['players']) || !is_array($state['players'])) {
    $state['players'] = [];
}

$now = microtime(true);
foreach ($state['players'] as $pid => $p) {
    if (!isset($p['t']) || $now - $p['t'] > 10) {
        unset($state['players'][$pid]);
    }
}

$raw = file_get_contents('php://input');
$body = json_decode((string)$raw, true);
if (!is_array($body)) {
    $body = [];
}
$action = $_GET['action'] ?? ($body['action'] ?? '');

switch ($action) {
    case 'join': {
        $id = bin2hex(random_bytes(6));
        $name = trim(substr((string)($body['name'] ?? ''), 0, 16));
        if ($name === '') {
            $name = 'Игрок-' . substr($id, 0, 4);
        }
        $state['players'][$id] = [
            'id' => $id,
            'name' => $name,
            'x' => (float)($body['x'] ?? 1300),
            'y' => (float)($body['y'] ?? 1300),
            'angle' => 0,
            'length' => 60,
            'kills' => 0,
            't' => $now,
        ];
        save_state($stateFile, $state);
        echo json_encode(['ok' => true, 'id' => $id, 'players' => $state['players']]);
        break;
    }

    case 'update': {
        $id = (string)($body['id'] ?? '');
        if (isset($state['players'][$id])) {
            $p = $state['players'][$id];
            if (isset($body['x'])) $p['x'] = (float)$body['x'];
            if (isset($body['y'])) $p['y'] = (float)$body['y'];
            if (isset($body['angle'])) $p['angle'] = (float)$body['angle'];
            if (isset($body['length'])) $p['length'] = (float)$body['length'];
            $p['t'] = $now;

            $killedBy = (string)($body['killedBy'] ?? '');
            if ($killedBy !== '' && isset($state['players'][$killedBy]) && $killedBy !== $id) {
                $state['players'][$killedBy]['kills'] = (int)($state['players'][$killedBy]['kills'] ?? 0) + 1;
            }

            if (!empty($body['died'])) {
                $p['length'] = 60;
                if (isset($body['spawnX'])) $p['x'] = (float)$body['spawnX'];
                if (isset($body['spawnY'])) $p['y'] = (float)$body['spawnY'];
            }

            $state['players'][$id] = $p;
        }
        save_state($stateFile, $state);
        echo json_encode(['ok' => true, 'players' => $state['players']]);
        break;
    }

    case 'poll': {
        save_state($stateFile, $state);
        echo json_encode(['ok' => true, 'players' => $state['players']]);
        break;
    }

    case 'leave': {
        $id = (string)($body['id'] ?? '');
        unset($state['players'][$id]);
        save_state($stateFile, $state);
        echo json_encode(['ok' => true]);
        break;
    }

    default:
        http_response_code(400);
        echo json_encode(['error' => 'unknown_action']);
}

flock($fp, LOCK_UN);
fclose($fp);
