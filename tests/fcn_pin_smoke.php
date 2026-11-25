<?php
require __DIR__ . '/../app/Services/FCNCertificate.php';
use App\Services\FCNCertificate;
function checkPin($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$first = FCNCertificate::prepare([], 'www.bing.com');
checkPin($first['fcn_trust_mode'] === 'spki' && $first['cert_mode'] === 'remote', 'wrong managed mode');
checkPin(FCNCertificate::prepare($first, 'www.bing.com') === $first, 'normal poll changed identity');
$renewed = FCNCertificate::prepare($first, 'www.bing.com', true);
checkPin($renewed['tls_cert'] !== $first['tls_cert'], 'certificate renewal did not renew');
checkPin($renewed['tls_key'] === $first['tls_key'] && $renewed['fcn_spki_sha256'] === $first['fcn_spki_sha256'], 'renewal changed pinned key');
$other = FCNCertificate::prepare([], 'www.bing.com');
checkPin($other['fcn_spki_sha256'] !== $first['fcn_spki_sha256'], 'distinct keys share a pin');
$public = FCNCertificate::publicSettings($first + ['dns_env'=>'private-dns-secret'], 'fallback.example');
checkPin(!isset($public['tls_key']) && !isset($public['tls_cert']) && !isset($public['dns_env']), 'private material leaked');
$forged = $first; $forged['fcn_spki_sha256'] = 'untrusted-client-input';
checkPin(FCNCertificate::prepare($forged, 'www.bing.com')['fcn_spki_sha256'] === $first['fcn_spki_sha256'], 'client pin accepted');
foreach ([['tls_key'=>'invalid-key'], ['fcn_spki_sha256'=>$first['fcn_spki_sha256']], ['tls_key'=>$other['tls_key'],'tls_cert'=>$first['tls_cert']]] as $bad) {
    try { FCNCertificate::prepare($bad, 'www.bing.com'); throw new RuntimeException('invalid identity accepted'); }
    catch (InvalidArgumentException $expected) {}
}
try { FCNCertificate::prepare([], "www.bing.com\nmalicious=entry"); throw new RuntimeException('config injection accepted'); }
catch (InvalidArgumentException $expected) {}
if (isset($argv[1])) {
    $fp = fopen($argv[1], 'x');
    if (!$fp) throw new RuntimeException('fixture already exists');
    chmod($argv[1], 0600);
    fwrite($fp, json_encode($first)); fclose($fp);
}
echo "FCN SPKI generation, renewal, secret filtering and invalid identity rejection passed\n";

$edited = FCNCertificate::forSave(['fcn_trust_mode'=>'spki'], $first, 'www.bing.com');
checkPin($edited['fcn_spki_sha256'] === $first['fcn_spki_sha256'], 'ordinary editing changed the key');
$rotated = FCNCertificate::forSave($first, $first, 'www.bing.com', true);
checkPin($rotated['fcn_spki_sha256'] !== $first['fcn_spki_sha256'], 'explicit rotation retained the old key');
echo "FCN ordinary edit key retention and explicit rotation passed\n";

$http = FCNCertificate::caSettingsForSave([
    'cert_mode' => 'http', 'dns_env' => 'DNS_TOKEN=secret', 'tls_key' => 'previous-key',
], 'node.example');
checkPin($http === ['cert_mode' => 'http'], 'HTTP retained credentials belonging to another mode');
checkPin(FCNCertificate::automaticDomain($http, 'node.example') === 'node.example', 'HTTP did not use the node hostname');
$dns = FCNCertificate::caSettingsForSave([
    'cert_mode' => 'dns', 'server_name' => 'cert.example', 'provider' => 'cloudflare',
    'dns_env' => 'DNS_TOKEN=token=part, ZONE_ID=zone', 'cert_file' => '/cert.pem', 'key_file' => '/key.pem',
    'fcn_spki_sha256' => 'stale-pin',
], '192.0.2.1');
checkPin($dns['dns_env'] === 'DNS_TOKEN=token=part,ZONE_ID=zone'
    && $dns['cert_file'] === '/cert.pem' && $dns['key_file'] === '/key.pem'
    && !isset($dns['fcn_spki_sha256']), 'DNS lost current settings or retained an inactive pin');
checkPin(FCNCertificate::automaticDomain($dns, '192.0.2.1') === 'cert.example', 'explicit SNI did not select DNS identity');
checkPin(FCNCertificate::caSettingsForSave(['cert_mode' => 'dns', 'provider' => 'cloudflare'], 'node.example')
    === ['cert_mode' => 'dns', 'provider' => 'cloudflare'], 'DNS credentials provided at the node must remain supported');
checkPin(FCNCertificate::caSettingsForSave(['cert_mode' => 'file', 'key_file' => '/key.pem', 'dns_env' => 'secret'], '192.0.2.1')
    === ['cert_mode' => 'file', 'key_file' => '/key.pem'], 'existing file with IP identity was altered');
checkPin(FCNCertificate::caSettingsForSave(['cert_mode' => 'remote', 'tls_cert' => 'cert', 'tls_key' => 'key', 'dns_env' => 'secret'], 'node.example')
    === ['cert_mode' => 'remote', 'tls_cert' => 'cert', 'tls_key' => 'key'], 'remote PEM fields changed');
foreach (['192.0.2.1', '2001:db8::1', 'unqualified', 'invalid..example'] as $host) {
    try { FCNCertificate::caSettingsForSave(['cert_mode' => 'http'], $host); throw new RuntimeException('invalid automatic domain accepted'); }
    catch (InvalidArgumentException $expected) {}
}
try { FCNCertificate::caSettingsForSave(['cert_mode' => 'dns', 'dns_env' => 'malformed'], 'node.example'); throw new RuntimeException('invalid DNS environment accepted'); }
catch (InvalidArgumentException $expected) {}
echo "FCN automatic certificate settings, fallbacks and secret scoping passed\n";
