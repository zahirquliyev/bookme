#!/usr/bin/env php
<?php
/**
 * log_call.php — AGI Script
 * Zəng nəticəsini DB-yə yazır
 *
 * Usage: AGI(log_call.php,${STATUS},${CALL_TYPE})
 */

require_once('phpagi.php');

$agi = new AGI();
$status    = $argv[1] ?? 'unknown';
$call_type = $argv[2] ?? 'gsm';

// Get channel variables
$uniqueid  = $agi->get_variable('UNIQUEID')['data'] ?? '';
$tenant_id = $agi->get_variable('TENANT_ID')['data'] ?? '';
$duration  = $agi->get_variable('CDR(duration)')['data'] ?? 0;

if (!$uniqueid || !$tenant_id) exit;

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

    // Update existing call record (created on QueueCallerJoin) or insert new
    $stmt = $pdo->prepare(
        "UPDATE calls SET
           status = ?,
           call_type = ?,
           duration_seconds = ?,
           ended_at = NOW()
         WHERE asterisk_uniqueid = ? AND tenant_id = ?"
    );
    $stmt->execute([$status, $call_type, (int)$duration, $uniqueid, $tenant_id]);

    $agi->verbose("Call logged: $uniqueid → $status ($call_type, {$duration}s)");
} catch (Exception $e) {
    $agi->verbose("log_call DB error: " . $e->getMessage());
}
