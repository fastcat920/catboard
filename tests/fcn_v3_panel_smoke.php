<?php

// Exercise the service projections without Laravel or a database.
function config($key, $default = null) { return $GLOBALS['testConfig'][$key] ?? $default; }
function env($key, $default = null) { return $GLOBALS['testEnv'][$key] ?? $default; }
function check($value, $message) { if (!$value) throw new RuntimeException($message); }

class NodeFixture extends ArrayObject
{
    public function toArray() { return $this->getArrayCopy(); }
}
class NodeCollectionFixture extends ArrayObject
{
    public function get() { return $this; }
    public function keyBy($key)
    {
        $rows = [];
        foreach ($this as $node) $rows[$node[$key]] = $node;
        return new self($rows);
    }
    public function toArray()
    {
        return array_map(static function ($node) { return $node->toArray(); }, $this->getArrayCopy());
    }
}
class ServerV2nodeFixture
{
    public static $nodes;
    public static function orderBy($column, $order) { return new NodeCollectionFixture(self::$nodes); }
    public static function find($id) {
        foreach (self::$nodes as $node) {
            if ($node['id'] === $id) return $node;
        }
    }
}
class UserFixture { public $group_id; }
class CacheFixture { public static function get($key) { return null; } }
class ControllerFixture {}
class RequestFixture
{
    public function input($key) { return ['token' => 'example-token', 'node_id' => 11][$key] ?? null; }
    public function header($key) { return null; }
}
class ResponseFixture
{
    public $payload;
    public function header($key, $value) { return $this; }
}
function response($payload) {
    $response = new ResponseFixture();
    $response->payload = $payload;
    return $response;
}
class_alias(ServerV2nodeFixture::class, 'App\Models\ServerV2node');
class_alias(UserFixture::class, 'App\Models\User');
class_alias(CacheFixture::class, 'Illuminate\Support\Facades\Cache');
class_alias(ControllerFixture::class, 'App\Http\Controllers\Controller');
class_alias(RequestFixture::class, 'Illuminate\Http\Request');

require __DIR__ . '/../app/Utils/CacheKey.php';
require __DIR__ . '/../app/Services/FCNCertificate.php';
require __DIR__ . '/../app/Services/ServerService.php';
require __DIR__ . '/../app/Http/Controllers/V2/Server/ServerController.php';

$node = new NodeFixture([
    'id' => 11, 'show' => 1, 'protocol' => 'fcn-v3', 'host' => 'v3.example', 'port' => 443,
    'group_id' => [1], 'parent_id' => null, 'rate' => 2, 'tls_settings' => [
        'server_name' => 'public.example', 'cert_mode' => 'file', 'cert_file' => '/a/cert', 'key_file' => '/a/key',
        'tls_key' => 'private', 'private_key' => 'private', 'ech_key' => 'private', 'dns_env' => 'DNS_TOKEN=private',
    ],
    'encryption_settings' => ['private_key' => 'private'], 'network_settings' => ['secret' => 'private'],
    'obfs_password' => 'private',
]);
ServerV2nodeFixture::$nodes = [$node];
$service = new \App\Services\ServerService();
$user = new UserFixture();
$user->group_id = 2;
check($service->getAvailableV2node($user) === [], 'out-of-group user saw FCN v3');
$user->group_id = 1;
$visible = $service->getAvailableV2node($user);
check(count($visible) === 1 && $visible[0]['rate'] === 2 && $visible[0]['protocol'] === 'fcn-v3',
    'eligible FCN v3 node must retain its protocol and rate');
check($visible[0]['tls_settings'] === ['server_name' => 'public.example']
    && $visible[0]['encryption_settings'] === null && $visible[0]['network_settings'] === null
    && $visible[0]['obfs_password'] === null, 'private settings leaked into user node API');
