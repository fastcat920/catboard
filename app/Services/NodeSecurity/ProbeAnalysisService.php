<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\DB;

class ProbeAnalysisService
{
    public function analyze(): int
    {
        $settings = (new SettingsService())->all();
        $threshold = max(2, (int)($settings['probe_failures_to_event'] ?? 3));
        $since = time() - max(180, (int)($settings['probe_result_window_seconds'] ?? 600));
        $targets = DB::table('v2_security_probe_result as r')
            ->join('v2_security_probe as p', 'p.id', '=', 'r.probe_id')
            ->where('p.status', 'active')->where('r.checked_at', '>=', $since)
            ->select('r.server_type', 'r.server_id')->distinct()->get();
        foreach ($targets as $target) $this->analyzeTarget($target->server_type, $target->server_id, $since, $threshold);
        DB::table('v2_security_probe_result')->where('checked_at', '<', time() - 7 * 86400)->delete();
        return count($targets);
    }

    private function analyzeTarget(string $type, int $id, int $since, int $threshold): void
    {
        $latest = DB::table('v2_security_probe_result as r')
            ->join('v2_security_probe as p', 'p.id', '=', 'r.probe_id')
            ->where('p.status', 'active')->where('r.checked_at', '>=', $since)
            ->where('r.server_type', $type)->where('r.server_id', $id)
            ->select('r.*')->orderByDesc('r.checked_at')->get()
            ->unique('probe_id')->values();
        $latestCheckedAt = (int)$latest->max('checked_at');
        $existing = DB::table('v2_security_node_state')->where('server_type', $type)->where('server_id', $id)->first();
        if ($existing && $latestCheckedAt <= (int)$existing->last_checked_at) return;
        $domesticOk = $domesticFailed = $overseasOk = $overseasFailed = 0;
        foreach ($latest as $row) {
            $domestic = strtoupper($row->probe_region) === 'CN';
            if ($domestic && $row->success) $domesticOk++;
            elseif ($domestic) $domesticFailed++;
            elseif ($row->success) $overseasOk++;
            else $overseasFailed++;
        }
        $status = 'healthy';
        if (($domesticOk + $domesticFailed) < 1 || ($overseasOk + $overseasFailed) < 1) $status = 'insufficient_probes';
        elseif ($domesticFailed >= 2 && $overseasOk >= 1) $status = 'suspected_blocked';
        elseif ($domesticFailed >= 1 && $overseasFailed >= 1 && !$domesticOk && !$overseasOk) $status = 'suspected_outage';
        elseif ($domesticFailed === 1 && $domesticOk >= 1) $status = 'carrier_issue';
        $actionable = in_array($status, ['suspected_blocked', 'suspected_outage', 'carrier_issue'], true);
        $failure = $actionable ? (int)($existing->consecutive_failures ?? 0) + 1 : 0;
        $success = $status === 'healthy' ? (int)($existing->consecutive_successes ?? 0) + 1 : 0;
        $activeEventId = $existing->active_event_id ?? null;
        if ($failure >= $threshold && !$activeEventId) $activeEventId = $this->createEvent($type, $id, $status, compact('domesticOk', 'domesticFailed', 'overseasOk', 'overseasFailed'));
        if ($success >= 3 && $activeEventId) {
            DB::table('v2_node_block_event')->where('id', $activeEventId)->where('status', 'suspected')->update(['status' => 'resolved', 'updated_at' => time()]);
            $activeEventId = null;
        }
        $now = time();
        DB::table('v2_security_node_state')->updateOrInsert(['server_type' => $type, 'server_id' => $id], [
            'status' => $status, 'consecutive_failures' => $failure, 'consecutive_successes' => $success,
            'domestic_ok' => $domesticOk, 'domestic_failed' => $domesticFailed,
            'overseas_ok' => $overseasOk, 'overseas_failed' => $overseasFailed,
            'active_event_id' => $activeEventId, 'last_checked_at' => $latestCheckedAt,
            'last_changed_at' => (!$existing || $existing->status !== $status) ? $now : ($existing->last_changed_at ?? $now),
            'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    private function createEvent(string $type, int $id, string $state, array $evidence): int
    {
        $now = time();
        $snapshot = DB::table('v2_node_snapshot')->where('server_type', $type)->where('server_id', $id)
            ->whereNull('watermark_group_id')->orderByDesc('published_at')->first();
        $eventType = $state === 'suspected_blocked' ? 'blocked' : ($state === 'suspected_outage' ? 'outage' : 'carrier');
        $eventId = DB::table('v2_node_block_event')->insertGetId([
            'server_type' => $type, 'server_id' => $id, 'snapshot_id' => $snapshot->id ?? null,
            'event_type' => $eventType, 'status' => 'suspected', 'first_failed_at' => $now,
            'evidence' => json_encode(array_merge(['source' => 'private_probe'], $evidence)),
            'remark' => '私有探测点连续异常，等待管理员核实', 'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('v2_security_alert')->insert([
            'type' => 'private_probe_' . $state, 'severity' => $state === 'suspected_blocked' ? 'critical' : 'warning',
            'title' => $state === 'suspected_blocked' ? '多地区探测疑似节点封锁' : '多地区探测发现节点异常',
            'payload' => json_encode($evidence), 'event_id' => $eventId, 'created_at' => $now,
        ]);
        return $eventId;
    }
}
