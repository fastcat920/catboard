<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Coupon;
use App\Models\ReferralCouponGrant;
use App\Models\ReferralCampaign;
use App\Models\ReferralLevel;
use App\Models\ReferralMilestone;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use App\Utils\Helper;

class ReferralProgramService
{
    public function issueNewcomerCoupon(User $user): ?ReferralCouponGrant
    {
        if (!$user->invite_user_id || !Schema::hasTable('v2_referral_coupon_grant')) return null;
        $setting = $this->setting();
        if (!$setting || !$setting->enabled || !$setting->newcomer_coupon_id) return null;
        $template = Coupon::find($setting->newcomer_coupon_id);
        if (!$template || ($template->ended_at && $template->ended_at <= time())) return null;

        return DB::transaction(function () use ($user, $setting, $template) {
            $existing = ReferralCouponGrant::where('user_id', $user->id)
                ->where('template_coupon_id', $template->id)->lockForUpdate()->first();
            if ($existing) return $existing;
            $expiresAt = time() + max(1, (int)$setting->newcomer_reward_valid_days) * 86400;
            if ($template->ended_at) $expiresAt = min($expiresAt, (int)$template->ended_at);
            $coupon = $template->replicate();
            $coupon->name = $template->name . '-新人专属';
            $coupon->code = Helper::randomChar(12);
            $coupon->show = 1;
            $coupon->limit_use = 1;
            $coupon->limit_use_with_user = 1;
            $coupon->started_at = time();
            $coupon->ended_at = $expiresAt;
            $coupon->save();
            return ReferralCouponGrant::create([
                'user_id' => $user->id,
                'inviter_id' => $user->invite_user_id,
                'template_coupon_id' => $template->id,
                'coupon_id' => $coupon->id,
                'status' => 'issued',
                'expires_at' => $expiresAt,
            ]);
        });
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

    public function campaignCommissionMultiplier(Order $order, User $invitee): float
    {
        $campaign = $this->activeCampaign($order, $invitee);
        return $campaign ? max(0, (float)$campaign->commission_multiplier) : 1.0;
    }

    public function processCompletedOrder(Order $order): void
    {
        if (!$order->invite_user_id || (int)$order->type !== 1 || (int)$order->status !== 3) return;
        $setting = $this->setting();
        if (!$setting || !$setting->enabled) return;
        $campaign = $this->activeCampaign($order, User::find($order->user_id));
        if ($order->total_amount < $setting->first_order_min && !$campaign) return;
        if (!Schema::hasTable('v2_referral_reward')) return;

        DB::transaction(function () use ($order, $setting, $campaign) {
            $effectiveKey = 'effective_invite:' . $order->user_id;
            $effectiveReward = ReferralReward::where('event_key', $effectiveKey)->lockForUpdate()->first();
            if ($effectiveReward && $effectiveReward->status !== 'reversed') return;
            $effectiveData = [
                'user_id' => $order->invite_user_id,
                'invited_user_id' => $order->user_id,
                'order_id' => $order->id,
                'campaign_id' => $campaign ? $campaign->id : null,
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
            $this->grantCampaignRewards($order, $effectiveCount);
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
        $level = ReferralLevel::where('enabled', 1)
            ->where('required_invites', '<=', $effectiveCount)
            ->orderBy('required_invites', 'DESC')
            ->first();
        if (!$level) return;
        $user = User::find($userId);
        if (!$user || (int)$user->commission_rate >= (int)$level->commission_rate) return;
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

    private function grantCampaignRewards(Order $order, int $effectiveCount): void
    {
        $invitee = User::find($order->user_id);
        $campaign = $this->activeCampaign($order, $invitee);
        if (!$campaign) return;
        $campaign = ReferralCampaign::where('id', $campaign->id)->lockForUpdate()->first();
        if (!$campaign || !$campaign->enabled) return;

        $grants = [];
        if ($campaign->invitee_reward_type !== 'none' && $campaign->invitee_reward_value > 0) {
            $grants[] = [$invitee, $campaign->invitee_reward_type, (int)$campaign->invitee_reward_value, 'campaign_invitee:' . $campaign->id . ':' . $order->user_id, '邀请活动受邀人奖励'];
        }
        if ($campaign->bonus_required_invites > 0 && $effectiveCount % (int)$campaign->bonus_required_invites === 0 && $campaign->inviter_reward_type !== 'none' && $campaign->inviter_reward_value > 0) {
            $grants[] = [User::find($order->invite_user_id), $campaign->inviter_reward_type, (int)$campaign->inviter_reward_value, 'campaign_inviter:' . $campaign->id . ':' . $order->invite_user_id . ':' . $effectiveCount, '邀请活动阶段奖励'];
        }

        foreach ($grants as $grant) {
            [$user, $type, $value, $eventKey, $description] = $grant;
            if (!$user || !$this->campaignCanGrant($campaign, $user->id, $type, $value)) continue;
            if (in_array($type, ['balance', 'commission_balance'], true)) {
                $this->grantMoney($user, $type, $value, $eventKey, $order, $description, $campaign->id);
                $campaign->spent_amount += $value;
            } else {
                $this->grantEntitlement($user, $type, $value, $eventKey, $order, $description, $campaign->id);
            }
            $campaign->granted_count += 1;
        }
        $campaign->save();
    }

    private function activeCampaign(Order $order, ?User $invitee): ?ReferralCampaign
    {
        if (!$invitee || (int)$order->type !== 1 || !Schema::hasTable('v2_referral_campaign')) return null;
        $now = time();
        $campaigns = ReferralCampaign::where('enabled', 1)->where('starts_at', '<=', $now)->where('ends_at', '>=', $now)->orderBy('id', 'DESC')->get();
        foreach ($campaigns as $campaign) {
            if ((int)$order->total_amount < (int)$campaign->first_order_min) continue;
            $plans = array_map('intval', (array)$campaign->plan_ids);
            if ($plans && !in_array((int)$order->plan_id, $plans, true)) continue;
            $registeredAt = (int)$invitee->getRawOriginal('created_at');
            if ($campaign->audience === 'new' && $registeredAt < (int)$campaign->starts_at) continue;
            if ($campaign->audience === 'existing' && $registeredAt >= (int)$campaign->starts_at) continue;
            return $campaign;
        }
        return null;
    }

    private function campaignCanGrant(ReferralCampaign $campaign, int $userId, string $type, int $value): bool
    {
        if ($campaign->grant_limit && (int)$campaign->granted_count >= (int)$campaign->grant_limit) return false;
        $userGrants = ReferralReward::where('campaign_id', $campaign->id)->where('user_id', $userId)
            ->whereIn('reward_type', ['balance', 'commission_balance', 'traffic', 'duration'])->where('status', 'granted');
        if ($campaign->per_user_limit && (clone $userGrants)->count() >= (int)$campaign->per_user_limit) return false;
        if (in_array($type, ['balance', 'commission_balance'], true) && $campaign->budget_total && (int)$campaign->spent_amount + $value > (int)$campaign->budget_total) return false;
        return true;
    }

    private function grantMoney($user, string $type, int $amount, string $eventKey, Order $order, string $description, ?int $campaignId = null): void
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
            'campaign_id' => $campaignId,
            'reward_type' => $type,
            'reward_value' => $amount,
            'status' => 'granted',
            'description' => $description,
            'granted_at' => time(),
        ];
        if ($existing) $existing->fill($data)->save();
        else ReferralReward::create(array_merge(['event_key' => $eventKey], $data));
    }

    private function grantEntitlement($user, string $type, int $value, string $eventKey, Order $order, string $description, ?int $campaignId = null): void
    {
        if (!$user || $value <= 0) return;
        $existing = ReferralReward::where('event_key', $eventKey)->lockForUpdate()->first();
        if ($existing && $existing->status !== 'reversed') return;
        if ($type === 'traffic') $user->transfer_enable += $value * 1073741824;
        elseif ($type === 'duration') $user->expired_at = max((int)$user->expired_at, time()) + $value * 86400;
        else return;
        $user->save();
        $data = ['user_id'=>$user->id,'invited_user_id'=>$order->user_id,'order_id'=>$order->id,'campaign_id'=>$campaignId,'reward_type'=>$type,'reward_value'=>$value,'status'=>'granted','description'=>$description,'granted_at'=>time()];
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
