<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\CouponTemplate;
use App\Models\Plan;
use App\Models\ReferralCampaign;
use App\Models\ReferralVisit;
use App\Models\ReferralLeaderboardSetting;
use App\Models\ReferralLevel;
use App\Models\ReferralMilestone;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\User;
use App\Services\ReferralProgramService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ReferralController extends Controller
{
    public function dashboard(Request $request)
    {
        if ($request->boolean('refresh')) Cache::forget('admin_referral_dashboard');
        $data = Cache::remember('admin_referral_dashboard', 30, function () {
            $invitees = User::whereNotNull('invite_user_id')->count();
            $effectiveQuery = ReferralReward::where('reward_type', 'effective_invite')->where('status', 'granted');
            $effective = (clone $effectiveQuery)->count();
            return [
                'setting' => ReferralSetting::current(),
                'registered_invites' => $invitees,
                'effective_invites' => $effective,
                'conversion_rate' => $invitees ? round($effective * 100 / $invitees, 2) : 0,
                'referral_revenue' => (int)Order::whereNotNull('invite_user_id')->where('status', 3)->sum('total_amount'),
                'reward_total' => (int)ReferralReward::whereIn('reward_type', ['balance', 'commission_balance'])->where('status', 'granted')->sum('reward_value'),
                'active_promoters' => (clone $effectiveQuery)->distinct()->count('user_id'),
                'coupon_templates' => CouponTemplate::where('enabled', 1)->orderBy('id', 'DESC')->get(['id', 'name', 'name_en', 'ends_at']),
            ];
        });
        return response(['data' => $data]);
    }

    public function saveSetting(Request $request)
    {
        $data = $request->validate([
            'enabled' => 'required|boolean',
            'first_order_min' => 'required|integer|min:0',
            'invitee_reward' => 'required|integer|min:0',
            'newcomer_coupon_template_id' => 'nullable|integer|exists:v2_coupon_template,id',
            'base_commission_rate' => 'required|integer|min:0|max:100',
            'freeze_days' => 'required|integer|min:0|max:365',
            'monthly_reward_limit' => 'nullable|integer|min:0',
        ]);
        $setting = ReferralSetting::first();
        if ($setting) $setting->update($data);
        else $setting = ReferralSetting::create($data);
        Cache::forget('admin_referral_dashboard');
        return response(['data' => $setting]);
    }

    public function levels()
    {
        return response(['data' => ReferralLevel::orderBy('required_invites')->get()]);
    }

    public function saveLevel(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'name_en' => 'nullable|string|max:100',
            'description' => 'nullable|string|max:255',
            'description_en' => 'nullable|string|max:255',
            'required_invites' => 'required|integer|min:0',
            'commission_rate' => 'required|integer|min:0|max:100',
            'valid_days' => 'required|integer|min:0|max:3650',
            'retain_invites' => 'required|integer|min:0',
            'enabled' => 'required|boolean',
        ]);
        $level = $request->input('id') ? ReferralLevel::findOrFail($request->input('id')) : new ReferralLevel();
        $level->fill($data)->save();
        return response(['data' => $level]);
    }

    public function dropLevel(Request $request)
    {
        $level = ReferralLevel::findOrFail($request->input('id'));
        $result = (bool)$level->delete();
        return response(['data' => $result]);
    }

    public function milestones()
    {
        return response(['data' => ReferralMilestone::orderBy('required_invites')->get()]);
    }

    public function campaigns()
    {
        $campaigns = ReferralCampaign::orderBy('id', 'DESC')->get();
        $campaigns->each(function ($campaign) {
            $rewards = ReferralReward::where('campaign_id', $campaign->id)->whereIn('reward_type', ['balance', 'commission_balance', 'traffic', 'duration'])->where('status', 'granted');
            $campaign->reward_count = (clone $rewards)->count();
            $campaign->reward_users = (clone $rewards)->distinct()->count('user_id');
            $campaign->order_count = ReferralReward::where('campaign_id', $campaign->id)->whereNotNull('order_id')->distinct()->count('order_id');
        });
        return response(['data' => $campaigns, 'plans' => Plan::orderBy('id')->get(['id', 'name'])]);
    }

    public function saveCampaign(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100', 'name_en' => 'nullable|string|max:100',
            'description' => 'nullable|string|max:1000', 'description_en' => 'nullable|string|max:1000',
            'starts_at' => 'required|integer', 'ends_at' => 'required|integer|gt:starts_at',
            'audience' => 'required|in:all,new,existing', 'plan_ids' => 'nullable|array', 'plan_ids.*' => 'integer|exists:v2_plan,id',
            'first_order_min' => 'required|integer|min:0', 'commission_multiplier' => 'required|numeric|min:0|max:10',
            'inviter_reward_type' => 'required|in:none,balance,commission_balance,traffic,duration',
            'inviter_reward_value' => 'required|integer|min:0', 'bonus_required_invites' => 'required|integer|min:0',
            'invitee_reward_type' => 'required|in:none,balance,traffic,duration', 'invitee_reward_value' => 'required|integer|min:0',
            'budget_total' => 'nullable|integer|min:0', 'per_user_limit' => 'nullable|integer|min:1', 'grant_limit' => 'nullable|integer|min:1',
            'enabled' => 'required|boolean',
        ]);
        $campaign = $request->input('id') ? ReferralCampaign::findOrFail($request->input('id')) : new ReferralCampaign();
        $campaign->fill($data)->save();
        return response(['data' => $campaign]);
    }

    public function dropCampaign(Request $request)
    {
        $campaign = ReferralCampaign::findOrFail($request->input('id'));
        if (ReferralReward::where('campaign_id', $campaign->id)->exists()) abort(422, '活动已有奖励流水，请停用活动而不是删除');
        return response(['data' => (bool)$campaign->delete()]);
    }

    public function leaderboard(Request $request)
    {
        $period = $request->input('period', 'month');
        $metric = $request->input('metric', 'invites');
        $from = $period === 'week' ? strtotime('monday this week') : ($period === 'total' ? 0 : strtotime(date('Y-m-01')));
        $effective = ReferralReward::select('user_id', DB::raw('COUNT(*) as invite_count'))->where('reward_type', 'effective_invite')->where('status', 'granted');
        if ($from) $effective->where('created_at', '>=', $from);
        $effective->groupBy('user_id');
        $rows = User::query()->joinSub($effective, 'r', 'r.user_id', '=', 'v2_user.id')
            ->leftJoin('v2_order as o', function ($join) use ($from) { $join->on('o.invite_user_id', '=', 'v2_user.id')->where('o.status', 3); if ($from) $join->where('o.created_at', '>=', $from); })
            ->select('v2_user.id', 'v2_user.email', DB::raw('MAX(r.invite_count) as invite_count'), DB::raw('COALESCE(SUM(o.total_amount),0) as revenue'), DB::raw('COALESCE(SUM(o.commission_balance),0) as income'))
            ->groupBy('v2_user.id', 'v2_user.email')->orderBy($metric === 'revenue' ? 'revenue' : ($metric === 'income' ? 'income' : 'invite_count'), 'DESC')->limit(100)->get();
        return response(['data' => $rows, 'setting' => ReferralLeaderboardSetting::current()]);
    }

    public function saveLeaderboardSetting(Request $request)
    {
        $data = $request->validate(['enabled' => 'required|boolean', 'mask_email' => 'required|boolean', 'reward_rules' => 'nullable|array']);
        $setting = ReferralLeaderboardSetting::current();
        $setting->fill($data)->save();
        return response(['data' => $setting]);
    }

    public function funnel(Request $request)
    {
        $days = min(max((int)$request->input('days', 30), 7), 365);
        $from = strtotime('-' . ($days - 1) . ' days midnight');
        $visits = ReferralVisit::where('created_at', '>=', $from);
        $registrations = User::whereNotNull('invite_user_id')->where('created_at', '>=', $from);
        $firstOrders = Order::whereNotNull('invite_user_id')->where('type', 1)->where('status', 3)->where('created_at', '>=', $from);
        $renewals = Order::whereNotNull('invite_user_id')->where('type', 2)->where('status', 3)->where('created_at', '>=', $from);
        $rewards = ReferralReward::where('created_at', '>=', $from);
        $trend = [];
        for ($i = 0; $i < $days; $i++) {
            $start = $from + $i * 86400; $end = $start + 86400;
            $trend[] = ['date' => date('Y-m-d', $start), 'visits' => (clone $visits)->whereBetween('created_at', [$start, $end - 1])->count(), 'registrations' => (clone $registrations)->whereBetween('created_at', [$start, $end - 1])->count(), 'first_orders' => (clone $firstOrders)->whereBetween('created_at', [$start, $end - 1])->count(), 'renewals' => (clone $renewals)->whereBetween('created_at', [$start, $end - 1])->count()];
        }
        $aggregate = function (array $rows, string $format) {
            return collect($rows)->groupBy(function ($row) use ($format) { return date($format, strtotime($row['date'])); })->map(function ($items, $key) {
                return ['date'=>$key,'visits'=>$items->sum('visits'),'registrations'=>$items->sum('registrations'),'first_orders'=>$items->sum('first_orders'),'renewals'=>$items->sum('renewals')];
            })->values();
        };
        $revenue = (int)(clone $firstOrders)->sum('total_amount');
        $rewardCost = (int)(clone $rewards)->whereIn('reward_type', ['balance', 'commission_balance'])->where('status', 'granted')->sum('reward_value');
        $firstBuyers = (clone $firstOrders)->distinct()->count('user_id');
        $renewalUsers = (clone $renewals)->distinct()->count('user_id');
        return response(['data' => [
            'summary' => ['visits' => (clone $visits)->count(), 'registrations' => (clone $registrations)->count(), 'verified' => config('v2board.email_verify') ? (clone $registrations)->count() : null, 'first_orders' => (clone $firstOrders)->count(), 'renewal_users' => $renewalUsers, 'renewal_rate' => $firstBuyers ? round($renewalUsers * 100 / $firstBuyers, 2) : 0, 'pending_rewards' => (clone $rewards)->where('status', 'pending')->count(), 'reversed_rewards' => (clone $rewards)->where('status', 'reversed')->count(), 'revenue' => $revenue, 'reward_cost' => $rewardCost, 'roi' => $rewardCost ? round(($revenue - $rewardCost) / $rewardCost, 2) : null],
            'trend' => $trend,
            'weekly_trend' => $aggregate($trend, 'o-W'),
            'monthly_trend' => $aggregate($trend, 'Y-m'),
            'channels' => ReferralVisit::where('created_at', '>=', $from)->select('channel', DB::raw('COUNT(*) visits'), DB::raw('COUNT(user_id) registrations'))->groupBy('channel')->orderBy('visits', 'DESC')->get(),
            'plans' => Order::whereNotNull('invite_user_id')->where('type', 1)->where('status', 3)->where('created_at', '>=', $from)->select('plan_id', DB::raw('COUNT(*) orders'), DB::raw('SUM(total_amount) revenue'))->groupBy('plan_id')->orderBy('orders', 'DESC')->get(),
            'campaigns' => ReferralCampaign::select('id', 'name', 'name_en', 'granted_count', 'spent_amount')->orderBy('id', 'DESC')->limit(20)->get(),
        ]]);
    }

    public function saveMilestone(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'required_invites' => 'required|integer|min:1',
            'reward_type' => 'required|in:balance,commission_balance,traffic,duration',
            'reward_value' => 'required|integer|min:1',
            'enabled' => 'required|boolean',
        ]);
        $milestone = $request->input('id') ? ReferralMilestone::findOrFail($request->input('id')) : new ReferralMilestone();
        $milestone->fill($data)->save();
        return response(['data' => $milestone]);
    }

    public function dropMilestone(Request $request)
    {
        $milestone = ReferralMilestone::findOrFail($request->input('id'));
        $result = (bool)$milestone->delete();
        return response(['data' => $result]);
    }

    public function rewards(Request $request)
    {
        $pageSize = min(max((int)$request->input('pageSize', 20), 1), 100);
        $builder = ReferralReward::orderBy('id', 'DESC');
        if ($request->input('status')) $builder->where('status', $request->input('status'));
        if ($request->input('type')) $builder->where('reward_type', $request->input('type'));
        if ($request->input('keyword')) {
            $userIds = User::where('email', 'like', '%' . trim($request->input('keyword')) . '%')->pluck('id');
            $builder->where(function ($query) use ($userIds) {
                $query->whereIn('user_id', $userIds)->orWhereIn('invited_user_id', $userIds);
            });
        }
        if ($request->input('from')) $builder->where('created_at', '>=', strtotime($request->input('from')) ?: 0);
        if ($request->input('to')) $builder->where('created_at', '<', (strtotime($request->input('to')) ?: time()) + 86400);
        $total = $builder->count();
        $rows = $builder->forPage(max((int)$request->input('current', 1), 1), $pageSize)->get();
        $users = User::whereIn('id', $rows->pluck('user_id')->merge($rows->pluck('invited_user_id'))->filter()->unique())
            ->pluck('email', 'id');
        $rows->each(function ($row) use ($users) {
            $row->user_email = $users->get($row->user_id);
            $row->invited_user_email = $users->get($row->invited_user_id);
        });
        return response(['data' => $rows, 'total' => $total]);
    }

    public function reverseReward(Request $request, ReferralProgramService $service)
    {
        $data = $request->validate([
            'id' => 'required|integer',
            'reason' => 'nullable|string|max:200',
        ]);
        $reward = ReferralReward::findOrFail($data['id']);
        if (!$reward->order_id) abort(422, '该流水没有关联订单，无法按订单撤销');
        try {
            $count = $service->reverseOrderRewards((int)$reward->order_id, trim($data['reason'] ?? ''));
        } catch (\RuntimeException $e) {
            abort(422, $e->getMessage());
        }
        return response(['data' => ['reversed' => $count]]);
    }

    public function relations(Request $request)
    {
        $pageSize = min(max((int)$request->input('pageSize', 20), 1), 100);
        $builder = User::whereNotNull('invite_user_id')->orderBy('id', 'DESC');
        if ($request->input('keyword')) {
            $keyword = trim($request->input('keyword'));
            $inviterIds = User::where('email', 'like', '%' . $keyword . '%')->pluck('id');
            $builder->where(function ($query) use ($keyword, $inviterIds) {
                $query->where('email', 'like', '%' . $keyword . '%')->orWhereIn('invite_user_id', $inviterIds);
            });
        }
        if ($request->input('status') === 'effective') {
            $builder->whereIn('id', ReferralReward::where('reward_type', 'effective_invite')->where('status', 'granted')->pluck('invited_user_id'));
        } elseif ($request->input('status') === 'pending') {
            $builder->whereNotIn('id', ReferralReward::where('reward_type', 'effective_invite')->where('status', 'granted')->pluck('invited_user_id'));
        }
        $total = $builder->count();
        $rows = $builder->forPage(max((int)$request->input('current', 1), 1), $pageSize)->get(['id', 'email', 'invite_user_id', 'created_at']);
        $inviters = User::whereIn('id', $rows->pluck('invite_user_id')->unique())->pluck('email', 'id');
        $effectiveIds = ReferralReward::whereIn('invited_user_id', $rows->pluck('id'))->where('reward_type', 'effective_invite')->pluck('invited_user_id')->flip();
        $rows->each(function ($row) use ($inviters, $effectiveIds) {
            $row->inviter_email = $inviters->get($row->invite_user_id);
            $row->effective = $effectiveIds->has($row->id);
        });
        return response(['data' => $rows, 'total' => $total]);
    }

    public function relationDetail(Request $request)
    {
        $user = User::findOrFail($request->input('user_id'));
        $inviter = $user->invite_user_id ? User::find($user->invite_user_id) : null;
        return response(['data' => [
            'user' => $user->only(['id', 'email', 'invite_user_id', 'created_at']),
            'inviter' => $inviter ? $inviter->only(['id', 'email']) : null,
            'orders' => Order::where('user_id', $user->id)->orderBy('id', 'DESC')->limit(20)->get(['id', 'trade_no', 'plan_id', 'total_amount', 'status', 'created_at']),
            'rewards' => ReferralReward::where('invited_user_id', $user->id)->orderBy('id', 'DESC')->get(),
        ]]);
    }

    public function changeRelation(Request $request)
    {
        $data = $request->validate(['user_id' => 'required|integer|exists:v2_user,id', 'inviter_id' => 'nullable|integer|exists:v2_user,id']);
        if ($data['inviter_id'] && (int)$data['inviter_id'] === (int)$data['user_id']) abort(422, '不能邀请自己');
        DB::transaction(function () use ($data) {
            $user = User::where('id', $data['user_id'])->lockForUpdate()->firstOrFail();
            if (ReferralReward::where('invited_user_id', $user->id)->where('status', 'granted')->exists()) {
                abort(422, '该关系已产生有效奖励，请先撤销关联订单奖励');
            }
            if ($data['inviter_id']) {
                $cursor = User::find($data['inviter_id']);
                for ($depth = 0; $cursor && $depth < 100; $depth++) {
                    if ((int)$cursor->id === (int)$user->id) abort(422, '调整后会形成循环邀请关系');
                    $cursor = $cursor->invite_user_id ? User::find($cursor->invite_user_id) : null;
                }
            }
            $user->invite_user_id = $data['inviter_id'] ?: null;
            $user->save();
        });
        Cache::forget('admin_referral_dashboard');
        return response(['data' => true]);
    }
}
