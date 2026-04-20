#!/usr/bin/env php
<?php
/**
 * find_tenant.php — AGI Script
 * Daxilolan nömrəyə görə tenant və queue tapır
 * 
 * Usage: AGI(find_tenant.php,${EXTEN})
 * Sets: TENANT_ID, QUEUE_NAME
 */

require_once('phpagi.php');

$agi = new AGI();
$called_number = $argv[1] ?? '';

// Normalize number (add +994 if needed)
if (strlen($called_number) === 10 && $called_number[0] === '0') {
    $called_number = '+994' . substr($called_number, 1);
} elseif (strlen($called_number) === 9) {
    $called_number = '+994' . $called_number;
}

// Query PostgreSQL
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

    $stmt = $pdo->prepare(
        "SELECT pn.tenant_id, q.asterisk_name as queue_name
         FROM phone_numbers pn
         JOIN queues q ON pn.tenant_id = q.tenant_id
         WHERE (pn.number = ? OR pn.number = ?)
           AND pn.status = 'active'
           AND q.is_active = TRUE
         LIMIT 1"
    );
    $stmt->execute([$called_number, $argv[1]]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        $agi->set_variable('TENANT_ID', $row['tenant_id']);
        $agi->set_variable('QUEUE_NAME', $row['queue_name']);
        $agi->verbose("Tenant found: {$row['tenant_id']}, Queue: {$row['queue_name']}");
    } else {
        $agi->set_variable('TENANT_ID', '');
        $agi->set_variable('QUEUE_NAME', '');
        $agi->verbose("No tenant found for number: $called_number");
    }
} catch (Exception $e) {
    $agi->set_variable('TENANT_ID', '');
    $agi->set_variable('QUEUE_NAME', '');
    $agi->verbose("DB error: " . $e->getMessage());
}
