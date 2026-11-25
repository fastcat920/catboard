<?php
// Dependency-free contract test; does not claim to replace Laravel HTTP/DB tests.
function config($key, $default = null) { return $default; }
require __DIR__ . '/../app/Services/FastCatAutoGrants.php';
require __DIR__ . '/../app/Protocols/ClashMeta.php';
require __DIR__ . '/../app/Protocols/FastCatV1.php';
class FCNProbe extends \App\Protocols\FastCatV1 {
    public function proxy(array $server) { return $this->buildCustomProxy($server); }
}
function check($value, $message) { if (!$value) throw new RuntimeException($message); }
$user = ['id'=>42, 'uuid'=>'1ed909de-848b-41e7-943f-0f2d49b35f3a', 'u'=>0, 'd'=>0, 'transfer_enable'=>100000];
$nodes = [];
foreach ([1,2] as $v) $nodes[] = ['id'=>$v,'type'=>'v2node','protocol'=>'fcn-v'.$v,'name'=>'FCN v'.$v,'host'=>'node.example','port'=>443,'tls_settings'=>['server_name'=>'cert.example']];
foreach ([false,true] as $capable) {
    $app = new FCNProbe($user, $nodes, false, null, false, false, $capable);
    $property = new ReflectionProperty(\App\Protocols\ClashMeta::class, 'servers');
    if (PHP_VERSION_ID < 80100) $property->setAccessible(true);
    $visible = $property->getValue($app);
    check(count($visible) === 2, 'FCN visibility must not depend on client capability');
    foreach ($visible as $i=>$node) {
        $proxy = $app->proxy($node);
        check($proxy['type'] === 'fcn' && $proxy['version'] === $i+1, 'wrong profile');
        check($proxy['uuid'] === $user['uuid'] && $proxy['sni'] === 'cert.example', 'wrong account or certificate name');
        check($proxy['udp'] === true && !isset($proxy['token']), 'unexpected device grant');
    }
}
$app = new FCNProbe($user, [], false, null, false, false, true);
$nodes[0]['tls_settings']['server_name']='';
check($app->proxy($nodes[0])['sni']==='node.example','empty SNI must fall back to server hostname');
echo "FCN v1/v2 account subscription without capability filtering passed\n";

$nodes[0]['tls_settings']['fcn_trust_mode'] = 'spki';
$nodes[0]['tls_settings']['fcn_spki_sha256'] = 'sha256/' . base64_encode(str_repeat("\x01", 32));
foreach ([false,true] as $pinCapable) {
    $app = new FCNProbe($user, $nodes, false, null, false, false, true, $pinCapable);
    $visible = $property->getValue($app);
    check(count($visible) === 2, 'pinned FCN visibility must not depend on client capability');
    {
        $proxy = $app->proxy($nodes[0]);
        check($proxy['tls-trust'] === 'spki' && count($proxy['server-public-key-pins']) === 1, 'missing explicit pin policy');
        check(!isset($proxy['skip-cert-verify']), 'insecure flag leaked into pinned subscription');
    }
}
echo "FCN pinned subscription is visible to both capability versions\n";

$preserved = \App\Services\FastCatAutoGrants::apply([$nodes[0]], 42, '/unused-legacy-grants');
check(($preserved[0]['protocol'] ?? '') === 'fcn-v1' && !isset($preserved[0]['_fastcat_auto_proxy']), 'legacy grant changed FCN identity');
echo "FCN legacy override isolation passed\n";

$v3 = [
    'id' => 3, 'type' => 'v2node', 'protocol' => 'fcn-v3', 'name' => 'FCN v3',
    'host' => 'v3.example', 'port' => '443', 'tls_settings' => [
        'server_name' => 'cert.example', 'fcn_spki_sha256' => 'ignored-pin', 'tls_key' => 'ignored-inline-key',
    ],
];
foreach ([false, true] as $capable) {
    foreach ([false, true] as $olderCapabilities) {
        $app = new FCNProbe($user, array_merge([$v3], $nodes), true, null, false, false,
            $olderCapabilities, $olderCapabilities, $capable);
        $visible = $property->getValue($app);
        check(count($visible) === ($capable ? 3 : 2), 'FCN v3 visibility must depend on its own capability');
        if ($capable) {
            check($app->proxy($visible[0]) === [
                'type' => 'fcn-v3', 'name' => 'FCN v3', 'server' => 'v3.example', 'port' => 443,
                'sni' => 'cert.example', 'uuid' => $user['uuid'], 'udp' => true,
            ], 'FCN v3 subscription must include only the CA/UUID contract fields');
        }
    }
}
$v3['tls_settings']['server_name'] = '';
check($app->proxy($v3)['sni'] === 'v3.example', 'FCN v3 must fall back to the server hostname for an empty SNI');
check(\App\Services\FastCatAutoGrants::apply([$v3], 42, '/unused-legacy-grants') === [$v3], 'legacy grant changed FCN v3 identity');
echo "FCN v3 account subscription, capability isolation and CA-only projection passed\n";
