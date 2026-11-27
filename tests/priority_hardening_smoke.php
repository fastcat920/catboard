<?php

require __DIR__ . '/../app/Services/AuthService.php';
require __DIR__ . '/../app/Services/NodeSecurity/PublicNodeSettings.php';

use App\Services\AuthService;
use App\Services\NodeSecurity\PublicNodeSettings;

function check($condition, string $description): void
{
    if (!$condition) throw new RuntimeException($description);
}

foreach ([null, '', 123, false, new stdClass()] as $invalid) {
    check(AuthService::decryptAuthData($invalid) === false, 'invalid token must be rejected before reaching cache');
}

$node = [
    'name' => 'Fixture node', 'host' => 'example.invalid', 'port' => 443,
    'trusted_x_forwarded_for' => ['internal'],
    'unexpected_secret_field' => 'internal',
    '_fastcat_managed_parent' => 10,
    'tls_settings' => [
        'server_name' => 'example.invalid', 'privateKey' => 'fixture',
        'tls_key' => 'fixture', 'tls_cert' => 'fixture', 'dns_env' => 'fixture',
        'fcn_spki_sha256' => 'public-fingerprint',
    ],
];
$export = PublicNodeSettings::strip($node);
check($export['_fastcat_managed_parent'] === 10, 'subscription builder needs routing metadata');
check(!isset($export['trusted_x_forwarded_for']), 'legacy subscription export hides internal XFF');
$list = PublicNodeSettings::forNodeList($node);
check($list === [
    'name' => 'Fixture node', 'host' => 'example.invalid', 'port' => 443,
    'tls_settings' => ['server_name' => 'example.invalid', 'fcn_spki_sha256' => 'public-fingerprint'],
], 'user node list exposes only public connection information');
echo "Authentication input and node export regression checks passed\n";
