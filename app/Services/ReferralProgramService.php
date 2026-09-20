<?php

namespace App\Services;

use App\Models\Order;
use App\Models\CouponTemplate;
use App\Models\UserCoupon;
use App\Models\ReferralLevel;
use App\Models\ReferralMilestone;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class ReferralProgramService
{
    public function memberDiscountRate(User $user): int
    {
        $manual = max(0, min(100, (int)$user->discount));
        if (!$user->referral_level_id) return $manual;
        if ($user->referral_level_expires_at && $user->referral_level_expires_at <= time()) return $manual;
        $level = ReferralLevel::where('id', $user->referral_level_id)->where('enabled', 1)->first();
        return max($manual, $level ? max(0, min(100, (int)$level->member_discount)) : 0);
    }

    public function issueNewcomerCoupon(User $user): ?UserCoupon
    {
        if (!$user->invite_user_id || !Schema::hasTable('v2_user_coupon')) return null;
        $setting = $this->setting();
        if (!$setting || !$setting->enabled || !$setting->newcomer_coupon_template_id) return null;
        $template = CouponTemplate::find($setting->newcomer_coupon_template_id);
        if (!$template) return null;
        return app(CouponWalletService::class)->issue($template, $user, 'referral_newcomer', 'inviter:' . $user->invite_user_id);
    }

    public function reverseOrderRewards(int $orderId, string $reason = ''): int
    {
        if (!Schema::hasTable('v2_referral_reward')) return 0;

        $count = DB::transaction(function () use ($orderId, $reason) {
            $rewards = ReferralReward::where('order_id', $orderId)
                ->where('status', 'granted')
                ->lockForUpdate()
                ->get();
            if ($rewards->isEmpty()) return 0;

            foreach ($rewards as $reward) {
                if (in_array($reward->reward_type, ['balance', 'commission_balance'], true) && $reward->reward_value > 0) {
                    $user = User::where('id', $reward->user_id)->lockForUpdate()->first();
                    if (!$user) throw new \RuntimeException('奖励用户不存在，无法撤销');
                    $field = $reward->reward_type === 'commission_balance' ? 'commission_balance' : 'balance';
                    if ((int)$user->{$field} < (int)$reward->reward_value) {
                        throw new \RuntimeException('用户可用余额不足，无法自动撤销奖励');
                    }
                    $user->{$field} -= (int)$reward->reward_value;
                    $user->save();
                }
                if (in_array($reward->reward_type, ['traffic', 'duration'], true) && $reward->reward_value > 0) {
                    $user = User::where('id', $reward->user_id)->lockForUpdate()->first();
                    if (!$user) throw new \RuntimeException('奖励用户不存在，无法撤销');
                    if ($reward->reward_type === 'traffic') {
                        $bytes = (int)$reward->reward_value * 1073741824;
                        if ((int)$user->transfer_enable - $bytes < (int)$user->u + (int)$user->d) throw new \RuntimeException('奖励流量已被使用，无法自动撤销');
                        $user->transfer_enable -= $bytes;
                    } else {
                        $seconds = (int)$reward->reward_value * 86400;
                        if ((int)$user->expired_at - $seconds < time()) throw new \RuntimeException('奖励时长已被使用，无法自动撤销');
                        $user->expired_at -= $seconds;
                    }
                    $user->save();
                }
                $reward->status = 'reversed';
                $reward->description = trim(($reward->description ?: '') . ($reason ? '；撤销原因：' . $reason : '；管理员撤销'));
                $reward->save();
            }

            foreach ($rewards->where('reward_type', 'level')->pluck('user_id')->unique() as $userId) {
                $user = User::where('id', $userId)->lockForUpdate()->first();
                if (!$user) continue;
                $remainingRate = (int)ReferralReward::where('user_id', $userId)
                    ->where('reward_type', 'level')->where('status', 'granted')->max('reward_value');
                $setting = $this->setting();
                $user->commission_rate = $remainingRate ?: (int)($setting ? $setting->base_commission_rate : config('v2board.invite_commission', 10));
                $user->save();
            }

            return $rewards->count();
        });
        Cache::forget('admin_referral_dashboard');
        return $count;
    }

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
        if (!$setting || !$setting->enabled) return;
        if ($order->total_amount < $setting->first_order_min) return;
        if (!Schema::hasTable('v2_referral_reward')) return;

        DB::transaction(function () use ($order, $setting) {
            $effectiveKey = 'effective_invite:' . $order->user_id;
            $effectiveReward = ReferralReward::where('event_key', $effectiveKey)->lockForUpdate()->first();
            if ($effectiveReward && $effectiveReward->status !== 'reversed') return;
            $effectiveData = [
                'user_id' => $order->invite_user_id,
                'invited_user_id' => $order->user_id,
                'order_id' => $order->id,
                'reward_type' => 'effective_invite',
                'status' => 'granted',
                'description' => '好友完成首笔有效订单',
                'granted_at' => time(),
            ];
            if ($effectiveReward) $effectiveReward->fill($effectiveData)->save();
            else ReferralReward::create(array_merge(['event_key' => $effectiveKey], $effectiveData));

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
        Cache::forget('admin_referral_dashboard');
    }

    private function grantMilestones(Order $order, int $effectiveCount, ReferralSetting $setting): void
    {
        $milestones = ReferralMilestone::where('enabled', 1)
            ->where('required_invites', '<=', $effectiveCount)
            ->orderBy('required_invites')
            ->get();
        foreach ($milestones as $milestone) {
            if (in_array($milestone->reward_type, ['balance', 'commission_balance'], true)) {
                if (!$this->withinMonthlyLimit($order->invite_user_id, $milestone->reward_value, $setting)) continue;
                $this->grantMoney(User::find($order->invite_user_id), $milestone->reward_type, (int)$milestone->reward_value, 'milestone:' . $milestone->id . ':' . $order->invite_user_id, $order, '邀请里程碑：' . $milestone->name);
            } else {
                $this->grantEntitlement(User::find($order->invite_user_id), $milestone->reward_type, (int)$milestone->reward_value, 'milestone:' . $milestone->id . ':' . $order->invite_user_id, $order, '邀请里程碑：' . $milestone->name);
            }
        }
    }

    private function upgradeLevel(int $userId, int $effectiveCount, Order $order): void
    {
        $revenue = (int)Order::where('invite_user_id', $userId)->where('status', 3)->sum('total_amount');
        $level = ReferralLevel::where('enabled', 1)
            ->where('required_invites', '<=', $effectiveCount)
            ->where('required_revenue', '<=', $revenue)
            ->orderBy('required_invites', 'DESC')
            ->orderBy('required_revenue', 'DESC')
            ->orderBy('sort', 'DESC')
            ->first();
        if (!$level) return;
        $user = User::find($userId);
        if (!$user || (int)$user->referral_level_id === (int)$level->id) return;
        if ($user->referral_level_id) {
            $current = ReferralLevel::find($user->referral_level_id);
            if ($current && (int)$current->required_invites >= (int)$level->required_invites
                && (int)$current->required_revenue >= (int)$level->required_revenue) return;
        }
        $user->commission_rate = $level->commission_rate;
        $user->referral_level_id = $level->id;
        $user->referral_level_expires_at = $level->valid_days ? time() + (int)$level->valid_days * 86400 : null;
        $user->save();
        ReferralReward::updateOrCreate(['event_key' => 'level:' . $level->id . ':' . $userId], [
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
        if (!$user || $amount <= 0) return;
        $existing = ReferralReward::where('event_key', $eventKey)->lockForUpdate()->first();
        if ($existing && $existing->status !== 'reversed') return;
        if ($type === 'commission_balance') $user->commission_balance += $amount;
        else $user->balance += $amount;
        $user->save();
        $data = [
            'user_id' => $user->id,
            'invited_user_id' => $order->user_id,
            'order_id' => $order->id,
            'reward_type' => $type,
            'reward_value' => $amount,
            'status' => 'granted',
            'description' => $description,
            'granted_at' => time(),
        ];
        if ($existing) $existing->fill($data)->save();
        else ReferralReward::create(array_merge(['event_key' => $eventKey], $data));
    }

    private function grantEntitlement($user, string $type, int $value, string $eventKey, Order $order, string $description): void
    {
        if (!$user || $value <= 0) return;
        $existing = ReferralReward::where('event_key', $eventKey)->lockForUpdate()->first();
        if ($existing && $existing->status !== 'reversed') return;
        if ($type === 'traffic') $user->transfer_enable += $value * 1073741824;
        elseif ($type === 'duration') $user->expired_at = max((int)$user->expired_at, time()) + $value * 86400;
        else return;
        $user->save();
        $data = ['user_id'=>$user->id,'invited_user_id'=>$order->user_id,'order_id'=>$order->id,'reward_type'=>$type,'reward_value'=>$value,'status'=>'granted','description'=>$description,'granted_at'=>time()];
        if ($existing) $existing->fill($data)->save();
        else ReferralReward::create(array_merge(['event_key'=>$eventKey], $data));
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
