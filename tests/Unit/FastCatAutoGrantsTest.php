<?php

namespace Tests\Unit;

use App\Protocols\FastCatV1;
use App\Services\FastCatAutoGrants;
use Symfony\Component\Yaml\Yaml;
use App\Services\ServerService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Mockery;
use Tests\TestCase;

class FastCatAutoGrantsTest extends TestCase
{
    private $root;
    private $node;
    private $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = sys_get_temp_dir() . '/catboard-auto-' . bin2hex(random_bytes(8));
        $this->node = $this->root . '/vless:42';
        mkdir($this->node, 0700, true);
        file_put_contents($this->node . '/endpoints.json', json_encode([
            'server' => 'hk.example.net', 'port' => 18444, 'fallback-port' => 8443,
        ]));
        config(['fastcat.auto_grants_dir' => $this->root]);
        $this->service = Mockery::mock(ServerService::class);
        $this->service->shouldReceive('getServer')->with(42, 'vless')
            ->andReturn(['show' => 1, 'group_id' => [5]]);
        $this->app->instance(ServerService::class, $this->service);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);
        parent::tearDown();
    }

    private function runAction(string $action, array $args): int
    {
        return Artisan::call('fastcat:auto', ['action' => $action, 'node' => 'vless:42'] + $args);
    }

    public function testARegisteredAccountGetsOneLogicalNodeAndIndependentRevocableTokens()
    {
        $this->service->shouldReceive('getAvailableUsers')->with([5])->andReturn([['id' => 71], ['id' => 72]]);
        $this->assertSame(1, $this->runAction('grant', ['user' => '73']));
        $this->assertSame(0, $this->runAction('grant', ['user' => '71']));
        $server = ['id' => 42, 'type' => 'vless', 'name' => 'HK A', '_entry_logical_name' => 'HK'];
        $info = ['id' => 42, 'type' => 'vless', 'name' => 'Plan', '_entry_mode' => 'info'];
        $other = ['id' => 43, 'type' => 'vless', 'name' => 'JP'];
        $servers = [$info, $server, array_merge($server, ['name' => 'HK B']), $other];
        $result = FastCatAutoGrants::apply($servers, 71, $this->root);
        $this->assertSame(['Plan', 'HK', 'JP'], array_column($result, 'name'));
        $this->assertSame($info, $result[0]);
        $this->assertSame($other, $result[2]);
        $this->assertSame($servers, FastCatAutoGrants::apply($servers, 72, $this->root));
        $this->assertSame([], FastCatAutoGrants::apply([], 71, $this->root));
        $node = $result[1]['_fastcat_auto_proxy'];
        $this->assertSame('fastcat-auto', $node['type']);
        $this->assertNotSame($node['token'], $node['fallback-token']);
        $this->assertSame(0, $this->runAction('grant', ['user' => '71']));
        $this->assertSame(0, $this->runAction('export', ['--out' => $this->root . '/first']));
        $this->assertSame($node['token'] . "\n", file_get_contents($this->root . '/first/h2.tokens'));
        $this->assertSame($node['fallback-token'] . "\n", file_get_contents($this->root . '/first/v1.tokens'));
        $this->assertSame(0600, fileperms($this->root . '/first/h2.tokens') & 0777);
        $this->assertSame(0, $this->runAction('revoke', ['user' => '71']));
        $this->assertSame($servers, FastCatAutoGrants::apply($servers, 71, $this->root));
        $this->assertSame(0, $this->runAction('export', ['--out' => $this->root . '/second']));
        $this->assertSame('', file_get_contents($this->root . '/second/h2.tokens'));
        $this->assertSame('', file_get_contents($this->root . '/second/v1.tokens'));
    }

    /**
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function testEncryptedSubscriptionNegotiatesOneVisibleNodeOnlyOnCapableClient()
    {
        $this->service->shouldReceive('getAvailableUsers')->with([5])->andReturn([['id' => 71]]);
        $this->assertSame(0, $this->runAction('grant', ['user' => '71']));
        $key = random_bytes(32);
        config([
            'fastcat.subscription.enabled' => true, 'fastcat.subscription.active_kid' => 'test',
            'fastcat.subscription.current' => ['kid' => 'test', 'key' => base64_encode($key)],
        ]);
        $user = ['id' => 71, 'u' => 0, 'd' => 0, 'transfer_enable' => 1024, 'expired_at' => 0, 'uuid' => 'a'];
        $servers = [['id' => 42, 'type' => 'trojan', 'name' => 'HK', 'host' => 'old.example.net', 'port' => 443]];
        // Bind to the same panel type:id while using a simple legacy formatter.
        rename($this->node, $this->root . '/trojan:42');
        foreach ([[false, 0, 'trojan'], [true, 0, 'fastcat-auto'], [true, 1024, 'trojan']] as [$capable, $used, $expect]) {
            $user['d'] = $used;
            $env = json_decode((new FastCatV1($user, $servers, $capable))->handle(), true);
            $plain = openssl_decrypt(base64_decode($env['data']), 'aes-256-gcm', $key, OPENSSL_RAW_DATA,
                base64_decode($env['nonce']), base64_decode($env['tag']), 'fastcat-subscription|v1|test|' . $env['ts']);
            $doc = Yaml::parse($plain);
            $proxy = array_values(array_filter($doc['proxies'], function ($p) { return $p['name'] === 'HK'; }));
            $this->assertCount(1, $proxy);
            $this->assertSame($expect, $proxy[0]['type']);
            $this->assertContains('HK', array_merge(...array_column($doc['proxy-groups'], 'proxies')));
        }
    }

    public function testDeviceV2GrantIsScopedAndRevocationDoesNotAffectItsPeer()
    {
        $this->service->shouldReceive('getAvailableUsers')->with([5])->andReturn([['id' => 71]]);
        file_put_contents($this->node.'/endpoints.json', json_encode([
            'server' => 'hk.example.net', 'port' => 18444, 'fallback-port' => 8443, 'h3-port' => 18444,
            'tls-key-exchange' => 'x25519mlkem768',
        ]));
        $first = 'dev_' . str_repeat('a', 24);
        $second = 'dev_' . str_repeat('b', 24);
        foreach ([$first, $second] as $device) {
            $this->assertSame(0, $this->runAction('grant', ['user'=>'71','--device'=>$device]));
        }
        $a = FastCatAutoGrants::lookup($this->node, 71, $first);
        $b = FastCatAutoGrants::lookup($this->node, 71, $second);
        $this->assertSame(true, $a['udp']);
        $this->assertSame('x25519mlkem768', $a['tls-key-exchange']);
        $this->assertCount(4, array_unique([$a['token'], $a['h3-token'], $b['token'], $b['h3-token']]));
        $this->assertNull(FastCatAutoGrants::lookup($this->node, 72, $first));
        $this->assertNull(FastCatAutoGrants::lookup($this->node, 71));
        $this->assertSame(0, $this->runAction('revoke', ['user'=>'71','--device'=>$first]));
        $this->assertSame(0, $this->runAction('export', ['--out'=>$this->root.'/v2snapshot']));
        $this->assertSame($b['h3-token']."\n", file_get_contents($this->root.'/v2snapshot/h3.tokens'));
        $this->assertSame($b['token']."\n", file_get_contents($this->root.'/v2snapshot/h2.tokens'));
    }

    public function testNativeFastCatV2NodeRequiresADeviceGrant()
    {
        $root = $this->root . '/v2node:8';
        mkdir($root . '/grants', 0700, true);
        $device = 'dev_' . str_repeat('a', 24);
        file_put_contents($root . '/endpoints.json', json_encode([
            'server' => 'hk.example.net', 'port' => 18447, 'h3-port' => 18447,
        ]));
        file_put_contents($root . '/grants/71.' . $device . '.json', json_encode([
            'token' => bin2hex(random_bytes(32)), 'h3-token' => bin2hex(random_bytes(32)),
        ]));
        $native = ['id' => 8, 'type' => 'v2node', 'protocol' => 'fastcat-v2', 'name' => 'FastCat v2'];
        $legacy = ['id' => 12, 'type' => 'vless', 'name' => 'Legacy'];
        $servers = [$native, $legacy];
        $this->assertSame([$legacy], FastCatAutoGrants::apply($servers, 71, $this->root));
        $this->assertSame([$legacy], FastCatAutoGrants::apply($servers, 72, $this->root, $device));
        $this->assertSame([$legacy], FastCatAutoGrants::apply($servers, 0, ''));
        $result = FastCatAutoGrants::apply($servers, 71, $this->root, $device);
        $this->assertSame('fastcat-auto', $result[0]['_fastcat_auto_proxy']['type']);
        $this->assertSame(18447, $result[0]['_fastcat_auto_proxy']['h3-port']);
        $this->assertSame($legacy, $result[1]);
    }

    public function testDeviceProofBindsTheAuthenticatedSubscriptionAndExpires()
    {
        $key = str_repeat('q', 32);
        $id = 'dev_' . str_repeat('c', 24);
        $prefix = 'v2.' . $id . '.1800000000';
        $proof = $prefix.'.'.hash_hmac('sha256', $prefix.'.'.hash('sha256','account-token'), $key);
        $this->assertSame($id, FastCatAutoGrants::verifiedDevice($proof, 'account-token', $key, 1800000060));
        $this->assertNull(FastCatAutoGrants::verifiedDevice($proof, 'another-account', $key, 1800000000));
        $this->assertNull(FastCatAutoGrants::verifiedDevice($proof, 'account-token', $key, 1800000061));
        $this->assertNull(FastCatAutoGrants::verifiedDevice($proof, 'account-token', '', 1800000000));
        $this->assertNull(FastCatAutoGrants::verifiedDevice(str_replace('dev_cc','dev_ff',$proof), 'account-token', $key, 1800000000));
    }

    public function testExportRechecksAccountEligibilityAndDoesNotReplaceExistingSnapshots()
    {
        $this->service->shouldReceive('getAvailableUsers')->with([5])->andReturn([['id' => 71]], []);
        $this->assertSame(0, $this->runAction('grant', ['user' => '71']));
        $this->assertSame(0, $this->runAction('export', ['--out' => $this->root . '/snap']));
        $this->assertSame('', file_get_contents($this->root . '/snap/v1.tokens'));
        $this->assertSame(1, $this->runAction('export', ['--out' => $this->root . '/snap']));
    }
}
