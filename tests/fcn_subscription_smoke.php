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
    check(count($visible) === ($capable ? 2 : 0), 'wrong capability filtering');
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
echo "FCN v1/v2 account subscription and capability contracts passed\n";
