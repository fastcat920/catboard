<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\DB;

class ProbeAnalysisService
{
    public function analyze(): int
    {
        $settings = (new SettingsService())->all();
        $threshold = max(1, (int)($settings['probe_failures_to_event'] ?? 3));
        $rules = [
            'domestic_min_success' => max(1, (int)($settings['probe_domestic_min_success'] ?? 1)),
            'overseas_min_success' => max(1, (int)($settings['probe_overseas_min_success'] ?? 1)),
            'domestic_success_ratio' => max(1, min(100, (int)($settings['probe_domestic_success_ratio'] ?? 50))),
            'overseas_success_ratio' => max(1, min(100, (int)($settings['probe_overseas_success_ratio'] ?? 50))),
            'recovery_success_rounds' => max(1, (int)($settings['probe_recovery_success_rounds'] ?? 1)),
            'auto_create_event' => !empty($settings['auto_create_event']),
        ];
        $since = time() - max(180, (int)($settings['probe_result_window_seconds'] ?? 600));
        $targets = DB::table('v2_security_probe_result as r')
            ->join('v2_security_probe as p', 'p.id', '=', 'r.probe_id')
            ->join('v2_security_probe_target as t', function ($join) {
                $join->on('t.server_type', '=', 'r.server_type')->on('t.server_id', '=', 'r.server_id');
            })
            ->where('p.status', 'active')->where('t.status', 'active')->where('r.checked_at', '>=', $since)
            ->select('r.server_type', 'r.server_id')->distinct()->get();
        foreach ($targets as $target) $this->analyzeTarget($target->server_type, $target->server_id, $since, $threshold, $rules);
        DB::table('v2_security_probe_result')->where('checked_at', '<', time() - 7 * 86400)->delete();
        return count($targets);
    }

