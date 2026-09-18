<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\ReferralLevel;
use App\Models\ReferralMilestone;
use App\Models\ReferralReward;
use App\Models\ReferralSetting;
use App\Models\User;
use App\Services\ReferralProgramService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

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
            'required_invites' => 'required|integer|min:0',
            'commission_rate' => 'required|integer|min:0|max:100',
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

    public function saveMilestone(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'required_invites' => 'required|integer|min:1',
            'reward_type' => 'required|in:balance,commission_balance',
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
}
