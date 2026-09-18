<?php

namespace App\Http\Controllers\V1\User;

use App\Http\Controllers\Controller;
use App\Models\CommissionLog;
use App\Models\InviteCode;
use App\Models\Order;
use App\Models\User;
use App\Models\ReferralLevel;
use App\Models\ReferralMilestone;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\ReferralCouponGrant;
use App\Models\ReferralCampaign;
use App\Models\ReferralMaterial;
use App\Models\ReferralLeaderboardSetting;
use App\Models\Coupon;
use App\Utils\Helper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class InviteController extends Controller
{
    public function save(Request $request)
    {
        if (InviteCode::where('user_id', $request->user['id'])->where('status', 0)->count() >= config('v2board.invite_gen_limit', 5)) {
            abort(500, __('The maximum number of creations has been reached'));
        }
        $inviteCode = new InviteCode();
        $inviteCode->user_id = $request->user['id'];
        $inviteCode->code = Helper::randomChar(8);
        return response([
            'data' => $inviteCode->save()
        ]);
    }

    public function details(Request $request)
    {
        $current = $request->input('current') ? $request->input('current') : 1;
        $pageSize = $request->input('page_size') >= 10 ? $request->input('page_size') : 10;
        $builder = CommissionLog::where('invite_user_id', $request->user['id'])
            ->where('get_amount', '>', 0)
            ->select([
                'id',
                'trade_no',
                'order_amount',
                'get_amount',
                'created_at'
            ])
            ->orderBy('created_at', 'DESC');
        $total = $builder->count();
        $details = $builder->forPage($current, $pageSize)
            ->get();
        return response([
            'data' => $details,
            'total' => $total
        ]);
    }

    public function fetch(Request $request)
    {
        $codes = InviteCode::where('user_id', $request->user['id'])
            ->where('status', 0)
            ->get();
        $commission_rate = config('v2board.invite_commission', 10);
        $user = User::find($request->user['id']);
        if ($user->commission_rate) {
            $commission_rate = $user->commission_rate;
        }
        $uncheck_commission_balance = (int)Order::where('status', 3)
            ->where('commission_status', 0)
            ->where('invite_user_id', $request->user['id'])
            ->sum('commission_balance');
        if (config('v2board.commission_distribution_enable', 0)) {
            $uncheck_commission_balance = $uncheck_commission_balance * (config('v2board.commission_distribution_l1') / 100);
        }
        $stat = [
            //已注册用户数
            (int)User::where('invite_user_id', $request->user['id'])->count(),
            //有效的佣金
            (int)CommissionLog::where('invite_user_id', $request->user['id'])
                ->sum('get_amount'),
            //确认中的佣金
            $uncheck_commission_balance,
            //佣金比例
            (int)$commission_rate,
            //可用佣金
            (int)$user->commission_balance
        ];
        $program = null;
        if (Schema::hasTable('v2_referral_reward')) {
            $setting = ReferralSetting::current();
            if (!$setting->enabled) {
                return response(['data' => ['codes' => $codes, 'stat' => $stat, 'program' => null]]);
            }
            $effectiveCount = ReferralReward::where('user_id', $user->id)
                ->where('reward_type', 'effective_invite')->where('status', 'granted')->count();
            $level = $user->referral_level_id ? ReferralLevel::find($user->referral_level_id) : ReferralLevel::where('enabled', 1)
                ->where('required_invites', '<=', $effectiveCount)->orderBy('required_invites', 'DESC')->first();
            $nextMilestone = ReferralMilestone::where('enabled', 1)->where('required_invites', '>', $effectiveCount)
                ->orderBy('required_invites')->first();
            $program = [
                'setting' => $setting,
                'effective_invites' => $effectiveCount,
                'level' => $level,
                'level_expires_at' => $user->referral_level_expires_at,
                'next_milestone' => $nextMilestone,
                'recent_rewards' => ReferralReward::where('user_id', $user->id)->where('reward_type', '!=', 'effective_invite')
                    ->orderBy('id', 'DESC')->limit(10)->get(),
            ];
            if (Schema::hasTable('v2_referral_campaign')) {
                $registeredAt = (int)$user->getRawOriginal('created_at');
                $program['campaign'] = ReferralCampaign::where('enabled', 1)->where('starts_at', '<=', time())->where('ends_at', '>=', time())
                    ->where(function ($query) use ($registeredAt) {
                        $query->where('audience', 'all')
                            ->orWhere(function ($q) use ($registeredAt) { $q->where('audience', 'new')->where('starts_at', '<=', $registeredAt); })
                            ->orWhere(function ($q) use ($registeredAt) { $q->where('audience', 'existing')->where('starts_at', '>', $registeredAt); });
                    })->orderBy('id', 'DESC')->first();
            }
            if (Schema::hasTable('v2_referral_material')) {
                $program['materials'] = ReferralMaterial::where('enabled', 1)->orderBy('sort')->get();
            }
            if (Schema::hasTable('v2_referral_leaderboard_setting')) {
                $leaderboardSetting = ReferralLeaderboardSetting::current();
                if ($leaderboardSetting->enabled) {
                    $leaders = ReferralReward::where('reward_type', 'effective_invite')->where('status', 'granted')
                        ->where('created_at', '>=', strtotime(date('Y-m-01')))->select('user_id', DB::raw('COUNT(*) as value'))
                        ->groupBy('user_id')->orderBy('value', 'DESC')->limit(10)->get();
                    $emails = User::whereIn('id', $leaders->pluck('user_id'))->pluck('email', 'id');
                    $program['leaderboard'] = $leaders->values()->map(function ($row, $index) use ($emails, $leaderboardSetting, $user) {
                        $email = (string)$emails->get($row->user_id, '');
                        if ($leaderboardSetting->mask_email && strpos($email, '@') !== false) {
                            [$prefix, $domain] = explode('@', $email, 2); $email = substr($prefix, 0, 1) . '***@' . $domain;
                        }
                        return ['rank' => $index + 1, 'email' => $email, 'value' => (int)$row->value, 'is_me' => (int)$row->user_id === (int)$user->id];
                    });
                }
            }
            if (Schema::hasTable('v2_referral_coupon_grant')) {
                ReferralCouponGrant::where('user_id', $user->id)->where('status', 'issued')
                    ->where('expires_at', '<', time())->update(['status' => 'expired', 'updated_at' => time()]);
                $grant = ReferralCouponGrant::where('user_id', $user->id)->orderBy('id', 'DESC')->first();
                if ($grant) {
                    $coupon = Coupon::find($grant->coupon_id);
                    $program['newcomer_reward'] = [
                        'status' => $grant->status,
                        'expires_at' => $grant->expires_at,
                        'coupon_code' => $coupon ? $coupon->code : null,
                        'coupon_name' => $coupon ? $coupon->name : null,
                    ];
                }
            }
        }
        return response([
            'data' => [
                'codes' => $codes,
                'stat' => $stat,
                'program' => $program
            ]
        ]);
    }
}
