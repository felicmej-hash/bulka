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
        $colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];
        $color = $colors[array_rand($colors)];
        $spawn = is_array($body['spawn'] ?? null) ? $body['spawn'] : ['x' => 1, 'y' => 1];
        $name = trim(substr((string)($body['name'] ?? ''), 0, 16));
        if ($name === '') {
            $name = 'Танк-' . substr($id, 0, 4);
        }
        $state['players'][$id] = [
            'id' => $id,
            'name' => $name,
            'x' => (int)($spawn['x'] ?? 1),
            'y' => (int)($spawn['y'] ?? 1),
            'dir' => 'down',
            'hp' => 3,
            'color' => $color,
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
            if (isset($body['x'])) $p['x'] = (int)$body['x'];
            if (isset($body['y'])) $p['y'] = (int)$body['y'];
            if (isset($body['dir'])) $p['dir'] = (string)$body['dir'];
            $p['t'] = $now;

            $hitId = (string)($body['hitId'] ?? '');
            if ($hitId !== '' && isset($state['players'][$hitId]) && $hitId !== $id) {
                $state['players'][$hitId]['hp'] = (int)$state['players'][$hitId]['hp'] - 1;
                if ($state['players'][$hitId]['hp'] <= 0) {
                    $p['kills'] = (int)($p['kills'] ?? 0) + 1;
                }
            }

            if (!empty($body['respawn'])) {
                $sp = is_array($body['spawn'] ?? null) ? $body['spawn'] : ['x' => 1, 'y' => 1];
                $p['hp'] = 3;
                $p['x'] = (int)($sp['x'] ?? 1);
                $p['y'] = (int)($sp['y'] ?? 1);
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
