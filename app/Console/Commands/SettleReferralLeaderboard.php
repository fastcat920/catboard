<?php

namespace App\Console\Commands;

use App\Models\ReferralLeaderboardSetting;
use App\Models\ReferralReward;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Services\BalanceLedgerService;

class SettleReferralLeaderboard extends Command
{
    protected $signature = 'referral:settle-leaderboard';
    protected $description = '结算邀请排行榜奖励';

    public function handle()
    {
        if (!Schema::hasTable('v2_referral_leaderboard_award')) return 0;
        $setting = ReferralLeaderboardSetting::current();
        if (!$setting->enabled) return 0;
        $boards = $setting->boards();
        if ($boards['week']['enabled']) $this->settle('week', strtotime('monday last week'), strtotime('monday this week') - 1, date('o-W', strtotime('monday last week')), $setting->periodRules('week'), $boards['week']['metric']);
        if ($boards['month']['enabled']) $this->settle('month', strtotime('first day of last month midnight'), strtotime('first day of this month midnight') - 1, date('Y-m', strtotime('first day of last month')), $setting->periodRules('month'), $boards['month']['metric']);
        if ($boards['total']['enabled']) $this->settle('total', 0, time(), 'all', $setting->periodRules('total'), $boards['total']['metric']);
        return 0;
    }

    private function settle(string $type, int $from, int $to, string $key, array $rules, string $metric): void
    {
        if (!$rules) return;
        $effective = ReferralReward::select('user_id', DB::raw('COUNT(*) as invite_count'))
            ->where('reward_type', 'effective_invite')->where('status', 'granted')->whereIn('user_id', User::select('id'));
        if ($from) $effective->whereRaw('COALESCE(granted_at, created_at) BETWEEN ? AND ?', [$from, $to]);
        $effective->groupBy('user_id');
        $leaders = User::query()->leftJoinSub($effective, 'r', 'r.user_id', '=', 'v2_user.id')
            ->leftJoin('v2_order as o', function ($join) use ($from, $to) {
                $join->on('o.invite_user_id', '=', 'v2_user.id')->where('o.status', 3);
                if ($from) $join->whereBetween('o.created_at', [$from, $to]);
            })
            ->select('v2_user.id as user_id', DB::raw('COALESCE(MAX(r.invite_count),0) as invite_count'), DB::raw('COALESCE(SUM(o.total_amount),0) as revenue'), DB::raw('COALESCE(SUM(o.commission_balance),0) as income'))
            ->groupBy('v2_user.id')
            ->having($metric === 'revenue' ? 'revenue' : ($metric === 'income' ? 'income' : 'invite_count'), '>', 0)
            ->orderBy($metric === 'revenue' ? 'revenue' : ($metric === 'income' ? 'income' : 'invite_count'), 'DESC')
            ->orderBy('v2_user.id')->limit(100)->get();
        foreach ($leaders as $index => $leader) {
            $rank = $index + 1;
            $metricValue = (int)($metric === 'revenue' ? $leader->revenue : ($metric === 'income' ? $leader->income : $leader->invite_count));
            foreach ($rules as $ruleIndex => $rule) {
                $rankFrom = max(1, (int)($rule['rank_from'] ?? 1)); $rankTo = max($rankFrom, (int)($rule['rank_to'] ?? $rankFrom));
                if ($rank < $rankFrom || $rank > $rankTo || $metricValue < (int)($rule['min_value'] ?? 0) || (int)($rule['reward_value'] ?? 0) <= 0) continue;
                DB::transaction(function () use ($type, $key, $leader, $rank, $rule, $ruleIndex) {
                    $awardKey = $type === 'total'
                        ? 'all:' . substr(sha1(json_encode($rule)), 0, 20)
                        : $key . ':' . $ruleIndex;
                    $exists = DB::table('v2_referral_leaderboard_award')->where('period_key', $awardKey)->where('period_type', $type)->where('user_id', $leader->user_id)->lockForUpdate()->exists();
                    if ($exists) return;
                    $user = User::where('id', $leader->user_id)->lockForUpdate()->first(); if (!$user) return;
                    $value = (int)$rule['reward_value']; $balanceBefore = (int)$user->balance; $user->balance += $value; $user->save();
                    DB::table('v2_referral_leaderboard_award')->insert(['period_key'=>$awardKey,'period_type'=>$type,'user_id'=>$user->id,'rank'=>$rank,'reward_value'=>$value,'status'=>'granted','created_at'=>time(),'updated_at'=>time()]);
                    $reward = ReferralReward::create(['event_key'=>'leaderboard:'.$type.':'.$awardKey.':'.$user->id,'user_id'=>$user->id,'reward_type'=>'balance','reward_value'=>$value,'status'=>'granted','description'=>'邀请排行榜奖励（第 '.$rank.' 名）','granted_at'=>time()]);
                    app(BalanceLedgerService::class)->record([
                        'user_id' => $user->id, 'type' => 'referral_reward', 'amount' => $value,
                        'balance_before' => $balanceBefore, 'balance_after' => (int)$user->balance,
                        'source_key' => 'referral_reward:' . $reward->id, 'source_type' => 'referral_reward',
                        'source_id' => $reward->id, 'description' => $reward->description,
                    ]);
                });
            }
        }
    }
}
