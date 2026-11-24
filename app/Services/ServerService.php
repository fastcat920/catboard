<?php

namespace App\Services;

use App\Models\ServerHysteria;
use App\Models\ServerLog;
use App\Models\ServerRoute;
use App\Models\ServerShadowsocks;
use App\Models\ServerVless;
use App\Models\ServerV2node;
use App\Models\User;
use App\Models\ServerVmess;
use App\Models\ServerTrojan;
use App\Models\ServerTuic;
use App\Models\ServerAnytls;
use App\Utils\CacheKey;
use App\Utils\Helper;
use Illuminate\Support\Facades\Cache;

class ServerService
{
    public function getAvailableVless(User $user): array
    {
        $servers = [];
        $model = ServerVless::orderBy('sort', 'ASC');
        $server = $model->get();
        foreach ($server as $key => $v) {
            if (!$v['show']) continue;
            $server[$key]['type'] = 'vless';
            if (!in_array($user->group_id, $server[$key]['group_id'])) continue;
            if (strpos($server[$key]['port'], '-') !== false) {
                $server[$key]['port'] = Helper::randomPort($server[$key]['port']);
            }
            if ($server[$key]['parent_id']) {
                $server[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_VLESS_LAST_CHECK_AT', $server[$key]['parent_id']));
            } else {
                $server[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_VLESS_LAST_CHECK_AT', $server[$key]['id']));
            }
            if (isset($server[$key]['tls_settings'])) {
                $server[$key]['tls_settings'] = array_diff_key(
                    $server[$key]['tls_settings'],
                    array_flip(array_filter(['private_key', 'ech_key'], function($k) use ($server, $key) {
                        return isset($server[$key]['tls_settings'][$k]);
                    }))
                );
            }
            if (isset($server[$key]['encryption_settings'])) {
                if (isset($server[$key]['encryption_settings']['private_key'])) {
                    $server[$key]['encryption_settings'] = array_diff_key($server[$key]['encryption_settings'], array('private_key' => ''));
                }
            }
            $servers[] = $server[$key]->toArray();
        }


        return $servers;
    }

    public function getAvailableVmess(User $user): array
    {
        $servers = [];
        $model = ServerVmess::orderBy('sort', 'ASC');
        $vmess = $model->get();
        foreach ($vmess as $key => $v) {
            if (!$v['show']) continue;
            $vmess[$key]['type'] = 'vmess';
            if (!in_array($user->group_id, $vmess[$key]['group_id'])) continue;
            if (strpos($vmess[$key]['port'], '-') !== false) {
                $vmess[$key]['port'] = Helper::randomPort($vmess[$key]['port']);
            }
            if ($vmess[$key]['parent_id']) {
                $vmess[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_VMESS_LAST_CHECK_AT', $vmess[$key]['parent_id']));
            } else {
                $vmess[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_VMESS_LAST_CHECK_AT', $vmess[$key]['id']));
            }
            $servers[] = $vmess[$key]->toArray();
        }


        return $servers;
    }

    public function getAvailableTrojan(User $user): array
    {
        $servers = [];
        $model = ServerTrojan::orderBy('sort', 'ASC');
        $trojan = $model->get();
        foreach ($trojan as $key => $v) {
            if (!$v['show']) continue;
            $trojan[$key]['type'] = 'trojan';
            if (!in_array($user->group_id, $trojan[$key]['group_id'])) continue;
            if (strpos($trojan[$key]['port'], '-') !== false) {
                $trojan[$key]['port'] = Helper::randomPort($trojan[$key]['port']);
            }
            if ($trojan[$key]['parent_id']) {
                $trojan[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_TROJAN_LAST_CHECK_AT', $trojan[$key]['parent_id']));
            } else {
                $trojan[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_TROJAN_LAST_CHECK_AT', $trojan[$key]['id']));
            }
            $servers[] = $trojan[$key]->toArray();
        }
        return $servers;
    }

    public function getAvailableTuic(User $user)
    {
        $availableServers = [];
        $model = ServerTuic::orderBy('sort', 'ASC');
        $servers = $model->get()->keyBy('id');
        foreach ($servers as $key => $v) {
            if (!$v['show']) continue;
            $servers[$key]['type'] = 'tuic';
            $servers[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_TUIC_LAST_CHECK_AT', $v['id']));
            if (!in_array($user->group_id, $v['group_id'])) continue;
            if (isset($servers[$v['parent_id']])) {
                $servers[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_TUIC_LAST_CHECK_AT', $v['parent_id']));
                $servers[$key]['created_at'] = $servers[$v['parent_id']]['created_at'];
            }
            $availableServers[] = $servers[$key]->toArray();
        }
        return $availableServers;
    }

    public function getAvailableHysteria(User $user)
    {
        $availableServers = [];
        $model = ServerHysteria::orderBy('sort', 'ASC');
        $servers = $model->get()->keyBy('id');
        foreach ($servers as $key => $v) {
            if (!$v['show']) continue;
            $servers[$key]['type'] = 'hysteria';
            $servers[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_HYSTERIA_LAST_CHECK_AT', $v['id']));
            if (!in_array($user->group_id, $v['group_id'])) continue;
            if (isset($servers[$v['parent_id']])) {
                $servers[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_HYSTERIA_LAST_CHECK_AT', $v['parent_id']));
                $servers[$key]['created_at'] = $servers[$v['parent_id']]['created_at'];
            }
            $servers[$key]['server_key'] = Helper::getServerKey($servers[$key]['created_at'], 16);
            $availableServers[] = $servers[$key]->toArray();
        }
        return $availableServers;
    }

    public function getAvailableShadowsocks(User $user)
    {
        $servers = [];
        $model = ServerShadowsocks::orderBy('sort', 'ASC');
        $shadowsocks = $model->get()->keyBy('id');
        foreach ($shadowsocks as $key => $v) {
            if (!$v['show']) continue;
            $shadowsocks[$key]['type'] = 'shadowsocks';
            $shadowsocks[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_SHADOWSOCKS_LAST_CHECK_AT', $v['id']));
            if (!in_array($user->group_id, $v['group_id'])) continue;
            if (strpos($v['port'], '-') !== false) {
                $shadowsocks[$key]['port'] = Helper::randomPort($v['port']);
            }
            if (isset($shadowsocks[$v['parent_id']])) {
                $shadowsocks[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_SHADOWSOCKS_LAST_CHECK_AT', $v['parent_id']));
                $shadowsocks[$key]['created_at'] = $shadowsocks[$v['parent_id']]['created_at'];
            }
            if ($v['obfs'] === 'http') {
                $shadowsocks[$key]['obfs'] = 'http';
                $shadowsocks[$key]['obfs-host'] = $v['obfs_settings']['host'];
                $shadowsocks[$key]['obfs-path'] = $v['obfs_settings']['path'];
            }
            $servers[] = $shadowsocks[$key]->toArray();
        }
        return $servers;
    }

    public function getAvailableAnyTLS(User $user)
    {
        $servers = [];
        $model = ServerAnytls::orderBy('sort', 'ASC');
        $anytls = $model->get()->keyBy('id');
        foreach ($anytls as $key => $v) {
            if (!$v['show']) continue;
            $anytls[$key]['type'] = 'anytls';
            $anytls[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_ANYTLS_LAST_CHECK_AT', $v['id']));
            if (!in_array($user->group_id, $v['group_id'])) continue;
            if (strpos($v['port'], '-') !== false) {
                $anytls[$key]['port'] = Helper::randomPort($v['port']);
            }
            if (isset($anytls[$v['parent_id']])) {
                $anytls[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_ANYTLS_LAST_CHECK_AT', $v['parent_id']));
                $anytls[$key]['created_at'] = $anytls[$v['parent_id']]['created_at'];
            }
            $servers[] = $anytls[$key]->toArray();
        }
        return $servers;
    }

    public function getAvailableV2node(User $user)
    {
        $servers = [];
        $model = ServerV2node::orderBy('sort', 'ASC');
        $v2node = $model->get()->keyBy('id');
        foreach ($v2node as $key => $v) {
            if (!$v['show']) continue;
            $v2node[$key]['type'] = 'v2node';
            $v2node[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_V2NODE_LAST_CHECK_AT', $v['id']));
            if (!in_array($user->group_id, $v['group_id'])) continue;
            if ($v['protocol'] === 'fastcat-v2' && $v['parent_id']) {
                $parent = $v2node[$v['parent_id']] ?? null;
                if (!$parent || $parent['protocol'] !== 'fastcat-v2' || $parent['parent_id']
                    || !in_array($user->group_id, $parent['group_id'])) {
                    continue;
                }
                $v2node[$key]['_fastcat_managed_parent'] = (int) $parent['id'];
                $v2node[$key]['_fastcat_parent_mode'] = $parent['tls_settings']['fastcat_transport_mode'] ?? 'auto';
                $v2node[$key]['_fastcat_managed_sni'] = $parent['host'];
            }
            if (isset($v2node[$v['parent_id']])) {
                $v2node[$key]['last_check_at'] = Cache::get(CacheKey::get('SERVER_V2NODE_LAST_CHECK_AT', $v['parent_id']));
                $v2node[$key]['created_at'] = $v2node[$v['parent_id']]['created_at'];
            }
            if (isset($v2node[$key]['tls_settings'])) {
                $v2node[$key]['tls_settings'] = array_diff_key(
                    $v2node[$key]['tls_settings'],
                    array_flip(array_filter(['private_key', 'ech_key'], function($k) use ($v2node, $key) {
                        return isset($v2node[$key]['tls_settings'][$k]);
                    }))
                );
            }
            if (isset($v2node[$key]['encryption_settings'])) {
                if (isset($v2node[$key]['encryption_settings']['private_key'])) {
                    $v2node[$key]['encryption_settings'] = array_diff_key($v2node[$key]['encryption_settings'], array('private_key' => ''));
                }
            }
            $export = $v2node[$key]->toArray();
            if (in_array($v['protocol'], ['fcn-v1', 'fcn-v2'], true)) {
                $identityNode = $v2node[$key];
                $seen = [$key => true];
                $parentId = $v['parent_id'];
                while ($parentId && !isset($seen[$parentId])) {
                    $parent = $v2node[$parentId] ?? null;
                    if (!$parent || !in_array($parent['protocol'], ['fcn-v1', 'fcn-v2'], true)) break;
                    $identityNode = $parent;
                    $seen[$parentId] = true;
                    $parentId = $parent['parent_id'];
                }
                $export['tls_settings'] = \App\Services\FCNCertificate::publicSettings(
                    $identityNode['tls_settings'] ?? [], $identityNode['host']
                );
            }
            $servers[] = $export;
        }
        return $servers;
    }

    public function getAvailableServers(User $user, ?array $client = null)
    {
        $servers = array_merge(
            $this->getAvailableShadowsocks($user),
            $this->getAvailableVmess($user),
            $this->getAvailableTrojan($user),
            $this->getAvailableTuic($user),
            $this->getAvailableHysteria($user),
            $this->getAvailableVless($user),
            $this->getAvailableAnyTLS($user),
            $this->getAvailableV2node($user)
        );
        $tmp = array_column($servers, 'sort');
        array_multisort($tmp, SORT_ASC, $servers);
        $servers = array_map(function ($server) {
            if (strpos($server['port'], '-')) {
                $server['mport'] = (string)$server['port'];
            } else {
                $server['port'] = (int)$server['port'];
            }
            $server['is_online'] = (time() - 300 > $server['last_check_at']) ? 0 : 1;
            $server['cache_key'] = "{$server['type']}-{$server['id']}-{$server['updated_at']}-{$server['is_online']}";
            return $server;
        }, $servers);
        return (new NodeEntryPoolService())->expand($servers, $client);
    }

    public function getAvailableUsers($groupId)
    {
        return User::whereIn('group_id', $groupId)
            ->whereRaw('u + d < transfer_enable')
            ->where(function ($query) {
                $query->where('expired_at', '>=', time())
                    ->orWhere('expired_at', NULL);
            })
            ->where('banned', 0)
            ->select([
                'id',
                'uuid',
                'speed_limit',
                'device_limit'
            ])
            ->get();
    }

    public function log(int $userId, int $serverId, int $u, int $d, float $rate, string $method)
    {
        if (($u + $d) < 10240) return true;
        $timestamp = strtotime(date('Y-m-d'));
        $serverLog = ServerLog::where('log_at', '>=', $timestamp)
            ->where('log_at', '<', $timestamp + 3600)
            ->where('server_id', $serverId)
            ->where('user_id', $userId)
            ->where('rate', $rate)
            ->where('method', $method)
            ->first();
        if ($serverLog) {
            try {
                $serverLog->increment('u', $u);
                $serverLog->increment('d', $d);
                return true;
            } catch (\Exception $e) {
                return false;
            }
        } else {
            $serverLog = new ServerLog();
            $serverLog->user_id = $userId;
            $serverLog->server_id = $serverId;
            $serverLog->u = $u;
            $serverLog->d = $d;
            $serverLog->rate = $rate;
            $serverLog->log_at = $timestamp;
            $serverLog->method = $method;
            return $serverLog->save();
        }
    }

    public function getAllShadowsocks()
    {
        $servers = ServerShadowsocks::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'shadowsocks';
        }
        return $servers;
    }

    public function getAllVMess()
    {
        $servers = ServerVmess::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'vmess';
        }
        return $servers;
    }

    public function getAllVLess()
    {
        $servers = ServerVless::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'vless';
        }
        return $servers;
    }

    public function getAllTrojan()
    {
        $servers = ServerTrojan::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'trojan';
        }
        return $servers;
    }

    public function getAllTuic()
    {
        $servers = ServerTuic::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'tuic';
        }
        return $servers;
    }

    public function getAllHysteria()
    {
        $servers = ServerHysteria::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'hysteria';
        }
        return $servers;
    }

    public function getAllAnyTLS()
    {
        $servers = ServerAnytls::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'anytls';
            if (isset($v['padding_scheme'])) {
                $servers[$k]['padding_scheme'] = json_encode($v['padding_scheme']);
            }
        }
        return $servers;
    }

    private function fastCatDeployCommand(array $node, string $panel): ?string
    {
        $port = filter_var($node['server_port'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
        if (!$port) return null;
        if ($node['parent_id']) {
            $parent = $this->getServer((int) $node['parent_id'], 'v2node');
            if (!$parent || $parent['protocol'] !== 'fastcat-v2' || $parent['parent_id']) return null;
            $host = $parent['tls_settings']['fastcat_endpoint_ipv4'] ?? $parent['host'];
            $targetPort = filter_var($parent['port'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
            if (!$targetPort || !filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) return null;
            $parentMode = $parent['tls_settings']['fastcat_transport_mode'] ?? 'auto';
            $childMode = $node['tls_settings']['fastcat_transport_mode'] ?? 'auto';
            $mode = $childMode === 'auto' ? $parentMode : $childMode;
            if ($parentMode !== 'auto' && $mode !== $parentMode) return null;
            $streams = [];
            if ($mode !== 'h3') $streams[] = sprintf('server { listen %d; proxy_pass %s:%d; }', $port, $host, $targetPort);
            if ($mode !== 'h2') $streams[] = sprintf('server { listen %d udp reuseport; proxy_pass %s:%d; proxy_timeout 10m; }', $port, $host, $targetPort);
            return implode("\n", $streams);
        }
        if (parse_url($panel, PHP_URL_SCHEME) !== 'https' || !parse_url($panel, PHP_URL_HOST)
            || !filter_var($node['host'], FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) return null;
        $apiKey = (string) config('v2board.server_token', '');
        if ($apiKey === '') return null;
        return sprintf(
            'curl -fsSLo catnode-install.sh https://github.com/fastcat920/CatNode/releases/download/v0.4.0/bootstrap.sh && ' .
            'bash catnode-install.sh --api-host %s --node-id %d --domain %s --port %d --api-key %s%s',
            escapeshellarg($panel), (int) $node['id'], escapeshellarg($node['host']), $port, escapeshellarg($apiKey), $port === 443 ? ' --shared-https' : ''
        );
    }

    public function getAllV2node()
    {
        $servers = ServerV2node::orderBy('sort', 'ASC')
            ->get()
            ->toArray();
        foreach ($servers as $k => $v) {
            $servers[$k]['type'] = 'v2node';
            if (isset($v['padding_scheme'])) {
                $servers[$k]['padding_scheme'] = json_encode($v['padding_scheme']);
            }

            $apiHost = config('v2board.server_api_url', config('v2board.app_url'));
            if (in_array($v['protocol'] ?? '', ['fcn-v1', 'fcn-v2'], true)) {
                $servers[$k]['install_command'] = sprintf(
                    'curl -fsSLo catnode-install.sh https://github.com/fastcat920/CatNode/releases/download/v0.5.0/bootstrap.sh && bash catnode-install.sh --native --api-host %s --node-id %d --api-key %s',
                    escapeshellarg((string) $apiHost), (int) $v['id'], escapeshellarg((string) config('v2board.server_token', ''))
                );
                continue;
            }
            if (($v['protocol'] ?? '') === 'fastcat-v2') {
                $servers[$k]['install_command'] = $this->fastCatDeployCommand($v, (string) $apiHost);
                continue;
            }

            $apiKey = config('v2board.server_token', '');
            $nodeId = (int) $v['id'];
            $apiHostArg = escapeshellarg((string) $apiHost);
            $apiKeyArg = escapeshellarg((string) $apiKey);
            $servers[$k]['install_command'] = sprintf(
                'wget -N https://raw.githubusercontent.com/wyx2685/v2node/master/script/install.sh && bash install.sh --api-host %s --node-id %d --api-key %s',
                $apiHostArg,
                $nodeId,
                $apiKeyArg
            );
        }
        return $servers;
    }

    private function mergeData(&$servers)
    {
        foreach ($servers as $k => $v) {
            $serverType = strtoupper($v['type']);
            $servers[$k]['online'] = Cache::get(CacheKey::get("SERVER_{$serverType}_ONLINE_USER", $v['parent_id'] ?? $v['id']));
            $servers[$k]['last_check_at'] = Cache::get(CacheKey::get("SERVER_{$serverType}_LAST_CHECK_AT", $v['parent_id'] ?? $v['id']));
            $servers[$k]['last_push_at'] = Cache::get(CacheKey::get("SERVER_{$serverType}_LAST_PUSH_AT", $v['parent_id'] ?? $v['id']));
            if ((time() - 300) >= $servers[$k]['last_check_at']) {
                $servers[$k]['available_status'] = 0;
            } else if ((time() - 300) >= $servers[$k]['last_push_at']) {
                $servers[$k]['available_status'] = 1;
            } else {
                $servers[$k]['available_status'] = 2;
            }
        }
    }

    public function getAllServers()
    {
        $servers = array_merge(
            $this->getAllShadowsocks(),
            $this->getAllVMess(),
            $this->getAllTrojan(),
            $this->getAllTuic(),
            $this->getAllHysteria(),
            $this->getAllVLess(),
            $this->getAllAnyTLS(),
            $this->getAllV2node()
        );
        $this->mergeData($servers);
        $tmp = array_column($servers, 'sort');
        array_multisort($tmp, SORT_ASC, $servers);
        return $servers;
    }

    public function getRoutes(array $routeIds)
    {
        $routeIds = array_map('intval', $routeIds);
        $order = implode(',', $routeIds);
        $routes = ServerRoute::select(['id', 'match', 'action', 'action_value'])
            ->whereIn('id', $routeIds)
            ->orderByRaw("FIELD(id, $order)")
            ->get();
        foreach ($routes as $k => $route) {
            $array = json_decode($route->match, true);
            if (is_array($array)) $routes[$k]['match'] = $array;
        }
        return $routes;
    }

    public function getServer($serverId, $serverType)
    {
        switch ($serverType) {
            case 'v2node':
                return ServerV2node::find($serverId);
            case 'vmess':
                return ServerVmess::find($serverId);
            case 'shadowsocks':
                return ServerShadowsocks::find($serverId);
            case 'trojan':
                return ServerTrojan::find($serverId);
            case 'tuic':
                return ServerTuic::find($serverId);
            case 'hysteria':
                return ServerHysteria::find($serverId);
            case 'vless':
                return ServerVless::find($serverId);
            case 'anytls':
                return ServerAnytls::find($serverId);
            default:
                return false;
        }
    }
}
