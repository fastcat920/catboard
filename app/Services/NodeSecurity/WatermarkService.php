<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class WatermarkService
{
    public function apply(int $userId, array $servers): array
    {
        $groups = DB::table('v2_watermark_group_user as gu')
            ->join('v2_watermark_group as g', 'g.id', '=', 'gu.group_id')
            ->join('v2_watermark_experiment as e', 'e.id', '=', 'g.experiment_id')
            ->where('gu.user_id', $userId)
            ->where('g.status', 'active')
            ->where('e.status', 'active')
            ->select('g.*')->orderBy('e.id')->get();

        foreach ($groups as $group) {
            if ($group->is_control || !$group->watermark_host_encrypted) continue;
            $host = Crypt::decryptString($group->watermark_host_encrypted);
            foreach ($servers as &$server) {
                if ($server['type'] === $group->server_type && (int)$server['id'] === (int)$group->server_id) {
                    $server['host'] = $host;
                    if ($group->watermark_port) $server['port'] = $group->watermark_port;
                    $server['cache_key'] = hash('sha256', ($server['cache_key'] ?? '') . ':wm:' . $group->id);
                    $server['_watermark_group_id'] = (int)$group->id;
                }
            }
            unset($server);
        }
        return $servers;
    }
}
