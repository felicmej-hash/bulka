<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function field(string $name, int $maxBytes): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || strlen($value) > $maxBytes || !preg_match('//u', $value)) {
        respond(422, ['message' => 'Проверьте заполненные поля.']);
    }
    return trim($value);
}

function csvText(string $value): string
{
    return preg_match('/^[\s\p{Cf}]*[=+@-]/u', $value) ? "'" . $value : $value;
}

function storageDirectory(): string
{
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($root === false || $root !== realpath(__DIR__)) {
        throw new RuntimeException('Unrecognized document root');
    }
    $dir = dirname($root) . DIRECTORY_SEPARATOR . 'bulochka-private';
    umask(0077);
    if (is_link($dir) || (!is_dir($dir) && !@mkdir($dir, 0700) && !is_dir($dir))) {
        throw new RuntimeException('Cannot create private storage');
    }
    if (realpath($dir) !== $dir || !is_writable($dir)) {
        throw new RuntimeException('Private storage unavailable');
    }
    if (DIRECTORY_SEPARATOR === '/' && !@chmod($dir, 0700)) {
        throw new RuntimeException('Cannot set directory permissions');
    }
    return $dir;
}

function recordRequest(string $directory, string $id, array $values): void
{
    $path = $directory . DIRECTORY_SEPARATOR . 'requests.csv';
    if (is_link($path) || (($file = @fopen($path, 'c+b')) === false)) {
        throw new RuntimeException('Cannot open request register');
    }
    try {
        if ((DIRECTORY_SEPARATOR === '/' && !@chmod($path, 0600)) || !flock($file, LOCK_EX)) {
            throw new RuntimeException('Cannot protect request register');
        }
        $size = fstat($file)['size'];
        if ($size > 0) {
            if (fseek($file, 3) !== 0) {
                throw new RuntimeException('Cannot read register');
            }
            while (($row = fgetcsv($file, 0, ';', '"', '')) !== false) {
                if (($row[0] ?? '') === $id) {
                    return;
                }
            }
        }
        if (fseek($file, 0, SEEK_END) !== 0) {
            throw new RuntimeException('Cannot seek to end of register');
        }
        if ($size === 0 && (
            fwrite($file, "\xEF\xBB\xBF") !== 3
            || fputcsv($file, ['ID заявки', 'Дата (МСК)', 'Игрушка', 'Количество', 'Имя', 'Способ связи', 'Контакт', 'Комментарий', 'Версия согласия'], ';', '"', '') === false
        )) {
            ftruncate($file, $size);
            throw new RuntimeException('Cannot write register header');
        }
        if (fputcsv($file, array_merge([$id], $values), ';', '"', '') === false || !fflush($file)) {
            ftruncate($file, $size);
            throw new RuntimeException('Cannot save request');
        }
    } finally {
        fclose($file);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') {
    try {
        storageDirectory();
        respond(200, ['ready' => true]);
    } catch (Throwable $error) {
        error_log('Bulochka inquiry initialization unavailable');
        respond(503, ['ready' => false]);
    }
}
if ($method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['message' => 'Используйте форму заявки на сайте.']);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$local = PHP_SAPI === 'cli-server' && preg_match('/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/D', $origin);
if (!$local && !in_array($origin, ['https://igrushka-bulochka.ru', 'https://www.igrushka-bulochka.ru'], true)) {
    respond(403, ['message' => 'Откройте анкету на сайте по HTTPS и попробуйте снова.']);
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000) {
    respond(413, ['message' => 'Комментарий слишком длинный.']);
}

$toys = ['bulochka' => 'Колобок', 'domovenok' => 'Домовёнок Кузя'];
$toy = field('toy', 30);
$quantity = filter_var(field('quantity', 4), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 99]]);
$name = field('customerName', 320);
$channel = field('contactMethod', 10);
$note = field('note', 1600);
$id = field('requestId', 36);
if (!isset($toys[$toy]) || $quantity === false || $name === '' || preg_match('/[\r\n\t\x00]/', $name)
    || !in_array($channel, ['email', 'phone'], true) || field('consent', 4) !== 'yes'
    || !preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/D', $id)) {
    respond(422, ['message' => 'Проверьте имя, игрушку, контакт и согласие.']);
}
$contact = field($channel, $channel === 'phone' ? 25 : 120);
if ($channel === 'email' && !filter_var($contact, FILTER_VALIDATE_EMAIL)) {
    respond(422, ['message' => 'Проверьте адрес электронной почты.']);
}
if ($channel === 'phone' && (!preg_match('/^[+0-9(). -]+$/D', $contact)
    || !preg_match('/^\d{7,15}$/D', preg_replace('/\D/', '', $contact)))) {
    respond(422, ['message' => 'Проверьте номер телефона.']);
}
if (field('website', 250) !== '') {
    respond(422, ['message' => 'Не удалось отправить заявку.']);
}

try {
    $date = new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow'));
    recordRequest(storageDirectory(), $id, [
        $date->format('Y-m-d H:i:s'), $toys[$toy], $quantity, csvText($name),
        $channel === 'phone' ? 'Телефон' : 'Электронная почта', csvText($contact),
        csvText($note), '2026-11-15',
    ]);
    respond(200, ['ok' => true, 'message' => 'Спасибо! Заявка принята. Ответим по указанному контакту.']);
} catch (Throwable $error) {
    error_log('Bulochka inquiry storage unavailable');
    respond(503, ['message' => 'Заявка пока не сохранена. Попробуйте ещё раз чуть позже.']);
}
