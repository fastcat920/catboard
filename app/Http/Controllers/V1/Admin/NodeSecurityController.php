<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthService;
use App\Services\NodeSecurity\ExperimentService;
use App\Services\NodeSecurity\RiskService;
use App\Services\NodeSecurity\SettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NodeSecurityController extends Controller
{
    public function dashboard(Request $request)
    {
        $from = $this->from($request);
        $top = $this->userRankQuery()->orderByDesc('s.risk_score')->limit(10)->get();
        $daily = DB::table('v2_node_access_log')->where('requested_at', '>=', $from)
            ->selectRaw('FROM_UNIXTIME(requested_at, "%Y-%m-%d") as day, COUNT(*) as requests, COUNT(DISTINCT user_id) as users')
            ->groupBy('day')->orderBy('day')->get();
        return response(['data' => [
            'summary' => [
                'requests' => DB::table('v2_node_access_log')->where('requested_at', '>=', $from)->count(),
                'users' => DB::table('v2_node_access_log')->where('requested_at', '>=', $from)->distinct('user_id')->count('user_id'),
                'events' => DB::table('v2_node_block_event')->where('first_failed_at', '>=', $from)->count(),
                'high_risk_users' => DB::table('v2_security_user_score')->where('risk_score', '>=', 70)->count(),
                'unread_alerts' => DB::table('v2_security_alert')->whereNull('read_at')->count(),
                'active_experiments' => DB::table('v2_watermark_experiment')->where('status', 'active')->count(),
            ],
            'daily' => $daily,
            'top_users' => $top,
            'recent_events' => DB::table('v2_node_block_event')->orderByDesc('first_failed_at')->limit(8)->get(),
            'alerts' => DB::table('v2_security_alert')->orderByDesc('created_at')->limit(8)->get(),
        ]]);
    }

    public function events(Request $request)
    {
        $query = DB::table('v2_node_block_event as e')
            ->leftJoin('v2_node_snapshot as s', 's.id', '=', 'e.snapshot_id')
            ->select('e.*', 's.server_name', 's.version as snapshot_version');
        if ($request->filled('status')) $query->where('e.status', $request->input('status'));
        return response(['data' => $query->orderByDesc('e.first_failed_at')->paginate($this->perPage($request))]);
    }

    public function eventDetail(Request $request)
    {
        $event = DB::table('v2_node_block_event')->where('id', $request->input('id'))->first();
        if (!$event) abort(404, '事件不存在');
        $window = (int)(new SettingsService())->get('risk_window_seconds', 300);
        $logs = DB::table('v2_node_access_log as l')->join('v2_user as u', 'u.id', '=', 'l.user_id')
            ->whereBetween('l.requested_at', [max(0, $event->first_failed_at - $window), $event->first_failed_at])
            ->select('l.*', 'u.email')->orderBy('l.requested_at')->get()
            ->filter(function ($log) use ($event) {
                return !$event->snapshot_id || in_array((int)$event->snapshot_id, json_decode($log->snapshot_ids, true) ?: [], true);
            })->values();
        return response(['data' => ['event' => $event, 'access_logs' => $logs]]);
    }

    public function saveEvent(Request $request)
    {
        $request->validate([
            'server_type' => 'required|string|max:32', 'server_id' => 'required|integer|min:1',
            'event_type' => 'nullable|in:blocked,outage,carrier,excluded',
            'status' => 'nullable|in:suspected,confirmed,excluded,resolved',
            'first_failed_at' => 'required|integer', 'snapshot_id' => 'nullable|integer', 'watermark_group_id' => 'nullable|integer',
        ]);
        $now = time();
        $payload = $request->only('server_type', 'server_id', 'snapshot_id', 'watermark_group_id', 'event_type', 'status', 'first_failed_at', 'confirmed_at', 'evidence', 'remark');
        $payload['event_type'] = $payload['event_type'] ?? 'blocked';
        $payload['status'] = $payload['status'] ?? 'suspected';
        $payload['created_by'] = $request->user['id'];
        $payload['created_at'] = $now; $payload['updated_at'] = $now;
        $id = DB::table('v2_node_block_event')->insertGetId($payload);
        (new RiskService())->recompute();
        $this->adminLog($request, 'event.create', 'event', $id, $payload);
        return response(['data' => ['id' => $id]]);
    }

    public function updateEvent(Request $request)
    {
        $request->validate(['id' => 'required|integer', 'status' => 'required|in:suspected,confirmed,excluded,resolved']);
        $data = $request->only('status', 'event_type', 'confirmed_at', 'evidence', 'remark');
        $data = array_filter($data, function ($value) { return $value !== null; });
        if ($data['status'] === 'confirmed' && empty($data['confirmed_at'])) $data['confirmed_at'] = time();
        $data['updated_at'] = time();
        DB::table('v2_node_block_event')->where('id', $request->input('id'))->update($data);
        (new RiskService())->recompute();
        $this->adminLog($request, 'event.update', 'event', $request->input('id'), $data);
        return response(['data' => true]);
    }

    public function users(Request $request)
    {
        $query = $this->userRankQuery();
        if ($request->filled('risk_min')) $query->where('s.risk_score', '>=', (int)$request->input('risk_min'));
        if ($request->filled('status')) $query->where('s.status', $request->input('status'));
        if ($request->filled('search')) $query->where('u.email', 'like', '%' . $request->input('search') . '%');
        return response(['data' => $query->orderByDesc('s.risk_score')->paginate($this->perPage($request))]);
    }

    public function userDetail(Request $request)
    {
        $userId = (int)$request->input('id');
        $user = User::select('id', 'email', 'plan_id', 'group_id', 'banned', 'created_at')->find($userId);
        if (!$user) abort(404, '用户不存在');
        return response(['data' => [
            'user' => $user,
            'score' => DB::table('v2_security_user_score')->where('user_id', $userId)->first(),
            'logs' => DB::table('v2_node_access_log')->where('user_id', $userId)->orderByDesc('requested_at')->limit(100)->get(),
            'groups' => DB::table('v2_watermark_group_user as gu')->join('v2_watermark_group as g', 'g.id', '=', 'gu.group_id')
                ->join('v2_watermark_experiment as e', 'e.id', '=', 'g.experiment_id')->where('gu.user_id', $userId)
                ->select('g.id', 'g.name', 'g.is_control', 'g.server_type', 'g.server_id', 'e.name as experiment_name', 'e.round', 'e.status')->get(),
        ]]);
    }

    public function userAction(Request $request)
    {
        $request->validate(['user_id' => 'required|integer', 'action' => 'required|in:watch,trust,suspend,ban,clear_sessions,recompute']);
        $user = User::find($request->input('user_id'));
        if (!$user) abort(404, '用户不存在');
        $action = $request->input('action');
        if ($action === 'ban') $user->update(['banned' => 1]);
        if ($action === 'clear_sessions') (new AuthService($user))->removeAllSession();
        if ($action === 'recompute') (new RiskService())->recompute($user->id);
        if (in_array($action, ['watch', 'trust', 'suspend'], true)) {
            $now = time();
            DB::table('v2_security_user_score')->updateOrInsert(['user_id' => $user->id], [
                'status' => $action === 'trust' ? 'trusted' : ($action === 'watch' ? 'watching' : 'suspended'),
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        $this->adminLog($request, 'user.' . $action, 'user', $user->id, []);
        return response(['data' => true]);
    }

    public function accessLogs(Request $request)
    {
        $query = DB::table('v2_node_access_log as l')->join('v2_user as u', 'u.id', '=', 'l.user_id')->select('l.*', 'u.email');
        if ($request->filled('user_id')) $query->where('l.user_id', $request->input('user_id'));
        if ($request->filled('endpoint')) $query->where('l.endpoint', $request->input('endpoint'));
        if ($request->filled('ip')) $query->where('l.request_ip', $request->input('ip'));
        return response(['data' => $query->orderByDesc('l.requested_at')->paginate($this->perPage($request))]);
    }

    public function snapshots(Request $request)
    {
        $query = DB::table('v2_node_snapshot')->select('id', 'version', 'server_type', 'server_id', 'server_name', 'host_hash', 'port', 'published_at');
        return response(['data' => $query->orderByDesc('published_at')->paginate($this->perPage($request))]);
    }

    public function experiments(Request $request)
    {
        $experiments = DB::table('v2_watermark_experiment')->orderByDesc('created_at')->get();
        foreach ($experiments as $experiment) {
            $experiment->groups = DB::table('v2_watermark_group as g')->where('experiment_id', $experiment->id)
                ->select('g.*')->get()->map(function ($group) {
                    $group->user_count = DB::table('v2_watermark_group_user')->where('group_id', $group->id)->count();
                    unset($group->watermark_host_encrypted);
                    return $group;
                });
        }
        return response(['data' => $experiments]);
    }

    public function createExperiment(Request $request)
    {
        $request->validate(['name' => 'required|string|max:255', 'groups' => 'required|array|min:1', 'user_ids' => 'required|array|min:1']);
        $id = (new ExperimentService())->create($request->all(), $request->user['id']);
        $this->adminLog($request, 'experiment.create', 'experiment', $id, ['name' => $request->input('name')]);
        return response(['data' => ['id' => $id]]);
    }

    public function splitExperiment(Request $request)
    {
        $request->validate(['group_id' => 'required|integer', 'name' => 'required|string', 'groups' => 'required|array|min:2']);
        $id = (new ExperimentService())->split((int)$request->input('group_id'), $request->all(), $request->user['id']);
        $this->adminLog($request, 'experiment.split', 'experiment', $id, ['source_group' => $request->input('group_id')]);
        return response(['data' => ['id' => $id]]);
    }

    public function updateExperiment(Request $request)
    {
        $request->validate(['id' => 'required|integer', 'status' => 'required|in:draft,active,paused,completed']);
        $data = ['status' => $request->input('status'), 'updated_at' => time()];
        if ($data['status'] === 'active') $data['started_at'] = time();
        if ($data['status'] === 'completed') $data['ended_at'] = time();
        DB::table('v2_watermark_experiment')->where('id', $request->input('id'))->update($data);
        $this->adminLog($request, 'experiment.update', 'experiment', $request->input('id'), $data);
        return response(['data' => true]);
    }

    public function settings(Request $request) { return response(['data' => (new SettingsService())->all()]); }

    public function saveSettings(Request $request)
    {
        $settings = (new SettingsService())->save($request->all());
        $this->adminLog($request, 'settings.update', 'settings', null, $request->all());
        return response(['data' => $settings]);
    }

    public function alerts(Request $request)
    {
        return response(['data' => DB::table('v2_security_alert')->orderByDesc('created_at')->paginate($this->perPage($request))]);
    }

    public function readAlert(Request $request)
    {
        DB::table('v2_security_alert')->where('id', $request->input('id'))->update(['read_at' => time()]);
        return response(['data' => true]);
    }

    private function userRankQuery()
    {
        return DB::table('v2_security_user_score as s')->join('v2_user as u', 'u.id', '=', 's.user_id')
            ->select('s.*', 'u.email', 'u.plan_id', 'u.banned', 'u.created_at as registered_at');
    }

    private function from(Request $request): int { return time() - max(1, min(90, (int)$request->input('days', 7))) * 86400; }
    private function perPage(Request $request): int { return max(10, min(100, (int)$request->input('per_page', 25))); }

    private function adminLog(Request $request, string $action, ?string $targetType, $targetId, array $payload): void
    {
        DB::table('v2_security_admin_log')->insert([
            'admin_id' => $request->user['id'], 'action' => $action, 'target_type' => $targetType,
            'target_id' => $targetId === null ? null : (string)$targetId,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE), 'request_ip' => $request->ip(), 'created_at' => time(),
        ]);
    }
}
