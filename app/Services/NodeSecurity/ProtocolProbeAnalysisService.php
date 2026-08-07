<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\DB;

class ProtocolProbeAnalysisService
{
    public function analyze(): int
    {
        $settings = (new SettingsService())->all();
        $threshold = max(1, (int)($settings['protocol_failures_to_event'] ?? 3));
        $since = time() - max(180, (int)($settings['probe_result_window_seconds'] ?? 600));
        $targets = DB::table('v2_security_probe_target')->where('status', 'active')
            ->where('protocol_check_enabled', true)->get();
        foreach ($targets as $target) {
            $this->analyzeTarget((string)$target->server_type, (int)$target->server_id, $since, $threshold);
        }
        return count($targets);
    }

    private function analyzeTarget(string $type, int $id, int $since, int $threshold): void
    {
        $latest = DB::table('v2_security_probe_result as r')
            ->join('v2_security_probe as p', 'p.id', '=', 'r.probe_id')
            ->where('p.status', 'active')->where('r.check_type', 'protocol')
            ->where('r.checked_at', '>=', $since)->where('r.server_type', $type)->where('r.server_id', $id)
            ->select('r.*')->orderByDesc('r.checked_at')->get()->unique('probe_id')->values();
        if ($latest->isEmpty()) return;

        $checkedAt = (int)$latest->max('checked_at');
        $state = DB::table('v2_security_node_state')->where('server_type', $type)->where('server_id', $id)->first();
        if ($state && $checkedAt <= (int)($state->protocol_last_checked_at ?? 0)) return;

        $cnOk = $cnFailed = $outsideOk = $outsideFailed = 0;
        foreach ($latest as $row) {
            $cn = strtoupper((string)$row->probe_region) === 'CN';
            if ($cn && $row->success) $cnOk++;
            elseif ($cn) $cnFailed++;
            elseif ($row->success) $outsideOk++;
            else $outsideFailed++;
        }
        $ok = $cnOk + $outsideOk;
        $failed = $cnFailed + $outsideFailed;
        if ($failed === 0 && $ok > 0) $status = 'usable';
        elseif ($cnFailed >= 1 && $outsideOk >= 1) $status = 'protocol_blocked';
        elseif ($ok === 0 && $failed >= 2) $status = 'protocol_outage';
        elseif ($ok > 0 && $failed > 0) $status = 'protocol_partial';
        else $status = 'protocol_insufficient';

        $actionable = in_array($status, ['protocol_blocked', 'protocol_outage', 'protocol_partial'], true);
        $failures = $actionable ? (int)($state->protocol_consecutive_failures ?? 0) + 1 : 0;
        $successes = $status === 'usable' ? (int)($state->protocol_consecutive_successes ?? 0) + 1 : 0;
        $failureStartedAt = $actionable
            ? ((int)($state->protocol_consecutive_failures ?? 0) > 0 && !empty($state->protocol_failure_started_at)
                ? (int)$state->protocol_failure_started_at : $checkedAt)
            : null;
        $failedRow = $latest->first(function ($row) { return !$row->success; });
        $latency = $latest->where('success', true)->min('latency_ms');
        $activeEventId = $state->protocol_active_event_id ?? null;
        $evidence = [
            'source' => 'protocol_probe', 'check_layer' => 'protocol',
            'domestic_ok' => $cnOk, 'domestic_failed' => $cnFailed,
            'overseas_ok' => $outsideOk, 'overseas_failed' => $outsideFailed,
            'error_stage' => $failedRow->error_stage ?? null, 'error_code' => $failedRow->error_code ?? null,
        ];
        if ($failures >= $threshold && !$activeEventId) {
            $activeEventId = $this->createEvent($type, $id, $status, $failureStartedAt, $checkedAt, $failures, $evidence);
        }
        if ($successes >= 3 && $activeEventId) {
            DB::table('v2_node_block_event')->where('id', $activeEventId)->where('status', 'suspected')
                ->update(['status' => 'resolved', 'updated_at' => time()]);
            $activeEventId = null;
        }
        $now = time();
        DB::table('v2_security_node_state')->updateOrInsert(['server_type' => $type, 'server_id' => $id], [
            'protocol_status' => $status, 'protocol_error_stage' => $failedRow->error_stage ?? null,
            'protocol_error_code' => $failedRow->error_code ?? null, 'protocol_latency_ms' => $latency,
            'protocol_last_checked_at' => $checkedAt, 'protocol_failure_started_at' => $failureStartedAt,
            'protocol_consecutive_failures' => $failures, 'protocol_consecutive_successes' => $successes,
            'protocol_active_event_id' => $activeEventId, 'created_at' => $state->created_at ?? $now, 'updated_at' => $now,
        ]);
    }

    private function createEvent(string $type, int $id, string $status, int $firstFailedAt, int $detectedAt, int $rounds, array $evidence): int
    {
        $now = time();
        $snapshot = DB::table('v2_node_snapshot')->where('server_type', $type)->where('server_id', $id)
            ->whereNull('watermark_group_id')->orderByDesc('published_at')->first();
        $eventId = DB::table('v2_node_block_event')->insertGetId([
            'server_type' => $type, 'server_id' => $id, 'snapshot_id' => $snapshot->id ?? null,
            'event_type' => $status === 'protocol_blocked' ? 'blocked' : 'outage', 'status' => 'suspected',
            'first_failed_at' => $firstFailedAt,
            'evidence' => json_encode(array_merge($evidence, ['detected_at' => $detectedAt, 'failure_rounds' => $rounds])),
            'remark' => '专用测试账号的协议级探测连续异常，等待管理员核实',
            'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('v2_security_alert')->insert([
            'type' => $status, 'severity' => $status === 'protocol_blocked' ? 'critical' : 'warning',
            'title' => $status === 'protocol_blocked' ? '疑似协议层封锁' : '协议级探测发现服务异常',
            'payload' => json_encode($evidence), 'event_id' => $eventId, 'created_at' => $now,
        ]);
        return $eventId;
    }
}
