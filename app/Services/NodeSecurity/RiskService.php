<?php

namespace App\Services\NodeSecurity;

use Illuminate\Support\Facades\DB;

class RiskService
{
    public function recompute(?int $onlyUserId = null): int
    {
        $settings = (new SettingsService())->all();
        $window = max(30, (int)$settings['risk_window_seconds']);
        $early = max(10, (int)$settings['early_window_seconds']);
        $events = DB::table('v2_node_block_event')
            ->where('status', 'confirmed')
            ->where('event_type', 'blocked')->get();
        $scores = [];
        $reset = DB::table('v2_security_user_score');
        if ($onlyUserId) $reset->where('user_id', $onlyUserId);
        $reset->update([
            'risk_score' => 0, 'event_hits' => 0, 'early_access_hits' => 0,
            'watermark_hits' => 0, 'unique_ips' => 0, 'unique_devices' => 0,
            'risk_reasons' => json_encode([]), 'last_risk_at' => time(), 'updated_at' => time(),
        ]);

        foreach ($events as $event) {
            $snapshotId = $event->snapshot_id;
            if (!$snapshotId) {
                $snapshotQuery = DB::table('v2_node_snapshot')
                    ->where('server_type', $event->server_type)
                    ->where('server_id', $event->server_id)
                    ->where('published_at', '<=', $event->first_failed_at);
                if ($event->watermark_group_id) {
                    $snapshotQuery->where('watermark_group_id', $event->watermark_group_id);
                } else {
                    $snapshotQuery->whereNull('watermark_group_id');
                }
                $snapshotId = $snapshotQuery->orderByDesc('published_at')->value('id');
                if ($snapshotId) {
                    DB::table('v2_node_block_event')->where('id', $event->id)->update([
                        'snapshot_id' => $snapshotId, 'updated_at' => time(),
                    ]);
                }
            }
            if (!$snapshotId) continue;
            $eventWindow = (new EventWindowService())->calculate($event, $window);
            $from = $eventWindow['start_at'];
            $logs = DB::table('v2_node_access_log')
                ->whereBetween('requested_at', [$from, (int)$event->first_failed_at])
                ->when($onlyUserId, function ($query) use ($onlyUserId) { return $query->where('user_id', $onlyUserId); })
                ->get()->filter(function ($log) use ($snapshotId) {
                    return in_array((int)$snapshotId, json_decode($log->snapshot_ids, true) ?: [], true);
                });
            foreach ($logs as $log) {
                $uid = (int)$log->user_id;
                if (!isset($scores[$uid])) $scores[$uid] = ['events' => [], 'early' => 0, 'ips' => [], 'devices' => []];
                $scores[$uid]['events'][$event->id] = true;
                if ((int)$event->first_failed_at - (int)$log->requested_at <= $early) $scores[$uid]['early']++;
                if ($log->ip_hash) $scores[$uid]['ips'][$log->ip_hash] = true;
                if ($log->device_hash) $scores[$uid]['devices'][$log->device_hash] = true;
            }
        }

        $watermarkHits = DB::table('v2_watermark_group_user as gu')
            ->join('v2_watermark_group as g', 'g.id', '=', 'gu.group_id')
            ->join('v2_node_block_event as e', 'e.watermark_group_id', '=', 'g.id')->where('e.status', 'confirmed')
            ->when($onlyUserId, function ($query) use ($onlyUserId) { return $query->where('gu.user_id', $onlyUserId); })
            ->select('gu.user_id', DB::raw('COUNT(DISTINCT e.id) as hits'))->groupBy('gu.user_id')->get();
        foreach ($watermarkHits as $hit) {
            $uid = (int)$hit->user_id;
            if (!isset($scores[$uid])) $scores[$uid] = ['events' => [], 'early' => 0, 'ips' => [], 'devices' => []];
            $scores[$uid]['watermark'] = (int)$hit->hits;
        }

        foreach ($scores as $uid => $data) {
            $eventHits = count($data['events']);
            $watermark = $data['watermark'] ?? 0;
            $score = $this->calculateScore($eventHits, $data['early'], $watermark);
            $reasons = [];
            if ($eventHits) $reasons[] = "命中{$eventHits}次封锁事件";
            if ($data['early']) $reasons[] = "{$data['early']}次在早期窗口获取";
            if ($watermark) $reasons[] = "命中{$watermark}次水印";
            $now = time();
            DB::table('v2_security_user_score')->updateOrInsert(['user_id' => $uid], [
                'risk_score' => $score,
                'event_hits' => $eventHits,
                'early_access_hits' => $data['early'],
                'watermark_hits' => $watermark,
                'unique_ips' => count($data['ips']),
                'unique_devices' => count($data['devices']),
                'risk_reasons' => json_encode($reasons, JSON_UNESCAPED_UNICODE),
                'last_risk_at' => $now,
                'updated_at' => $now,
                'created_at' => $now,
            ]);
        }
        return count($scores);
    }

    public function calculateScore(int $eventHits, int $earlyHits, int $watermarkHits): int
    {
        return min(100, max(0, $eventHits) * 15 + min(30, max(0, $earlyHits) * 8) + min(40, max(0, $watermarkHits) * 25));
    }
}
