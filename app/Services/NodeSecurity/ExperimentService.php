<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class ExperimentService
{
    public function create(array $data, int $adminId): int
    {
        return DB::transaction(function () use ($data, $adminId) {
            $now = time();
            $experimentId = DB::table('v2_watermark_experiment')->insertGetId([
                'name' => mb_substr($data['name'], 0, 255),
                'status' => $data['status'] ?? 'draft',
                'parent_id' => $data['parent_id'] ?? null,
                'round' => max(1, (int)($data['round'] ?? 1)),
                'created_by' => $adminId,
                'notes' => $data['notes'] ?? null,
                'started_at' => ($data['status'] ?? 'draft') === 'active' ? $now : null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $userIds = array_values(array_unique(array_filter(array_map('intval', $data['user_ids'] ?? []))));
            sort($userIds);
            $groups = $data['groups'] ?? [];
            if (!$groups) throw new \InvalidArgumentException('至少需要一个水印组');
            foreach ($groups as $index => $group) {
                $host = trim((string)($group['host'] ?? ''));
                $groupId = DB::table('v2_watermark_group')->insertGetId([
                    'experiment_id' => $experimentId,
                    'name' => mb_substr((string)($group['name'] ?? 'Group ' . ($index + 1)), 0, 64),
                    'is_control' => !empty($group['is_control']),
                    'server_type' => $group['server_type'] ?? null,
                    'server_id' => $group['server_id'] ?? null,
                    'watermark_host_encrypted' => $host === '' ? null : Crypt::encryptString($host),
                    'watermark_host_hash' => $host === '' ? null : hash('sha256', $host),
                    'watermark_port' => $group['port'] ?? null,
                    'status' => 'active', 'failure_count' => 0,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                foreach ($userIds as $userId) {
                    // Deterministic assignment keeps users in the same cohort across retries.
                    $position = $this->groupIndex($experimentId, $userId, count($groups));
                    if ($position !== $index) continue;
                    DB::table('v2_watermark_group_user')->insert([
                        'group_id' => $groupId, 'user_id' => $userId, 'assigned_at' => $now,
                    ]);
                }
            }
            return $experimentId;
        });
    }

    public function groupIndex(int $experimentId, int $userId, int $groupCount): int
    {
        if ($groupCount < 1) throw new \InvalidArgumentException('分组数量必须大于零');
        return hexdec(substr(hash('sha256', $experimentId . ':' . $userId), 0, 8)) % $groupCount;
    }

    public function split(int $groupId, array $data, int $adminId): int
    {
        $source = DB::table('v2_watermark_group')->where('id', $groupId)->first();
        if (!$source) throw new \InvalidArgumentException('水印组不存在');
        $data['parent_id'] = $source->experiment_id;
        $data['round'] = (int)DB::table('v2_watermark_experiment')->where('id', $source->experiment_id)->value('round') + 1;
        $data['user_ids'] = DB::table('v2_watermark_group_user')->where('group_id', $groupId)->pluck('user_id')->all();
        return $this->create($data, $adminId);
    }
}
