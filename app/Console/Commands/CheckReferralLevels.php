<?php

namespace App\Console\Commands;

use App\Models\ReferralLevel;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\Order;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CheckReferralLevels extends Command
{
    protected $signature = 'check:referral-levels';
    protected $description = '检查推广等级保级与降级';

    public function handle()
    {
        if (!Schema::hasColumn('v2_user', 'referral_level_expires_at')) return 0;
        User::whereNotNull('referral_level_id')->where('referral_level_expires_at', '<=', time())
            ->orderBy('id')->chunkById(100, function ($users) {
                foreach ($users as $user) $this->review($user);
            });
        return 0;
    }

    private function review(User $user): void
    {
        DB::transaction(function () use ($user) {
            $user = User::where('id', $user->id)->lockForUpdate()->first();
            $level = ReferralLevel::find($user->referral_level_id);
            if (!$level) return;
            $periodStart = time() - max(1, (int)$level->valid_days) * 86400;
            $recent = ReferralReward::where('user_id', $user->id)->where('reward_type', 'effective_invite')
                ->where('status', 'granted')->where('created_at', '>=', $periodStart)->count();
            $recentRevenue = (int)Order::where('invite_user_id', $user->id)->where('status', 3)
                ->where('created_at', '>=', $periodStart)->sum('total_amount');
            if ($level->valid_days && $recent >= (int)$level->retain_invites && $recentRevenue >= (int)$level->retain_revenue) {
                $user->referral_level_expires_at = time() + (int)$level->valid_days * 86400;
                $user->save();
                return;
            }
            $lower = ReferralLevel::where('enabled', 1)->where('id', '!=', $level->id)
                ->where('required_invites', '<=', $recent)->where('required_revenue', '<=', $recentRevenue)
                ->where(function ($query) use ($level) {
                    $query->where('required_invites', '<', $level->required_invites)
                        ->orWhere('required_revenue', '<', $level->required_revenue);
                })->orderBy('required_invites', 'DESC')->orderBy('required_revenue', 'DESC')->first();
            $setting = ReferralSetting::current();
            $user->referral_level_id = $lower ? $lower->id : null;
            $user->referral_level_expires_at = $lower && $lower->valid_days ? time() + (int)$lower->valid_days * 86400 : null;
            $user->commission_rate = $lower ? $lower->commission_rate : $setting->base_commission_rate;
            $user->save();
        });
    }
}
