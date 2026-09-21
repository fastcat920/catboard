<?php

namespace App\Http\Controllers\V1\User;

use App\Http\Controllers\Controller;
use App\Models\CommissionLog;
use App\Models\CommissionLedger;
use App\Models\InviteCode;
use App\Models\Order;
use App\Models\User;
use App\Models\ReferralLevel;
use App\Models\ReferralMilestone;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\UserCoupon;
use App\Services\ReferralProgramService;
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
        $current = max((int)$request->input('current', 1), 1);
        $pageSize = min(max((int)$request->input('page_size', 10), 10), 100);
        if (Schema::hasTable('v2_commission_ledger')) {
            $builder = CommissionLedger::where('user_id', $request->user['id'])->orderBy('created_at', 'DESC')->orderBy('id', 'DESC');
            $type = $request->input('type');
            if ($type === 'income') $builder->whereIn('type', ['commission_income', 'reward_income']);
            elseif ($type === 'transfer') $builder->where('type', 'transfer_out');
            elseif ($type === 'withdrawal') $builder->whereIn('type', ['withdrawal', 'withdrawal_refund']);
            elseif ($type === 'reversal') $builder->where('type', 'commission_reversal');
            $total = $builder->count();
            return response([
                'data' => $builder->forPage($current, $pageSize)->get(),
                'total' => $total,
            ]);
        }

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
        $details = $builder->forPage($current, $pageSize)->get()->map(function ($row) {
            return [
                'id' => $row->id,
                'type' => 'commission_income',
                'amount' => (int)$row->get_amount,
                'balance_before' => null,
                'balance_after' => null,
                'status' => 'completed',
                'trade_no' => $row->trade_no,
                'description' => '邀请订单返佣',
                'meta' => ['order_amount' => (int)$row->order_amount],
                'created_at' => $row->created_at,
            ];
        });
        return response([
            'data' => $details,
            'total' => $total
        ]);
    }

    public function users(Request $request)
    {
        $current = max((int)$request->input('current', 1), 1);
        $pageSize = min(max((int)$request->input('page_size', 10), 10), 100);
        $builder = User::where('invite_user_id', $request->user['id'])->orderBy('created_at', 'DESC')->orderBy('id', 'DESC');
        $total = $builder->count();
        $rows = $builder->forPage($current, $pageSize)->get(['id', 'email', 'created_at']);

        if (Schema::hasTable('v2_referral_reward')) {
            $effectiveIds = ReferralReward::whereIn('invited_user_id', $rows->pluck('id'))
                ->where('reward_type', 'effective_invite')->where('status', 'granted')
                ->pluck('invited_user_id')->mapWithKeys(function ($id) { return [(int)$id => true]; });
        } else {
            $effectiveIds = Order::whereIn('user_id', $rows->pluck('id'))->where('invite_user_id', $request->user['id'])
                ->where('status', 3)->pluck('user_id')->mapWithKeys(function ($id) { return [(int)$id => true]; });
        }

        return response([
            'data' => $rows->map(function ($row) use ($effectiveIds) {
                return [
                    'id' => $row->id,
                    'email' => $this->maskEmail((string)$row->email),
                    'created_at' => $row->created_at,
                    'status' => $effectiveIds->has((int)$row->id) ? 'effective' : 'pending',
                ];
            })->values(),
            'total' => $total,
        ]);
    }

    private function maskEmail(string $email): string
    {
        if (strpos($email, '@') === false) return $email ? substr($email, 0, 1) . '***' : '-';
        [$prefix, $domain] = explode('@', $email, 2);
        return substr($prefix, 0, 1) . '***@' . $domain;
    }

    public function fetch(Request $request)
    {
        $codes = InviteCode::where('user_id', $request->user['id'])
            ->where('status', 0)
            ->get();
        $user = User::find($request->user['id']);
        $commission_rate = app(ReferralProgramService::class)->commissionRate($user);
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
            $referralRevenue = (int)Order::where('invite_user_id', $user->id)->where('status', 3)->sum('total_amount');
            $assignedLevelValid = $user->referral_level_id && (!$user->referral_level_expires_at || $user->referral_level_expires_at > time());
            $level = $assignedLevelValid
                ? ReferralLevel::where('id', $user->referral_level_id)->where('enabled', 1)->first()
                : null;
            if (!$level) {
                $level = ReferralLevel::where('enabled', 1)
                    ->where('required_invites', '<=', $effectiveCount)
                    ->where('required_revenue', '<=', $referralRevenue)
                    ->orderBy('sort', 'DESC')->orderBy('id', 'DESC')->first();
            }
            $currentLevelSort = $level ? (int)$level->sort : 0;
            $nextLevel = ReferralLevel::where('enabled', 1)
                ->where('sort', '>', $currentLevelSort)
                ->orderBy('sort')->orderBy('id')->first();
            $nextMilestone = ReferralMilestone::where('enabled', 1)->where('required_invites', '>', $effectiveCount)
                ->orderBy('required_invites')->first();
            $program = [
                'setting' => $setting,
                'effective_invites' => $effectiveCount,
                'referral_revenue' => $referralRevenue,
                'commission_rate' => (int)$commission_rate,
                'level' => $level,
                'level_expires_at' => $user->referral_level_expires_at,
                'next_level' => $nextLevel,
                'next_milestone' => $nextMilestone,
                'recent_rewards' => ReferralReward::where('user_id', $user->id)->where('reward_type', '!=', 'effective_invite')
                    ->orderBy('id', 'DESC')->limit(10)->get(),
            ];
            if (Schema::hasTable('v2_user_coupon')) {
                $grant = UserCoupon::with('template')->where('user_id', $user->id)->where('source', 'referral_newcomer')->orderBy('id', 'DESC')->first();
                if ($grant) $program['newcomer_reward'] = ['status'=>$grant->status,'expires_at'=>$grant->expires_at,'coupon_name'=>$grant->template?$grant->template->name:null];
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
