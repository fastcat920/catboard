<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\NodeSecurity\EntrySyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class NodeEntryPoolController extends Controller
{
    public function entryPools(Request $request)
    {
        $servers = collect((new \App\Services\ServerService())->getAllServers())->map(function ($server) {
            return [
                'server_type' => $server['type'], 'server_id' => (int)$server['id'],
                'server_name' => $server['name'] ?? '未命名节点',
                'original_address' => $this->formatServerAddress((string)($server['host'] ?? ''), (string)($server['port'] ?? '')),
            ];
        })->filter(function ($server) use ($request) {
            if ($request->filled('server_type') && $server['server_type'] !== $request->input('server_type')) return false;
            if ($request->filled('server_id') && $server['server_id'] !== (int)$request->input('server_id')) return false;
            return true;
        })->keyBy(function ($server) { return $server['server_type'] . ':' . $server['server_id']; });
        $settings = DB::table('v2_node_entry_setting')->get()->keyBy(function ($row) {
            return $row->server_type . ':' . $row->server_id;
        });
        $entries = DB::table('v2_node_entry_pool')->orderBy('priority')->orderBy('id')->get()->groupBy(function ($row) {
            return $row->server_type . ':' . $row->server_id;
        });
        try {
            $clientPolicies = DB::table('v2_node_entry_client_policy')->orderBy('priority')->orderBy('id')->get()->groupBy(function ($row) {
                return $row->server_type . ':' . $row->server_id;
            });
        } catch (\Throwable $e) {
            $clientPolicies = collect();
        }
        $data = $servers->map(function ($server, $key) use ($settings, $entries, $clientPolicies) {
            $setting = $settings->get($key);
            $server['delivery_mode'] = $setting->delivery_mode ?? 'primary_only';
            $server['check_url'] = $setting->check_url ?? 'http://www.gstatic.com/generate_204';
            $server['check_interval'] = $setting->check_interval ?? 60;
            $server['client_visibility_mode'] = $setting->client_visibility_mode ?? 'all';
            $server['sync_primary_host'] = (bool)($setting->sync_primary_host ?? false);
            $server['sync_primary_port'] = (bool)($setting->sync_primary_port ?? false);
            $server['entries'] = $entries->get($key, collect())->map(function ($entry) {
                try { $host = Crypt::decryptString($entry->host_encrypted); } catch (\Throwable $e) { $host = '解密失败'; }
                return [
                    'id' => $entry->id, 'name' => $entry->name, 'host' => $host, 'port' => $entry->port,
                    'priority' => $entry->priority, 'is_primary' => (bool)$entry->is_primary,
                    'enabled' => (bool)$entry->enabled, 'health_status' => $entry->health_status,
                    'last_checked_at' => $entry->last_checked_at, 'last_healthy_at' => $entry->last_healthy_at,
                ];
            })->values();
            $server['client_policies'] = $clientPolicies->get($key, collect())->map(function ($policy) {
                return [
                    'id' => (int)$policy->id, 'client_family' => $policy->client_family,
                    'client_platform' => $policy->client_platform, 'user_agent' => $policy->user_agent ?? null,
                    'min_version' => $policy->min_version,
                    'max_version' => $policy->max_version, 'delivery_mode' => $policy->delivery_mode,
                    'visibility' => $policy->visibility ?? 'show',
                    'check_url' => $policy->check_url, 'check_interval' => (int)$policy->check_interval,
                    'priority' => (int)$policy->priority, 'enabled' => (bool)$policy->enabled,
                ];
            })->values();
            return $server;
        })->sortBy(function ($server) {
            return sprintf('%010d:%s', (int)$server['server_id'], $server['server_type']);
        })->values();
        $perPage = $this->perPage($request);
        $currentPage = max(1, (int)$request->input('page', 1));
        $total = $data->count();
        $lastPage = max(1, (int)ceil($total / $perPage));
        if ($currentPage > $lastPage) $currentPage = $lastPage;
        return response(['data' => [
            'current_page' => $currentPage,
            'data' => $data->forPage($currentPage, $perPage)->values(),
            'from' => $total ? (($currentPage - 1) * $perPage + 1) : null,
            'last_page' => $lastPage,
            'per_page' => $perPage,
            'to' => $total ? min($currentPage * $perPage, $total) : null,
            'total' => $total,
        ]]);
    }

    public function saveEntrySetting(Request $request)
    {
        $request->validate([
            'server_type' => 'required|string|max:32', 'server_id' => 'required|integer|min:1',
            'delivery_mode' => 'required|in:primary_only,manual_backup,auto_fallback',
            'client_visibility_mode' => 'required|in:all,allowlist,denylist',
            'check_url' => 'required|url|max:255', 'check_interval' => 'required|integer|min:30|max:86400',
            'sync_primary_host' => 'required|boolean', 'sync_primary_port' => 'required|boolean',
        ]);
        $server = $this->findServer($request->input('server_type'), (int)$request->input('server_id'));
        $syncService = new EntrySyncService();
        if ($request->boolean('sync_primary_port') && !$syncService->validPort($server['port'] ?? null)) {
            abort(422, '节点当前使用端口范围，入口池只支持单端口，无法开启端口同步');
        }
        $now = time();
        $settingWhere = ['server_type' => $request->input('server_type'), 'server_id' => (int)$request->input('server_id')];
        $imported = false;
        DB::transaction(function () use ($request, $server, $settingWhere, $now, $syncService, &$imported) {
            DB::table('v2_node_entry_setting')->updateOrInsert($settingWhere,
                ['delivery_mode' => $request->input('delivery_mode'), 'client_visibility_mode' => $request->input('client_visibility_mode'),
                    'sync_primary_host' => $request->boolean('sync_primary_host'),
                    'sync_primary_port' => $request->boolean('sync_primary_port'),
                    'check_url' => $request->input('check_url'),
                    'check_interval' => (int)$request->input('check_interval'), 'created_at' => $now, 'updated_at' => $now]
            );
            $imported = $this->importOriginalEntryIfEmpty($server, $settingWhere, $now);
            $syncService->syncServerToPrimary($settingWhere['server_type'], $settingWhere['server_id'], $server);
        });
        $this->adminLog($request, 'entry_setting.save', 'node', $request->input('server_id'), $request->only('server_type', 'delivery_mode', 'client_visibility_mode', 'check_interval', 'sync_primary_host', 'sync_primary_port'));
        return response(['data' => ['saved' => true, 'original_entry_imported' => $imported]]);
    }

    public function saveEntry(Request $request)
    {
        $request->validate([
            'id' => 'nullable|integer', 'server_type' => 'required|string|max:32', 'server_id' => 'required|integer|min:1',
            'name' => 'required|string|max:96', 'host' => 'required|string|max:255', 'port' => 'required|integer|min:1|max:65535',
            'priority' => 'required|integer|min:1|max:10000', 'is_primary' => 'required|boolean', 'enabled' => 'required|boolean',
        ]);
        $server = $this->findServer($request->input('server_type'), (int)$request->input('server_id'));
        $where = ['id' => (int)$request->input('id'),
            'server_type' => $request->input('server_type'), 'server_id' => (int)$request->input('server_id')];
        if ($request->filled('id') && !DB::table('v2_node_entry_pool')->where($where)->exists()) abort(404, '入口不存在');
        $now = time();
        $payload = [
            'server_type' => $request->input('server_type'), 'server_id' => (int)$request->input('server_id'),
            'name' => $request->input('name'), 'host_encrypted' => Crypt::encryptString($request->input('host')),
            'host_hash' => hash('sha256', strtolower($request->input('host'))), 'port' => (int)$request->input('port'),
            'priority' => (int)$request->input('priority'), 'is_primary' => $request->boolean('is_primary'),
            'enabled' => $request->boolean('enabled'), 'updated_at' => $now,
        ];
        if (!$request->filled('id') && !DB::table('v2_node_entry_pool')->where('server_type', $payload['server_type'])->where('server_id', $payload['server_id'])->exists()) {
            $originalHost = trim((string)($server['host'] ?? ''));
            $originalPort = (string)($server['port'] ?? '');
            if ($originalHost !== '' && ctype_digit($originalPort) && hash('sha256', strtolower($originalHost)) === $payload['host_hash'] && (int)$originalPort === $payload['port']) {
                $payload['is_primary'] = true;
            }
        }
        DB::transaction(function () use ($request, $where, $payload, $server, $now) {
            $settingWhere = ['server_type' => $payload['server_type'], 'server_id' => $payload['server_id']];
            if (!DB::table('v2_node_entry_setting')->where($settingWhere)->exists()) {
                DB::table('v2_node_entry_setting')->insert($settingWhere + [
                    'delivery_mode' => 'primary_only', 'check_url' => 'http://www.gstatic.com/generate_204',
                    'check_interval' => 60, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            if (!$request->filled('id')) {
                $this->importOriginalEntryIfEmpty($server, $settingWhere, $now, $payload['host_hash'], $payload['port']);
            }
            if ($payload['is_primary']) DB::table('v2_node_entry_pool')->where('server_type', $payload['server_type'])->where('server_id', $payload['server_id'])->update(['is_primary' => 0, 'updated_at' => $now]);
            if ($request->filled('id')) DB::table('v2_node_entry_pool')->where($where)->update($payload);
            else DB::table('v2_node_entry_pool')->insert($payload + ['health_status' => 'waiting', 'created_at' => $now]);
            if ($payload['is_primary']) (new EntrySyncService())->syncPrimaryToServer($payload['server_type'], $payload['server_id']);
        });
        $this->adminLog($request, 'entry.save', 'node_entry', $request->input('id'), ['server_type' => $payload['server_type'], 'server_id' => $payload['server_id'], 'host_hash' => $payload['host_hash']]);
        return response(['data' => true]);
    }

    public function deleteEntry(Request $request)
    {
        $request->validate(['id' => 'required|integer']);
        $entry = DB::table('v2_node_entry_pool')->where('id', $request->input('id'))->first();
        if (!$entry) abort(404, '入口不存在');
        DB::table('v2_node_entry_pool')->where('id', $entry->id)->delete();
        $this->adminLog($request, 'entry.delete', 'node_entry', $entry->id, ['server_type' => $entry->server_type, 'server_id' => $entry->server_id, 'host_hash' => $entry->host_hash]);
        return response(['data' => true]);
    }

    public function saveEntryClientPolicy(Request $request)
    {
        $request->validate([
            'id' => 'nullable|integer', 'server_type' => 'required|string|max:32',
            'server_id' => 'required|integer|min:1', 'client_family' => 'required|string|max:64',
            'client_platform' => 'nullable|string|max:24', 'user_agent' => 'nullable|string|max:512',
            'min_version' => 'nullable|string|max:32',
            'max_version' => 'nullable|string|max:32',
            'delivery_mode' => 'required|in:primary_only,manual_backup,auto_fallback',
            'visibility' => 'required|in:show,hide',
            'check_url' => 'required|url|max:255', 'check_interval' => 'required|integer|min:30|max:86400',
            'priority' => 'required|integer|min:1|max:10000', 'enabled' => 'required|boolean',
        ]);
        $minVersion = trim((string)$request->input('min_version'));
        $maxVersion = trim((string)$request->input('max_version'));
        if ($minVersion !== '' && $maxVersion !== '' && version_compare($minVersion, $maxVersion, '>')) {
            abort(422, '最低版本不能高于最高版本');
        }
        $this->ensureServerExists($request->input('server_type'), (int)$request->input('server_id'));
        $where = ['id' => (int)$request->input('id'),
            'server_type' => $request->input('server_type'), 'server_id' => (int)$request->input('server_id')];
        if ($request->filled('id') && !DB::table('v2_node_entry_client_policy')->where($where)->exists()) abort(404, '客户端规则不存在');
        $now = time();
        $payload = [
            'server_type' => $request->input('server_type'), 'server_id' => (int)$request->input('server_id'),
            'client_family' => trim($request->input('client_family')),
            'client_platform' => trim((string)$request->input('client_platform')) ?: null,
            'user_agent' => trim((string)$request->input('user_agent')) ?: null,
            'min_version' => $minVersion ?: null, 'max_version' => $maxVersion ?: null,
            'delivery_mode' => $request->input('delivery_mode'), 'visibility' => $request->input('visibility'),
            'check_url' => $request->input('check_url'),
            'check_interval' => (int)$request->input('check_interval'), 'priority' => (int)$request->input('priority'),
            'enabled' => $request->boolean('enabled'), 'updated_at' => $now,
        ];
        if ($request->filled('id')) DB::table('v2_node_entry_client_policy')->where($where)->update($payload);
        else DB::table('v2_node_entry_client_policy')->insert($payload + ['created_at' => $now]);
        $this->adminLog($request, 'entry_client_policy.save', 'node', $request->input('server_id'), [
            'server_type' => $payload['server_type'], 'client_family' => $payload['client_family'],
            'client_platform' => $payload['client_platform'], 'user_agent' => $payload['user_agent'],
            'delivery_mode' => $payload['delivery_mode'],
            'visibility' => $payload['visibility'],
        ]);
        return response(['data' => true]);
    }

    public function deleteEntryClientPolicy(Request $request)
    {
        $request->validate(['id' => 'required|integer']);
        $policy = DB::table('v2_node_entry_client_policy')->where('id', $request->input('id'))->first();
        if (!$policy) abort(404, '客户端规则不存在');
        DB::table('v2_node_entry_client_policy')->where('id', $policy->id)->delete();
        $this->adminLog($request, 'entry_client_policy.delete', 'node', $policy->server_id, [
            'server_type' => $policy->server_type, 'client_family' => $policy->client_family,
        ]);
        return response(['data' => true]);
    }

    private function ensureServerExists(string $type, int $id): void
    {
        $this->findServer($type, $id);
    }

    private function findServer(string $type, int $id): array
    {
        $server = collect((new \App\Services\ServerService())->getAllServers())->first(function ($server) use ($type, $id) {
            return ($server['type'] ?? '') === $type && (int)($server['id'] ?? 0) === $id;
        });
        if (!$server) abort(422, '节点不存在');
        return $server;
    }

    private function importOriginalEntryIfEmpty(array $server, array $where, int $now, ?string $candidateHash = null, ?int $candidatePort = null): bool
    {
        if (DB::table('v2_node_entry_pool')->where($where)->exists()) return false;
        $host = trim((string)($server['host'] ?? ''));
        $port = (string)($server['port'] ?? '');
        if ($host === '' || !ctype_digit($port) || (int)$port < 1 || (int)$port > 65535) return false;
        $hostHash = hash('sha256', strtolower($host));
        if ($candidateHash === $hostHash && $candidatePort === (int)$port) return false;
        DB::table('v2_node_entry_pool')->insert($where + [
            'name' => '原始主入口', 'host_encrypted' => Crypt::encryptString($host),
            'host_hash' => $hostHash, 'port' => (int)$port, 'priority' => 1,
            'is_primary' => 1, 'enabled' => 1, 'health_status' => 'waiting',
            'created_at' => $now, 'updated_at' => $now,
        ]);
        return true;
    }

    private function formatServerAddress(string $host, string $port): string
    {
        if ($host === '') return '-';
        if (strpos($host, ':') !== false && substr($host, 0, 1) !== '[') $host = '[' . $host . ']';
        return $port === '' ? $host : $host . ':' . $port;
    }

    private function perPage(Request $request): int
    {
        return max(10, min(100, (int)$request->input('per_page', 25)));
    }

    private function adminLog(Request $request, string $action, ?string $targetType, $targetId, array $payload): void
    {
        DB::table('v2_security_admin_log')->insert([
            'admin_id' => $request->user['id'], 'action' => $action, 'target_type' => $targetType,
            'target_id' => $targetId === null ? null : (string)$targetId,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE), 'request_ip' => $request->ip(), 'created_at' => time(),
        ]);
    }
}