check($node['tls_settings']['key_file'] === '/a/key', 'node-local certificate path lost from stored settings');
$settings = $node['tls_settings'];
$node['tls_settings'] = array_merge($settings, ['server_name' => '']);
check($service->getAvailableV2node($user)[0]['tls_settings'] === ['server_name' => 'v3.example'],
    'the default identity must be captured before an entry pool changes the dial address');
$node['tls_settings'] = $settings;

$GLOBALS['testConfig'] = ['v2board.server_api_url' => 'https://panel.example', 'v2board.server_token' => 'example-token'];
check($service->getAllV2node()[0]['install_command'] === null, 'unconfigured FCN v3 installer fell back to a legacy release');
$GLOBALS['testConfig']['fastcat.fcn_v3_native_bootstrap_url'] = 'http://release.example/bootstrap.sh';
check($service->getAllV2node()[0]['install_command'] === null, 'installer accepted a non-HTTPS release');
$GLOBALS['testConfig']['fastcat.fcn_v3_native_bootstrap_url'] = 'https://release.example/fcn3/bootstrap.sh';
$command = $service->getAllV2node()[0]['install_command'];
check(strpos($command, "'https://release.example/fcn3/bootstrap.sh'") !== false
    && strpos($command, "--native --api-host 'https://panel.example' --node-id 11 --api-key 'example-token'") !== false
    && strpos($command, 'v0.5.0') === false, 'installer did not use the configured v3 release');

$GLOBALS['testEnv'] = ['FASTCAT_FCN_V3_NATIVE_BOOTSTRAP_URL' => ''];
$fastcat = require __DIR__ . '/../config/fastcat.php';
foreach (['fcn_v3_native_bootstrap_url', 'fcn_native_bootstrap_url'] as $key) {
    $GLOBALS['testConfig']['fastcat.' . $key] = $fastcat[$key];
}
foreach (['fcn-v1', 'fcn-v2', 'fcn-v3'] as $protocol) {
    $node['protocol'] = $protocol;
    $command = $service->getAllV2node()[0]['install_command'];
    check(strpos($command, "'https://github.com/fastcat920/CatNode/releases/download/v0.7.1/bootstrap.sh'") !== false
        && strpos($command, "--native --api-host 'https://panel.example' --node-id 11 --api-key 'example-token'") !== false,
        $protocol . ' did not default to the CatNode native release');
    $certificate = $service->getAvailableV2node($user)[0]['tls_settings'];
    check($certificate['server_name'] === 'public.example'
        && !array_intersect_key($certificate, array_flip(['dns_env', 'tls_key', 'cert_file', 'key_file'])),
        $protocol . ' leaked certificate deployment secrets');
}
echo "FCN group visibility, user API projection and native installers passed\n";

$node = new NodeFixture($node->getArrayCopy() + array_fill_keys([
    'listen_ip', 'server_port', 'network', 'trusted_x_forwarded_for', 'tls', 'encryption', 'flow',
    'cipher', 'congestion_control', 'zero_rtt_handshake', 'up_mbps', 'down_mbps', 'obfs', 'padding_scheme', 'route_id',
], null), ArrayObject::ARRAY_AS_PROPS);
$dns = ['cert_mode' => 'dns', 'provider' => 'cloudflare', 'dns_env' => 'DNS_TOKEN=private'];
$node['tls_settings'] = $dns;
ServerV2nodeFixture::$nodes = [$node];
$request = new RequestFixture();
foreach (['fcn-v1', 'fcn-v2', 'fcn-v3'] as $protocol) {
    $node['protocol'] = $protocol;
    $api = new \App\Http\Controllers\V2\Server\ServerController($request);
    check($api->config($request)->payload['tls_settings'] === $dns + ['server_name' => 'v3.example'],
        $protocol . ' node API lost automatic domain or DNS credentials');
    check($node['tls_settings'] === $dns, 'the node API must not persist the fallback as a fixed SNI');
}
echo "FCN authenticated node config provides the effective automatic certificate domain\n";
