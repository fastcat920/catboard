<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class SnapshotService
{
    public function capture(array $servers): array
    {
        $ids = [];
        foreach ($servers as $server) {
            if (empty($server['type']) || empty($server['id'])) continue;
            $host = (string)($server['host'] ?? '');
            $port = (string)($server['port'] ?? '');
            $safe = $server;
            foreach (['last_check_at', 'is_online', 'cache_key'] as $volatile) unset($safe[$volatile]);
            ksort($safe);
            $configHash = hash('sha256', json_encode($safe));
            $version = hash('sha256', $server['type'] . ':' . $server['id'] . ':' . $configHash);
            $now = time();
            DB::table('v2_node_snapshot')->insertOrIgnore([
                'version' => $version,
                'server_type' => $server['type'],
                'server_id' => (int)$server['id'],
                'watermark_group_id' => $server['_watermark_group_id'] ?? null,
                'server_name' => mb_substr((string)($server['name'] ?? ''), 0, 255),
                'host_hash' => hash('sha256', $host),
                'host_encrypted' => $host === '' ? null : Crypt::encryptString($host),
                'port' => mb_substr($port, 0, 32),
                'config_hash' => $configHash,
                'published_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $ids[] = (int)DB::table('v2_node_snapshot')->where('version', $version)->value('id');
        }
        sort($ids);
        return $ids;
    }
}
