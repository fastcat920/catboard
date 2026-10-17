<?php

namespace App\Console\Commands;

use App\Services\NodeSecurity\RiskService;
use App\Services\NodeSecurity\SettingsService;
use App\Services\NodeSecurity\ProbeAnalysisService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class NodeSecurityAnalyze extends Command
{
    protected $signature = 'security:analyze {--scheduled : Respect the configured analysis interval} {--force : Run immediately regardless of interval}';
    protected $description = 'Recompute node security risks, detect related accounts and prune audit logs';

    public function handle()
    {
        $settings = (new SettingsService())->all();
        $interval = max(1, min(60, (int)($settings['security_analysis_interval_minutes'] ?? 1)));
        $lastRunKey = 'node_security_analysis_last_bucket';
        $currentBucket = (int)floor(time() / ($interval * 60));
        if ($this->option('scheduled') && !$this->option('force') && (int)Cache::get($lastRunKey, -1) === $currentBucket) return 0;

        $lock = Cache::lock('node_security_analysis_lock', 300);
        if (!$lock->get()) return 0;
        try {
            if ($this->option('scheduled') && !$this->option('force') && (int)Cache::get($lastRunKey, -1) === $currentBucket) return 0;
            (new RiskService())->recompute();
            (new ProbeAnalysisService())->analyze();
            $this->detectSharedIps((int)$settings['multi_account_ip_threshold']);
            $cutoff = time() - max(1, (int)$settings['retention_days']) * 86400;
            if (Schema::hasTable('v2_node_access_snapshot')) {
                DB::table('v2_node_access_snapshot')->where('requested_at', '<', $cutoff)->delete();
            }
            DB::table('v2_node_access_log')->where('requested_at', '<', $cutoff)->delete();
            Cache::forever($lastRunKey, $currentBucket);
            return 0;
        } finally {
            $lock->release();
        }
    }

    private function detectSharedIps(int $threshold): void
    {
        if ($threshold < 2) return;
        $from = time() - 86400;
        $rows = DB::table('v2_node_access_log')->where('requested_at', '>=', $from)->whereNotNull('ip_hash')
            ->select('ip_hash', DB::raw('COUNT(DISTINCT user_id) as users'), DB::raw('MAX(request_ip) as request_ip'))
            ->groupBy('ip_hash')->having('users', '>=', $threshold)->get();
        foreach ($rows as $row) {
            $dedupe = DB::table('v2_security_alert')->where('type', 'shared_ip_accounts')
                ->where('created_at', '>=', $from)->where('payload', 'like', '%' . $row->ip_hash . '%')->exists();
            if ($dedupe) continue;
            DB::table('v2_security_alert')->insert([
                'type' => 'shared_ip_accounts', 'severity' => 'warning',
                'title' => '同一出口 IP 关联多个账号',
                'payload' => json_encode(['ip_hash' => $row->ip_hash, 'ip' => $row->request_ip, 'users' => (int)$row->users]),
                'created_at' => time(),
            ]);
        }
    }
}
