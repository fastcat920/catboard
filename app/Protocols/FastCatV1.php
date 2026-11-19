<?php

namespace App\Protocols;

use App\Services\FastCatAutoGrants;
use App\Services\FastCatSubscriptionCipher;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

class FastCatV1 extends ClashMeta
{
    public $flag = 'fastcat-v1';

    private const HIDDEN_PROXY_GROUPS = ['自动选择', '故障转移'];

    public function __construct($user, $servers, bool $supportsAuto = false, ?string $device = null, bool $managedV2 = false)
    {
        $directory = (string) config('fastcat.auto_grants_dir', '');
        if ($supportsAuto && $user['u'] + $user['d'] < $user['transfer_enable']) {
            $servers = FastCatAutoGrants::apply($servers, (int) $user['id'], $directory, $device, $managedV2);
        } else {
            $servers = FastCatAutoGrants::apply($servers, 0, '');
        }
        parent::__construct($user, $servers);
    }

    protected function buildCustomProxy(array $server): ?array
    {
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
