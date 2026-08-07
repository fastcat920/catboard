<?php

namespace App\Services\NodeSecurity;

use App\Services\ServerService;
use Illuminate\Support\Facades\DB;

class ProbeService
{
    public function tasks(): array
    {
        $settings = (new SettingsService())->all();
        $interval = max(30, (int)($settings['probe_interval_seconds'] ?? 300));
        $timeout = max(1, min(10, (int)($settings['health_timeout_seconds'] ?? 3)));
        $tasks = [];
        foreach ((new ServerService())->getAllServers() as $server) {
            if (empty($server['show']) || empty($server['host']) || empty($server['port'])) continue;
            if (in_array($server['type'], ['tuic', 'hysteria'], true)) continue;
            if ($server['type'] === 'v2node' && in_array($server['protocol'] ?? '', ['tuic', 'hysteria'], true)) continue;
            $port = (string)$server['port'];
            if (strpos($port, '-') !== false || !ctype_digit($port)) continue;
            $snapshot = DB::table('v2_node_snapshot')->where('server_type', $server['type'])
                ->where('server_id', $server['id'])->whereNull('watermark_group_id')->orderByDesc('published_at')->first();
            $tasks[] = [
                'task_id' => hash('sha256', $server['type'] . ':' . $server['id'] . ':' . ($snapshot->id ?? 0)),
                'server_type' => $server['type'], 'server_id' => (int)$server['id'],
                'snapshot_id' => $snapshot->id ?? null, 'host' => $server['host'], 'port' => (int)$port,
                'check_type' => 'tcp', 'timeout_seconds' => $timeout, 'interval_seconds' => $interval,
            ];
        }
        return $tasks;
    }

    public function storeResults($probe, array $results): int
    {
        $now = time(); $rows = [];
        foreach (array_slice($results, 0, 500) as $result) {
            if (empty($result['server_type']) || empty($result['server_id'])) continue;
            $checkedAt = (int)($result['checked_at'] ?? 0);
            if (!$checkedAt || abs($now - $checkedAt) > 600) continue;
            $rows[] = [
                'probe_id' => $probe->id, 'probe_region' => $probe->region, 'probe_carrier' => $probe->carrier,
                'server_type' => mb_substr($result['server_type'], 0, 32), 'server_id' => (int)$result['server_id'],
                'snapshot_id' => $result['snapshot_id'] ?? null, 'success' => !empty($result['success']),
                'latency_ms' => isset($result['latency_ms']) ? max(0, (int)$result['latency_ms']) : null,
                'error_code' => mb_substr((string)($result['error_code'] ?? ''), 0, 64) ?: null,
                'checked_at' => $checkedAt, 'created_at' => $now,
            ];
        }
        if ($rows) DB::table('v2_security_probe_result')->insert($rows);
        return count($rows);
    }
}
