<?php

namespace App\Protocols;

use App\Services\FastCatAutoGrants;
use App\Services\FastCatSubscriptionCipher;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

class FastCatV1 extends ClashMeta
{
    public $flag = 'fastcat-v1';

    private $fcnUuid;

    private const HIDDEN_PROXY_GROUPS = ['自动选择', '故障转移'];

    public function __construct($user, $servers, bool $supportsAuto = false, ?string $device = null, bool $managedV2 = false, bool $transportModes = false, bool $supportsFCN = false, bool $supportsFCNPinning = false, bool $supportsFCNV3 = false)
    {
        $this->fcnUuid = $user['uuid'];
        // FCN v1/v2 retain their existing account/group visibility behavior.
        $servers = self::filterUnsupportedFCNV3($servers, $supportsFCNV3);
        $directory = (string) config('fastcat.auto_grants_dir', '');
        if ($supportsAuto && $user['u'] + $user['d'] < $user['transfer_enable']) {
            $servers = FastCatAutoGrants::apply($servers, (int) $user['id'], $directory, $device, $managedV2, $transportModes);
        } else {
            $servers = FastCatAutoGrants::apply($servers, 0, '');
        }
        parent::__construct($user, $servers);
    }

    public static function filterUnsupportedFCNV3(array $servers, bool $supportsFCNV3): array
    {
        if ($supportsFCNV3) return $servers;
        return array_values(array_filter($servers, static function (array $server) {
            return ($server['protocol'] ?? $server['type'] ?? '') !== 'fcn-v3';
        }));
    }

    protected function buildCustomProxy(array $server): ?array
    {
        $protocol = $server['protocol'] ?? $server['type'] ?? '';
        if ($protocol === 'fcn-v3') {
            return [
                'type' => 'fcn-v3', 'name' => $server['name'],
                'server' => $server['host'], 'port' => (int) $server['port'],
                'sni' => !empty($server['tls_settings']['server_name']) ? $server['tls_settings']['server_name'] : $server['host'],
                'uuid' => $this->fcnUuid, 'udp' => true,
            ];
        }
        if (in_array($protocol, ['fcn-v1', 'fcn-v2'], true)) {
            $proxy = [
                'name' => $server['name'], 'type' => 'fcn',
                'version' => $protocol === 'fcn-v1' ? 1 : 2,
                'server' => $server['host'], 'port' => (int) $server['port'],
                'uuid' => $this->fcnUuid,
                'sni' => !empty($server['tls_settings']['server_name']) ? $server['tls_settings']['server_name'] : $server['host'],
                'udp' => true,
            ];
            $trust = $server['tls_settings']['fcn_trust_mode'] ?? 'ca';
            if ($trust === 'spki') {
                $pin = $server['tls_settings']['fcn_spki_sha256'] ?? '';
                // A malformed managed identity is never downgraded to CA validation.
                if (!preg_match('/^sha256\/[A-Za-z0-9+\/]{43}=$/D', $pin)) {
                    throw new ServiceUnavailableHttpException(null, 'FCN 公钥指纹缺失，请在面板重新保存节点。');
                }
                $proxy['tls-trust'] = 'spki';
                $proxy['server-public-key-pins'] = [$pin];
            } elseif ($trust !== 'ca') {
                throw new ServiceUnavailableHttpException(null, 'Unknown FCN trust mode.');
            }
            return $proxy;
        }
        return $server['_fastcat_auto_proxy'] ?? null;
    }

    public function handle()
    {
        if (!config('fastcat.subscription.enabled', false)) {
            throw new ServiceUnavailableHttpException(null, 'FastCat encrypted subscription is disabled.');
        }

        $yaml = parent::handle();
        $envelope = app(FastCatSubscriptionCipher::class)->encrypt($yaml);

        header('Content-Type: application/vnd.fastcat.subscription+json; charset=utf-8');
        header('X-FastCat-Protocol: 1');
        header('Cache-Control: private, no-store');

        return $envelope;
    }

    protected function transformConfig(array $config): array
    {
        return self::removeHiddenProxyGroups($config);
    }

    public static function removeHiddenProxyGroups(array $config): array
    {
        $groups = $config['proxy-groups'] ?? null;
        if (!is_array($groups)) {
            return $config;
        }

        $config['proxy-groups'] = array_values(array_filter(array_map(function ($group) {
            if (!is_array($group)) {
                return $group;
            }

            if (in_array($group['name'] ?? null, self::HIDDEN_PROXY_GROUPS, true)) {
                return null;
            }

            if (isset($group['proxies']) && is_array($group['proxies'])) {
                $group['proxies'] = array_values(array_filter(
                    $group['proxies'],
                    function ($proxy) {
                        return !in_array($proxy, self::HIDDEN_PROXY_GROUPS, true);
                    }
                ));
            }

            return $group;
        }, $groups), function ($group) {
            return $group !== null;
        }));

        return $config;
    }
}
