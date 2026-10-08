<?php

namespace App\Console\Commands;

use App\Services\NodeSecurity\RiskService;
use App\Services\NodeSecurity\SettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class NodeSecurityHealthCheck extends Command
{
    protected $signature = 'security:node-health';
    protected $description = 'Check active watermark endpoints and create node security alerts';

    public function handle()
    {
        $settings = (new SettingsService())->all();
        if (!$settings['health_enabled']) return 0;
        $groups = DB::table('v2_watermark_group as g')->join('v2_watermark_experiment as e', 'e.id', '=', 'g.experiment_id')
            ->where('g.status', 'active')->where('e.status', 'active')->whereNotNull('g.watermark_host_encrypted')->select('g.*')->get();
        foreach ($groups as $group) $this->checkGroup($group, $settings);
        return 0;
    }

    private function checkGroup($group, array $settings): void
    {
        try {
            $host = decrypt($group->watermark_host_encrypted);
            $port = (int)$group->watermark_port;
            $started = microtime(true);
            $socket = @fsockopen($host, $port, $errno, $error, max(1, (int)$settings['health_timeout_seconds']));
            $ok = is_resource($socket);
            if ($ok) fclose($socket);
            $failureCount = $ok ? 0 : (int)$group->failure_count + 1;
            DB::table('v2_watermark_group')->where('id', $group->id)->update([
                'last_check_at' => time(), 'last_check_ok' => $ok ? 1 : 0,
                'failure_count' => $failureCount, 'updated_at' => time(),
            ]);
            if (!$ok && $failureCount === (int)$settings['health_failures_to_alert']) {
                $this->raiseAlert($group, $host, $port, $errno . ' ' . $error, $settings);
            }
        } catch (\Throwable $e) {
            $this->error('Group ' . $group->id . ': ' . $e->getMessage());
        }
    }

    private function raiseAlert($group, string $host, int $port, string $error, array $settings): void
    {
        $now = time();
        $eventId = null;
        if ($settings['auto_create_event']) {
            $snapshot = DB::table('v2_node_snapshot')->where('watermark_group_id', $group->id)
                ->orderByDesc('published_at')->first();
            $eventId = DB::table('v2_node_block_event')->insertGetId([
                'server_type' => $group->server_type, 'server_id' => $group->server_id,
                'snapshot_id' => $snapshot->id ?? null, 'watermark_group_id' => $group->id,
                'event_type' => 'blocked', 'status' => 'suspected',
                'first_failed_at' => $now, 'evidence' => json_encode(['source' => 'tcp_health', 'error' => $error]),
                'remark' => '水印节点连续探测失败，需结合国内外探测人工确认',
                'created_at' => $now, 'updated_at' => $now,
            ]);
            (new RiskService())->recompute();
        }
        $payload = ['group_id' => $group->id, 'host_hash' => hash('sha256', $host), 'port' => $port, 'error' => $error];
        DB::table('v2_security_alert')->insert([
            'type' => 'watermark_health_failed', 'severity' => 'critical', 'title' => '水印节点连续探测失败',
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE), 'event_id' => $eventId, 'created_at' => $now,
        ]);
        if (!empty($settings['alert_webhook_url'])) {
            try { Http::timeout(3)->post($settings['alert_webhook_url'], ['title' => '水印节点连续探测失败', 'data' => $payload]); } catch (\Throwable $e) {}
        }
    }
}
