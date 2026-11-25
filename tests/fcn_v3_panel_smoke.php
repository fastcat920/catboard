<?php

// Exercise the service projections without Laravel or a database.
function config($key, $default = null) { return $GLOBALS['testConfig'][$key] ?? $default; }
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
}
class UserFixture { public $group_id; }
class CacheFixture { public static function get($key) { return null; } }
class_alias(ServerV2nodeFixture::class, 'App\Models\ServerV2node');
class_alias(UserFixture::class, 'App\Models\User');
class_alias(CacheFixture::class, 'Illuminate\Support\Facades\Cache');

require __DIR__ . '/../app/Utils/CacheKey.php';
require __DIR__ . '/../app/Services/ServerService.php';

$node = new NodeFixture([
    'id' => 11, 'show' => 1, 'protocol' => 'fcn-v3', 'host' => 'v3.example', 'port' => 443,
    'group_id' => [1], 'parent_id' => null, 'rate' => 2, 'tls_settings' => [
        'server_name' => 'public.example', 'cert_mode' => 'file', 'cert_file' => '/a/cert', 'key_file' => '/a/key',
        'tls_key' => 'private', 'private_key' => 'private', 'ech_key' => 'private',
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
echo "FCN v3 group visibility, user API projection and optional installer passed\n";
