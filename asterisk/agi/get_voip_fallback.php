#!/usr/bin/env php
<?php
/**
 * get_voip_fallback.php — AGI Script
 * Tenant üçün VoIP fallback nömrəsi tapır
 *
 * Usage: AGI(get_voip_fallback.php,${TENANT_ID})
 * Sets: FALLBACK_NUM (SIP peer name or empty)
 */

require_once('phpagi.php');

$agi = new AGI();
$tenant_id = $argv[1] ?? '';

if (!$tenant_id) {
    $agi->set_variable('FALLBACK_NUM', '');
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

    $stmt = $pdo->prepare(
        "SELECT number, provider, voip_did
         FROM phone_numbers
         WHERE tenant_id = ?
           AND type = 'voip'
           AND is_fallback = TRUE
           AND status = 'active'
         LIMIT 1"
    );
    $stmt->execute([$tenant_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        // Return the VoIP DID or number for SIP routing
        $fallback = $row['voip_did'] ?: $row['number'];
        $agi->set_variable('FALLBACK_NUM', $fallback);
        $agi->set_variable('FALLBACK_PROVIDER', $row['provider']);
        $agi->verbose("Fallback found: $fallback ({$row['provider']})");
    } else {
        $agi->set_variable('FALLBACK_NUM', '');
        $agi->verbose("No fallback number for tenant: $tenant_id");
    }
} catch (Exception $e) {
    $agi->set_variable('FALLBACK_NUM', '');
    $agi->verbose("DB error in get_voip_fallback: " . $e->getMessage());
}
