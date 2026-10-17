<?php

namespace App\Services\NodeSecurity;

use App\Jobs\AnalyzeProbeTargetsJob;
use App\Services\ServerService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

class ProbeService
{
    public function tasks(): array
    {
        $settings = (new SettingsService())->all();
        $interval = max(30, (int)($settings['probe_interval_seconds'] ?? 300));
        $timeout = max(1, min(10, (int)($settings['health_timeout_seconds'] ?? 3)));
        try {
            $targets = DB::table('v2_security_probe_target')->where('status', 'active')->get()
                ->mapWithKeys(function ($target) {
                    return [$target->server_type . ':' . $target->server_id => true];
                });
        } catch (\Throwable $e) {
            return [];
        }
        $tasks = [];
        $allServers = (new ServerService())->getAllServers();
        foreach ($allServers as $server) {
            if (!$targets->has($server['type'] . ':' . $server['id'])) continue;
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
        try {
            $entryCompatible = collect($allServers)->reject(function ($server) {
                if (in_array($server['type'] ?? '', ['tuic', 'hysteria'], true)) return true;
                return ($server['type'] ?? '') === 'v2node' && in_array($server['protocol'] ?? '', ['tuic', 'hysteria', 'hysteria2'], true);
            })->mapWithKeys(function ($server) { return [$server['type'] . ':' . $server['id'] => true]; });
            foreach (DB::table('v2_node_entry_pool')->where('enabled', 1)->get() as $entry) {
                if (!$entryCompatible->has($entry->server_type . ':' . $entry->server_id)) continue;
                try { $host = Crypt::decryptString($entry->host_encrypted); } catch (\Throwable $e) { continue; }
                $tasks[] = [
                    'task_id' => hash('sha256', 'entry:' . $entry->id . ':' . $entry->updated_at),
                    'server_type' => 'entry', 'server_id' => (int)$entry->id, 'snapshot_id' => null,
                    'host' => $host, 'port' => (int)$entry->port, 'check_type' => 'tcp',
                    'timeout_seconds' => $timeout, 'interval_seconds' => $interval,
                ];
            }
        } catch (\Throwable $e) {
            // Entry-pool migration is optional during rolling upgrades.
        }
        return $tasks;
    }

    public function storeResults($probe, array $results): int
    {
        $settings = (new SettingsService())->all();
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
        if ($rows) {
            DB::table('v2_security_probe_result')->insert($rows);
            $entryIds = collect($rows)->where('server_type', 'entry')->pluck('server_id')->unique()->values();
            foreach ($entryIds as $entryId) $this->analyzeEntry((int)$entryId, $settings);
            $targets = collect($rows)->map(function ($row) {
                return ['server_type' => $row['server_type'], 'server_id' => $row['server_id']];
            })->reject(function ($target) { return $target['server_type'] === 'entry'; })->unique(function ($target) {
                return $target['server_type'] . ':' . $target['server_id'];
            })->sortBy(function ($target) {
                return $target['server_type'] . ':' . $target['server_id'];
            })->values()->all();
            if ($targets) {
                $dedupeKey = 'node_security_probe_dispatch:' . hash('sha256', json_encode($targets));
                if (Cache::add($dedupeKey, 1, 15)) {
                    AnalyzeProbeTargetsJob::dispatch($targets, $dedupeKey)->delay(now()->addSeconds(5));
                }
            }
        }
        return count($rows);
    }

    private function analyzeEntry(int $entryId, array $settings): void
    {
        $window = max(60, (int)($settings['probe_result_window_seconds'] ?? 600));
        $latest = DB::table('v2_security_probe_result as r')->join(DB::raw('(SELECT probe_id, MAX(id) id FROM v2_security_probe_result WHERE server_type = \'entry\' AND server_id = ' . $entryId . ' AND checked_at >= ' . (time() - $window) . ' GROUP BY probe_id) latest'), 'latest.id', '=', 'r.id')
            ->select('r.probe_region', 'r.success')->get();
        $domestic = $latest->filter(function ($row) { return strtoupper((string)$row->probe_region) === 'CN'; });
        $overseas = $latest->filter(function ($row) { return strtoupper((string)$row->probe_region) !== 'CN'; });
        $domesticOk = $domestic->where('success', 1)->count();
        $overseasOk = $overseas->where('success', 1)->count();
        if (!$domestic->count() || !$overseas->count()) $status = 'insufficient_probes';
        elseif ($domesticOk && $overseasOk) $status = 'healthy';
        elseif (!$domesticOk && $overseasOk) $status = 'domestic_blocked';
        elseif ($domesticOk && !$overseasOk) $status = 'overseas_blocked';
        else $status = 'unreachable';
        $lastChecked = $latest->count() ? time() : null;
        DB::table('v2_node_entry_pool')->where('id', $entryId)->update([
            'health_status' => $status, 'last_checked_at' => $lastChecked,
            'last_healthy_at' => $status === 'healthy' ? time() : DB::raw('last_healthy_at'),
        ]);
    }
}
