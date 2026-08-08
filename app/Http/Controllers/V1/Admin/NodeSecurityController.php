<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthService;
use App\Services\NodeSecurity\ExperimentService;
use App\Services\NodeSecurity\EventWindowService;
use App\Services\NodeSecurity\RiskService;
use App\Services\NodeSecurity\SettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use App\Utils\Helper;

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
        $eventEvidence = json_decode($event->evidence ?? '', true) ?: [];
        $event->detected_at = isset($eventEvidence['detected_at']) ? (int)$eventEvidence['detected_at'] : null;
        $snapshot = $event->snapshot_id
            ? DB::table('v2_node_snapshot')->select('id', 'version', 'server_type', 'server_id', 'server_name', 'published_at')->where('id', $event->snapshot_id)->first()
            : null;
        $window = (int)(new SettingsService())->get('risk_window_seconds', 300);
        $eventWindow = (new EventWindowService())->calculate($event, $window);
        $logs = collect();
        if ($event->snapshot_id) {
            $logs = DB::table('v2_node_access_log as l')->join('v2_user as u', 'u.id', '=', 'l.user_id')
                ->whereBetween('l.requested_at', [$eventWindow['start_at'], $eventWindow['end_at']])
                ->select('l.*', 'u.email')->orderBy('l.requested_at')->get()
                ->filter(function ($log) use ($event) {
                    return in_array((int)$event->snapshot_id, json_decode($log->snapshot_ids, true) ?: [], true);
                })->values()->map(function ($log) use ($event) {
                    $log->seconds_before_failure = max(0, (int)$event->first_failed_at - (int)$log->requested_at);
                    return $log;
                });
        }
        $candidates = $logs->groupBy('user_id')->map(function ($items) {
            $closest = $items->sortBy('seconds_before_failure')->first();
            return [
                'user_id' => (int)$closest->user_id,
                'email' => $closest->email,
                'access_count' => $items->count(),
                'first_access_at' => (int)$items->min('requested_at'),
                'last_access_at' => (int)$items->max('requested_at'),
                'closest_seconds' => (int)$items->min('seconds_before_failure'),
                'unique_ips' => $items->pluck('request_ip')->filter()->unique()->count(),
                'unique_devices' => $items->pluck('device_hash')->filter()->unique()->count(),
            ];
        })->sortBy('closest_seconds')->values();
        return response(['data' => [
            'event' => $event,
            'snapshot' => $snapshot,
            'evidence' => [
                'snapshot_linked' => !empty($event->snapshot_id),
                'level' => $event->snapshot_id ? 'exact_snapshot' : 'network_only',
                'message' => $event->snapshot_id
                    ? '候选用户仅包含访问记录中精确命中该节点快照的用户'
                    : '事件未关联节点下发快照，无法证明任何用户获取过该节点',
            ],
            'summary' => [
                'window_seconds' => $eventWindow['effective_seconds'],
                'configured_window_seconds' => $eventWindow['configured_seconds'],
                'window_start_at' => $eventWindow['start_at'],
                'window_end_at' => $eventWindow['end_at'],
                'window_source' => $eventWindow['source'],
                'has_monitoring_baseline' => $eventWindow['has_baseline'],
                'access_count' => $logs->count(),
                'user_count' => $logs->pluck('user_id')->unique()->count(),
                'unique_ips' => $logs->pluck('request_ip')->filter()->unique()->count(),
                'first_access_at' => $logs->count() ? (int)$logs->min('requested_at') : null,
                'last_access_at' => $logs->count() ? (int)$logs->max('requested_at') : null,
            ],
            'candidates' => $candidates,
            'access_logs' => $logs,
        ]]);
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
        if (empty($payload['snapshot_id'])) {
            $snapshotQuery = DB::table('v2_node_snapshot')
                ->where('server_type', $payload['server_type'])
                ->where('server_id', $payload['server_id'])
                ->where('published_at', '<=', $payload['first_failed_at']);
            if (!empty($payload['watermark_group_id'])) {
                $snapshotQuery->where('watermark_group_id', $payload['watermark_group_id']);
            } else {
                $snapshotQuery->whereNull('watermark_group_id');
            }
            $payload['snapshot_id'] = $snapshotQuery->orderByDesc('published_at')->value('id');
        }
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
        if ($request->filled('risk_max')) $query->where('s.risk_score', '<=', (int)$request->input('risk_max'));
        if ($request->filled('status')) $query->where('s.status', $request->input('status'));
        if ($request->filled('search')) $query->where('u.email', 'like', '%' . $request->input('search') . '%');
        if ($request->filled('event_hits_min')) $query->where('s.event_hits', '>=', (int)$request->input('event_hits_min'));
        if ($request->filled('watermark_hits_min')) $query->where('s.watermark_hits', '>=', (int)$request->input('watermark_hits_min'));
        if ($request->filled('banned')) $query->where('u.banned', (int)$request->boolean('banned'));
        if ($request->filled('plan_id')) $query->where('u.plan_id', (int)$request->input('plan_id'));
        $sorts = [
            'risk_score' => 's.risk_score', 'event_hits' => 's.event_hits', 'early_access_hits' => 's.early_access_hits',
            'watermark_hits' => 's.watermark_hits', 'unique_ips' => 's.unique_ips', 'unique_devices' => 's.unique_devices',
            'last_risk_at' => 's.last_risk_at', 'registered_at' => 'u.created_at',
        ];
        $sort = $sorts[$request->input('sort_by')] ?? 's.risk_score';
        $direction = $request->input('sort_order') === 'asc' ? 'asc' : 'desc';
        return response(['data' => $query->orderBy($sort, $direction)->orderByDesc('s.user_id')->paginate($this->perPage($request))]);
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
        if ($request->filled('search')) $query->where('u.email', 'like', '%' . $request->input('search') . '%');
        if ($request->filled('endpoint')) $query->where('l.endpoint', $request->input('endpoint'));
        if ($request->filled('ip')) $query->where('l.request_ip', $request->input('ip'));
        if ($request->filled('response_status')) $query->where('l.response_status', (int)$request->input('response_status'));
        if ($request->filled('duration_min')) $query->where('l.duration_ms', '>=', (int)$request->input('duration_min'));
        if ($request->filled('duration_max')) $query->where('l.duration_ms', '<=', (int)$request->input('duration_max'));
        if ($request->filled('date_from')) $query->where('l.requested_at', '>=', (int)$request->input('date_from'));
        if ($request->filled('date_to')) $query->where('l.requested_at', '<=', (int)$request->input('date_to'));
        $sorts = [
            'requested_at' => 'l.requested_at', 'duration_ms' => 'l.duration_ms', 'response_bytes' => 'l.response_bytes',
            'response_status' => 'l.response_status', 'user_id' => 'l.user_id',
        ];
        $sort = $sorts[$request->input('sort_by')] ?? 'l.requested_at';
        $direction = $request->input('sort_order') === 'asc' ? 'asc' : 'desc';
        return response(['data' => $query->orderBy($sort, $direction)->orderByDesc('l.id')->paginate($this->perPage($request))]);
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

    public function readAllAlerts(Request $request)
    {
        $affected = DB::table('v2_security_alert')->whereNull('read_at')->update(['read_at' => time()]);
        $this->adminLog($request, 'alert.read_all', 'security_alert', null, ['affected' => $affected]);
        return response(['data' => ['affected' => $affected]]);
    }

    public function probes(Request $request)
    {
        return response(['data' => DB::table('v2_security_probe')
            ->select('id', 'name', 'region', 'carrier', 'status', 'last_ip', 'version', 'last_seen_at', 'created_at')
            ->orderByDesc('created_at')->get()]);
    }

    public function createProbe(Request $request)
    {
        $request->validate(['name' => 'required|string|max:96', 'region' => 'required|string|max:32', 'carrier' => 'required|string|max:32']);
        $secret = Helper::guid() . Helper::guid(); $now = time();
        $id = DB::table('v2_security_probe')->insertGetId([
            'name' => $request->input('name'), 'region' => strtoupper($request->input('region')),
            'carrier' => strtolower($request->input('carrier')), 'secret_hash' => hash('sha256', $secret),
            'secret_encrypted' => Crypt::encryptString($secret), 'status' => 'active',
            'created_by' => $request->user['id'], 'created_at' => $now, 'updated_at' => $now,
        ]);
        $this->adminLog($request, 'probe.create', 'probe', $id, ['name' => $request->input('name')]);
        $binaryPath = public_path('downloads/node-security-probe-linux-amd64');
        $binaryUrl = rtrim(url('/'), '/') . '/downloads/node-security-probe-linux-amd64';
        $checksum = is_file($binaryPath) ? hash_file('sha256', $binaryPath) : '';
        $download = 'curl -fsSL ' . escapeshellarg($binaryUrl) . ' -o /tmp/node-security-probe';
        $verify = $checksum ? ' && echo ' . escapeshellarg($checksum . '  /tmp/node-security-probe') . ' | sha256sum -c -' : '';
        $install = ' && chmod +x /tmp/node-security-probe && sudo /tmp/node-security-probe install --panel=' . escapeshellarg(rtrim(url('/'), '/')) . ' --id=' . $id . ' --secret=' . escapeshellarg($secret);
        return response(['data' => [
            'id' => $id, 'secret' => $secret,
            'install_command' => $download . $verify . $install,
        ]]);
    }

    public function updateProbe(Request $request)
    {
        $request->validate(['id' => 'required|integer', 'status' => 'required|in:active,paused,revoked']);
        DB::table('v2_security_probe')->where('id', $request->input('id'))->update(['status' => $request->input('status'), 'updated_at' => time()]);
        $this->adminLog($request, 'probe.update', 'probe', $request->input('id'), ['status' => $request->input('status')]);
        return response(['data' => true]);
    }

    public function editProbe(Request $request)
    {
        $request->validate([
            'id' => 'required|integer|min:1',
            'name' => 'required|string|max:96',
            'region' => 'required|in:CN,HK,US,SG,JP',
            'carrier' => 'required|in:telecom,unicom,mobile,overseas,unknown',
        ]);
        $probe = DB::table('v2_security_probe')->where('id', $request->input('id'))->first();
        if (!$probe) abort(404, '探测点不存在或已被删除');
        $data = [
            'name' => trim($request->input('name')),
            'region' => strtoupper($request->input('region')),
            'carrier' => strtolower($request->input('carrier')),
            'updated_at' => time(),
        ];
        DB::table('v2_security_probe')->where('id', $probe->id)->update($data);
        $this->adminLog($request, 'probe.edit', 'probe', $probe->id, [
            'before' => ['name' => $probe->name, 'region' => $probe->region, 'carrier' => $probe->carrier],
            'after' => $data,
        ]);
        return response(['data' => true]);
    }

    public function deleteProbe(Request $request)
    {
        $request->validate([
            'id' => 'required|integer|min:1',
            'name' => 'required|string|max:96',
            'delete_results' => 'required|boolean',
        ]);
        $probe = DB::table('v2_security_probe')->where('id', $request->input('id'))->first();
        if (!$probe) abort(404, '探测点不存在或已被删除');
        if ($probe->status !== 'paused') abort(422, '探测点必须先暂停才能删除');
        if (!hash_equals((string)$probe->name, (string)$request->input('name'))) abort(422, '探测点名称不匹配');

        $deleteResults = $request->boolean('delete_results');
        DB::transaction(function () use ($probe, $deleteResults) {
            if ($deleteResults) {
                DB::table('v2_security_probe_result')->where('probe_id', $probe->id)->delete();
            } else {
                DB::table('v2_security_probe_result')->where('probe_id', $probe->id)->update(['probe_id' => null]);
            }
            DB::table('v2_security_probe')->where('id', $probe->id)->delete();
        });
        $this->adminLog($request, 'probe.delete', 'probe', $probe->id, [
            'name' => $probe->name,
            'delete_results' => $deleteResults,
        ]);
        return response(['data' => true]);
    }

    public function nodeStates(Request $request)
    {
        $servers = collect((new \App\Services\ServerService())->getAllServers())->mapWithKeys(function ($server) {
            return [($server['type'] ?? '') . ':' . ($server['id'] ?? '') => $server];
        });
        $stateMap = DB::table('v2_security_node_state')->get()->mapWithKeys(function ($state) {
            return [$state->server_type . ':' . $state->server_id => $state];
        });
        $targets = DB::table('v2_security_probe_target')->orderByDesc('created_at')->get()->map(function ($target) use ($servers, $stateMap) {
            $key = $target->server_type . ':' . $target->server_id;
            $server = $servers->get($key);
            $state = $stateMap->get($key);
            return (object)[
                'target_id' => $target->id,
                'target_status' => $target->status,
                'server_type' => $target->server_type,
                'server_id' => $target->server_id,
                'server_name' => $server['name'] ?? '源节点已删除',
                'server_address' => $server
                    ? $this->formatServerAddress((string)($server['host'] ?? ''), (string)($server['port'] ?? ''))
                    : '-',
                'source_available' => (bool)$server,
                'status' => $state->status ?? 'waiting_first_probe',
                'domestic_ok' => $state->domestic_ok ?? 0,
                'domestic_failed' => $state->domestic_failed ?? 0,
                'overseas_ok' => $state->overseas_ok ?? 0,
                'overseas_failed' => $state->overseas_failed ?? 0,
                'consecutive_failures' => $state->consecutive_failures ?? 0,
                'first_healthy_at' => $state->first_healthy_at ?? null,
                'last_checked_at' => $state->last_checked_at ?? null,
                'last_analyzed_at' => $state->updated_at ?? null,
            ];
        });
        return response(['data' => $targets]);
    }

    public function probeTargetCandidates(Request $request)
    {
        $monitored = DB::table('v2_security_probe_target')->get()->mapWithKeys(function ($target) {
            return [$target->server_type . ':' . $target->server_id => $target->status];
        });
        $servers = collect((new \App\Services\ServerService())->getAllServers())
            ->filter(function ($server) { return $this->probeCompatible($server); })
            ->map(function ($server) use ($monitored) {
                $key = $server['type'] . ':' . $server['id'];
                return [
                    'server_type' => $server['type'],
                    'server_id' => (int)$server['id'],
                    'server_name' => $server['name'] ?? '未命名节点',
                    'port' => (string)$server['port'],
                    'monitored_status' => $monitored->get($key),
                ];
            })->sortBy('server_name')->values();
        return response(['data' => $servers]);
    }

    public function batchProbeTargets(Request $request)
    {
        $request->validate([
            'action' => 'required|in:add,pause,resume,remove',
            'targets' => 'required|array|min:1|max:500',
            'targets.*.server_type' => 'required|string|max:32',
            'targets.*.server_id' => 'required|integer|min:1',
        ]);
        $action = $request->input('action');
        $targets = collect($request->input('targets'))->unique(function ($target) {
            return $target['server_type'] . ':' . $target['server_id'];
        })->values();
        if ($action === 'add') {
            $valid = collect((new \App\Services\ServerService())->getAllServers())
                ->filter(function ($server) { return $this->probeCompatible($server); })
                ->mapWithKeys(function ($server) { return [$server['type'] . ':' . $server['id'] => true]; });
            foreach ($targets as $target) {
                if (!$valid->has($target['server_type'] . ':' . $target['server_id'])) abort(422, '包含不存在、未启用或不支持 TCP 探测的节点');
            }
        }
        $now = time();
        DB::transaction(function () use ($targets, $action, $request, $now) {
            foreach ($targets as $target) {
                $where = ['server_type' => $target['server_type'], 'server_id' => (int)$target['server_id']];
                if ($action === 'add') {
                    DB::table('v2_security_probe_target')->updateOrInsert($where, [
                        'status' => 'active', 'created_by' => $request->user['id'], 'created_at' => $now, 'updated_at' => $now,
                    ]);
                } elseif ($action === 'remove') {
                    DB::table('v2_security_probe_target')->where($where)->delete();
                    DB::table('v2_security_node_state')->where($where)->delete();
                } else {
                    DB::table('v2_security_probe_target')->where($where)->update([
                        'status' => $action === 'pause' ? 'paused' : 'active', 'updated_at' => $now,
                    ]);
                }
            }
        });
        $this->adminLog($request, 'probe_target.' . $action, 'probe_target', null, ['targets' => $targets->all()]);
        return response(['data' => ['affected' => $targets->count()]]);
    }

    public function probeResults(Request $request)
    {
        $query = DB::table('v2_security_probe_result as r')->leftJoin('v2_security_probe as p', 'p.id', '=', 'r.probe_id')
            ->select('r.*', 'p.name as probe_name');
        if ($request->filled('server_type')) $query->where('r.server_type', $request->input('server_type'));
        if ($request->filled('server_id')) $query->where('r.server_id', $request->input('server_id'));
        return response(['data' => $query->orderByDesc('r.checked_at')->paginate($this->perPage($request))]);
    }

    private function userRankQuery()
    {
        return DB::table('v2_security_user_score as s')->join('v2_user as u', 'u.id', '=', 's.user_id')
            ->select('s.*', 'u.email', 'u.plan_id', 'u.banned', 'u.created_at as registered_at');
    }

    private function probeCompatible(array $server): bool
    {
        if (empty($server['show']) || empty($server['host']) || empty($server['port'])) return false;
        if (in_array($server['type'] ?? '', ['tuic', 'hysteria'], true)) return false;
        if (($server['type'] ?? '') === 'v2node' && in_array($server['protocol'] ?? '', ['tuic', 'hysteria'], true)) return false;
        $port = (string)$server['port'];
        return strpos($port, '-') === false && ctype_digit($port);
    }

    private function formatServerAddress(string $host, string $port): string
    {
        if ($host === '') return '-';
        if (strpos($host, ':') !== false && substr($host, 0, 1) !== '[') $host = '[' . $host . ']';
        return $port === '' ? $host : $host . ':' . $port;
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
