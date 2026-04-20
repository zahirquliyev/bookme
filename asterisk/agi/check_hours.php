#!/usr/bin/env php
<?php
/**
 * check_hours.php — AGI Script
 * Tenant üçün iş saatlarını yoxlayır
 *
 * Usage: AGI(check_hours.php,${TENANT_ID})
 * Sets: IN_HOURS (1 = açıq, 0 = bağlı)
 */

require_once('phpagi.php');

$agi = new AGI();
$tenant_id = $argv[1] ?? '';

if (!$tenant_id) {
    $agi->set_variable('IN_HOURS', '0');
    exit;
}

$dsn = sprintf(
    "pgsql:host=%s;port=%s;dbname=%s",
    getenv('DB_HOST') ?: 'postgres',
    getenv('DB_PORT') ?: '5432',
    getenv('DB_NAME') ?: 'callcenter'
);

try {
    $pdo = new PDO($dsn,
        getenv('DB_USER') ?: 'ccadmin',
        getenv('DB_PASSWORD') ?: ''
    );

    // Baku timezone
    $baku = new DateTimeZone('Asia/Baku');
    $now = new DateTime('now', $baku);
    $dayOfWeek = (int)$now->format('w'); // 0=Sunday
    $currentTime = $now->format('H:i');

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) as cnt
         FROM working_hours
         WHERE tenant_id = ?
           AND day_of_week = ?
           AND is_active = TRUE
           AND open_time <= ?::time
           AND close_time >= ?::time"
    );
    $stmt->execute([$tenant_id, $dayOfWeek, $currentTime, $currentTime]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    $inHours = ($row && (int)$row['cnt'] > 0) ? '1' : '0';
    $agi->set_variable('IN_HOURS', $inHours);
    $agi->verbose("Working hours check for $tenant_id: IN_HOURS=$inHours ($currentTime, day=$dayOfWeek)");

} catch (Exception $e) {
    // On DB error, allow calls through (fail open)
    $agi->set_variable('IN_HOURS', '1');
    $agi->verbose("DB error in check_hours: " . $e->getMessage());
}
