<?php

namespace App\Services;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class NodeEntryPoolService
{
    public function expand(array $servers): array
    {
        try {
            $settings = DB::table('v2_node_entry_setting')->get()->keyBy(function ($row) {
                return $row->server_type . ':' . $row->server_id;
            });
            $entries = DB::table('v2_node_entry_pool')->where('enabled', 1)
                ->orderBy('priority')->orderBy('id')->get()->groupBy(function ($row) {
                    return $row->server_type . ':' . $row->server_id;
                });
        } catch (\Throwable $e) {
            return $servers;
        }

        $expanded = [];
        foreach ($servers as $server) {
            $key = ($server['type'] ?? '') . ':' . ($server['id'] ?? '');
            $setting = $settings->get($key);
            $pool = $entries->get($key, collect());
            if (!$setting || $pool->isEmpty()) {
                $expanded[] = $server;
                continue;
            }
            $mode = in_array($setting->delivery_mode, ['primary_only', 'manual_backup', 'auto_fallback'], true)
                ? $setting->delivery_mode : 'primary_only';
            $selected = $mode === 'primary_only'
                ? $pool->sortByDesc('is_primary')->take(1)
                : $pool;
            foreach ($selected as $index => $entry) {
                try { $host = Crypt::decryptString($entry->host_encrypted); } catch (\Throwable $e) { continue; }
                $copy = $server;
                $copy['host'] = $host;
                $copy['port'] = (int)$entry->port;
                $copy['_entry_id'] = (int)$entry->id;
                $copy['_entry_mode'] = $mode;
                $copy['_entry_logical_name'] = $server['name'];
                $copy['_entry_logical_key'] = $key;
                $copy['_entry_check_url'] = $setting->check_url;
                $copy['_entry_check_interval'] = (int)$setting->check_interval;
                if ($mode !== 'primary_only') {
                    $copy['name'] = $server['name'] . '｜' . ($entry->is_primary ? '主入口' : $entry->name);
                }
                $copy['cache_key'] = ($copy['cache_key'] ?? $key) . '-entry-' . $entry->id . '-' . $entry->updated_at;
                $expanded[] = $copy;
            }
        }
        return $expanded;
    }

    public static function applyClashFallbackGroups(array &$config, array $servers): void
    {
        $logical = [];
        foreach ($servers as $server) {
            if (($server['_entry_mode'] ?? '') !== 'auto_fallback') continue;
            $key = $server['_entry_logical_key'];
            if (!isset($logical[$key])) $logical[$key] = [
                'name' => $server['_entry_logical_name'], 'proxies' => [],
                'url' => $server['_entry_check_url'], 'interval' => $server['_entry_check_interval'],
            ];
            $logical[$key]['proxies'][] = $server['name'];
        }
        foreach ($logical as $group) {
            if (count($group['proxies']) < 2) continue;
            foreach ($config['proxy-groups'] as &$existing) {
                if (!isset($existing['proxies']) || !is_array($existing['proxies'])) continue;
                $matched = array_intersect($existing['proxies'], $group['proxies']);
                if (!$matched) continue;
                $existing['proxies'] = array_values(array_diff($existing['proxies'], $group['proxies']));
                if (!in_array($group['name'], $existing['proxies'], true)) $existing['proxies'][] = $group['name'];
            }
            unset($existing);
            $config['proxy-groups'][] = [
                'name' => $group['name'], 'type' => 'fallback', 'proxies' => array_values($group['proxies']),
                'url' => $group['url'], 'interval' => max(30, $group['interval']),
            ];
        }
    }
}