    private function analyzeTarget(string $type, int $id, int $since, int $threshold, array $rules): void
    {
        $latest = DB::table('v2_security_probe_result as r')
            ->join('v2_security_probe as p', 'p.id', '=', 'r.probe_id')
            ->join('v2_security_probe_target as t', function ($join) {
                $join->on('t.server_type', '=', 'r.server_type')->on('t.server_id', '=', 'r.server_id');
            })
            ->where('p.status', 'active')->where('t.status', 'active')->where('r.checked_at', '>=', $since)
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
        $domesticTotal = $domesticOk + $domesticFailed;
        $overseasTotal = $overseasOk + $overseasFailed;
        $domesticRatio = $domesticTotal > 0 ? round($domesticOk * 100 / $domesticTotal, 2) : 0;
        $overseasRatio = $overseasTotal > 0 ? round($overseasOk * 100 / $overseasTotal, 2) : 0;
        $domesticPass = $domesticTotal > 0
            && $domesticOk >= $rules['domestic_min_success']
            && $domesticRatio >= $rules['domestic_success_ratio'];
        $overseasPass = $overseasTotal > 0
            && $overseasOk >= $rules['overseas_min_success']
            && $overseasRatio >= $rules['overseas_success_ratio'];

        if ($domesticTotal < 1 || $overseasTotal < 1) $candidateStatus = 'insufficient_probes';
        elseif ($domesticPass && $overseasPass) $candidateStatus = 'healthy';
        elseif ($domesticOk === 0 && $overseasPass) $candidateStatus = 'suspected_domestic_blocked';
        elseif ($overseasOk === 0 && $domesticPass) $candidateStatus = 'suspected_overseas_blocked';
        elseif ($domesticOk === 0 && $overseasOk === 0) $candidateStatus = 'suspected_outage';
        else $candidateStatus = 'carrier_issue';

        $success = $candidateStatus === 'healthy' ? (int)($existing->consecutive_successes ?? 0) + 1 : 0;
        $status = $candidateStatus;
        if ($candidateStatus === 'healthy' && $success < $rules['recovery_success_rounds'] && $existing
            && in_array($existing->status, $this->actionableStatuses(), true)) {
            $status = $existing->status;
        }
        $actionable = in_array($candidateStatus, $this->actionableStatuses(), true);
        $sameFailure = $existing && $existing->status === $candidateStatus;
        $failure = $actionable ? ($sameFailure ? (int)($existing->consecutive_failures ?? 0) + 1 : 1) : 0;
        $failureStartedAt = $actionable
            ? ($sameFailure && (int)($existing->consecutive_failures ?? 0) > 0 && !empty($existing->failure_started_at)
                ? (int)$existing->failure_started_at
                : $latestCheckedAt)
            : null;
        $activeEventId = $existing->active_event_id ?? null;
        $firstHealthyAt = (int)($existing->first_healthy_at ?? 0) ?: null;
        if ($status === 'healthy' && !$firstHealthyAt) $firstHealthyAt = $latestCheckedAt;
        if ($rules['auto_create_event'] && $firstHealthyAt && $failure >= $threshold && !$activeEventId) {
            $activeEventId = $this->createEvent(
                $type, $id, $status, $failureStartedAt, $latestCheckedAt, $failure, $firstHealthyAt,
                array_merge(compact('domesticOk', 'domesticFailed', 'overseasOk', 'overseasFailed', 'domesticRatio', 'overseasRatio'), [
                    'domestic_min_success' => $rules['domestic_min_success'],
                    'overseas_min_success' => $rules['overseas_min_success'],
                    'domestic_success_ratio' => $rules['domestic_success_ratio'],
                    'overseas_success_ratio' => $rules['overseas_success_ratio'],
                ])
            );
        }
        if ($candidateStatus === 'healthy' && $success >= $rules['recovery_success_rounds'] && $activeEventId) {
            DB::table('v2_node_block_event')->where('id', $activeEventId)->where('status', 'suspected')->update(['status' => 'resolved', 'updated_at' => time()]);
            $activeEventId = null;
        }
        $now = time();
        DB::table('v2_security_node_state')->updateOrInsert(['server_type' => $type, 'server_id' => $id], [
            'status' => $status, 'consecutive_failures' => $failure, 'consecutive_successes' => $success,
            'failure_started_at' => $failureStartedAt, 'first_healthy_at' => $firstHealthyAt,
            'domestic_ok' => $domesticOk, 'domestic_failed' => $domesticFailed,
            'overseas_ok' => $overseasOk, 'overseas_failed' => $overseasFailed,
            'active_event_id' => $activeEventId, 'last_checked_at' => $latestCheckedAt,
            'last_changed_at' => (!$existing || $existing->status !== $status) ? $now : ($existing->last_changed_at ?? $now),
            'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    private function actionableStatuses(): array
    {
        return ['suspected_domestic_blocked', 'suspected_overseas_blocked', 'suspected_blocked', 'suspected_outage', 'carrier_issue'];
    }

    private function createEvent(string $type, int $id, string $state, int $firstFailedAt, int $detectedAt, int $failureRounds, int $firstHealthyAt, array $evidence): int
    {
        $now = time();
        $snapshot = DB::table('v2_node_snapshot')->where('server_type', $type)->where('server_id', $id)
            ->whereNull('watermark_group_id')->orderByDesc('published_at')->first();
        $blocked = in_array($state, ['suspected_domestic_blocked', 'suspected_overseas_blocked'], true);
        $eventType = $blocked ? 'blocked' : ($state === 'suspected_outage' ? 'outage' : 'carrier');
        $eventId = DB::table('v2_node_block_event')->insertGetId([
            'server_type' => $type, 'server_id' => $id, 'snapshot_id' => $snapshot->id ?? null,
            'event_type' => $eventType, 'status' => 'suspected', 'first_failed_at' => $firstFailedAt,
            'monitoring_first_healthy_at' => $firstHealthyAt,
            'evidence' => json_encode(array_merge([
                'source' => 'private_probe', 'detected_at' => $detectedAt, 'failure_rounds' => $failureRounds,
            ], $evidence)),
            'remark' => '私有探测点连续异常，等待管理员核实', 'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('v2_security_alert')->insert([
            'type' => 'private_probe_' . $state, 'severity' => $blocked ? 'critical' : 'warning',
            'title' => $state === 'suspected_domestic_blocked' ? '疑似国内方向被封锁'
                : ($state === 'suspected_overseas_blocked' ? '疑似海外方向被封锁' : '多地区探测发现节点异常'),
            'payload' => json_encode($evidence), 'event_id' => $eventId, 'created_at' => $now,
        ]);
        return $eventId;
    }
}
