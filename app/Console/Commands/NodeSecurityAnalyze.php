<?php

namespace App\Console\Commands;

use App\Services\NodeSecurity\RiskService;
use App\Services\NodeSecurity\SettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NodeSecurityAnalyze extends Command
{
    protected $signature = 'security:analyze';
    protected $description = 'Recompute node security risks, detect related accounts and prune audit logs';

    public function handle()
    {
        $settings = (new SettingsService())->all();
        (new RiskService())->recompute();
        $this->detectSharedIps((int)$settings['multi_account_ip_threshold']);
        $cutoff = time() - max(1, (int)$settings['retention_days']) * 86400;
        DB::table('v2_node_access_log')->where('requested_at', '<', $cutoff)->delete();
        return 0;
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
