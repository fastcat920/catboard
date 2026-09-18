<?php

namespace App\Services;

use App\Models\Order;
use App\Models\ReferralLevel;
use App\Models\ReferralMilestone;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReferralProgramService
{
    public function setting()
    {
        if (!Schema::hasTable('v2_referral_setting')) return null;
        return ReferralSetting::current();
    }

    public function commissionRate(User $inviter): int
    {
        if ($inviter->commission_rate) return (int)$inviter->commission_rate;
        $setting = $this->setting();
        return $setting && $setting->enabled
            ? (int)$setting->base_commission_rate
            : (int)config('v2board.invite_commission', 10);
    }

    public function processCompletedOrder(Order $order): void
    {
        if (!$order->invite_user_id || (int)$order->type !== 1 || (int)$order->status !== 3) return;
        $setting = $this->setting();
        if (!$setting || !$setting->enabled || $order->total_amount < $setting->first_order_min) return;
        if (!Schema::hasTable('v2_referral_reward')) return;

        DB::transaction(function () use ($order, $setting) {
            $effectiveKey = 'effective_invite:' . $order->user_id;
            if (ReferralReward::where('event_key', $effectiveKey)->lockForUpdate()->exists()) return;

            ReferralReward::create([
                'event_key' => $effectiveKey,
                'user_id' => $order->invite_user_id,
                'invited_user_id' => $order->user_id,
                'order_id' => $order->id,
                'reward_type' => 'effective_invite',
                'status' => 'granted',
                'description' => '好友完成首笔有效订单',
                'granted_at' => time(),
            ]);

            if ($setting->invitee_reward > 0) {
                $this->grantMoney(
                    User::find($order->user_id),
                    'balance',
                    (int)$setting->invitee_reward,
                    'invitee_first_order:' . $order->id,
                    $order,
                    '受邀用户首单奖励'
                );
            }

            $effectiveCount = ReferralReward::where('user_id', $order->invite_user_id)
                ->where('reward_type', 'effective_invite')
                ->where('status', 'granted')
                ->count();
            $this->grantMilestones($order, $effectiveCount, $setting);
            $this->upgradeLevel($order->invite_user_id, $effectiveCount, $order);
        });
    }

    private function grantMilestones(Order $order, int $effectiveCount, ReferralSetting $setting): void
    {
        $milestones = ReferralMilestone::where('enabled', 1)
            ->where('required_invites', '<=', $effectiveCount)
            ->orderBy('required_invites')
            ->get();
        foreach ($milestones as $milestone) {
            if (!$this->withinMonthlyLimit($order->invite_user_id, $milestone->reward_value, $setting)) continue;
            $this->grantMoney(
                User::find($order->invite_user_id),
                $milestone->reward_type,
                (int)$milestone->reward_value,
                'milestone:' . $milestone->id . ':' . $order->invite_user_id,
                $order,
                '邀请里程碑：' . $milestone->name
            );
        }
    }

    private function upgradeLevel(int $userId, int $effectiveCount, Order $order): void
    {
        $level = ReferralLevel::where('enabled', 1)
            ->where('required_invites', '<=', $effectiveCount)
            ->orderBy('required_invites', 'DESC')
            ->first();
        if (!$level) return;
        $user = User::find($userId);
        if (!$user || (int)$user->commission_rate >= (int)$level->commission_rate) return;
        $user->commission_rate = $level->commission_rate;
        $user->save();
        ReferralReward::firstOrCreate(['event_key' => 'level:' . $level->id . ':' . $userId], [
            'user_id' => $userId,
            'invited_user_id' => $order->user_id,
            'order_id' => $order->id,
            'reward_type' => 'level',
            'reward_value' => $level->commission_rate,
            'status' => 'granted',
            'description' => '推广等级升级：' . $level->name,
            'granted_at' => time(),
        ]);
    }

    private function grantMoney($user, string $type, int $amount, string $eventKey, Order $order, string $description): void
    {
        if (!$user || $amount <= 0 || ReferralReward::where('event_key', $eventKey)->exists()) return;
        if ($type === 'commission_balance') $user->commission_balance += $amount;
        else $user->balance += $amount;
        $user->save();
        ReferralReward::create([
            'event_key' => $eventKey,
            'user_id' => $user->id,
            'invited_user_id' => $order->user_id,
            'order_id' => $order->id,
            'reward_type' => $type,
            'reward_value' => $amount,
            'status' => 'granted',
            'description' => $description,
            'granted_at' => time(),
        ]);
    }

    private function withinMonthlyLimit(int $userId, int $amount, ReferralSetting $setting): bool
    {
        if (!$setting->monthly_reward_limit) return true;
        $granted = ReferralReward::where('user_id', $userId)
            ->whereIn('reward_type', ['balance', 'commission_balance'])
            ->where('status', 'granted')
            ->where('created_at', '>=', strtotime(date('Y-m-1')))
            ->sum('reward_value');
        return $granted + $amount <= $setting->monthly_reward_limit;
    }
}
