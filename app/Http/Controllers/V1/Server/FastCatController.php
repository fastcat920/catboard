<?php

namespace App\Http\Controllers\V1\Server;

use App\Http\Controllers\Controller;
use App\Services\FastCatManagedGrants;
use App\Models\ServerV2node;
use App\Jobs\StatServerJob;
use App\Jobs\StatUserJob;
use App\Utils\CacheKey;
use Illuminate\Support\Facades\Cache;
use App\Services\ServerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class FastCatController extends Controller
{
    public function traffic(Request $request, ServerService $servers)
    {
        abort_unless($request->isMethod('POST'), 405);
        $secret = (string) config('v2board.server_token', '');
        abort_unless($secret !== '' && hash_equals($secret, (string) $request->bearerToken()), 403);
        $body = $request->validate([
            'node_id' => 'required|integer|min:1',
            'batch_id' => 'required|regex:/^[a-f0-9]{32}$/D',
            'users' => 'required|array|min:1|max:1000',
            'users.*' => 'required|array|size:2',
            'users.*.*' => 'required|integer|min:0|max:1000000000000000',
        ]);
        $node = $servers->getServer((int) $body['node_id'], 'v2node');
        abort_unless($node && $node['protocol'] === 'fastcat-v2', 404);
        $rate = (float) $node['rate'];
        abort_unless(is_finite($rate) && $rate >= 0 && $rate <= 1000, 422);
        $args = [];
        foreach ($body['users'] as $id => $bytes) {
            abort_unless(preg_match('/^[1-9][0-9]{0,14}$/D', (string) $id)
                && array_keys($bytes) === [0, 1], 422);
            $args[] = (string) $id;
            $args[] = (string) (int) round($bytes[0] * $rate);
            $args[] = (string) (int) round($bytes[1] * $rate);
        }
        $receipt = 'fastcat_v2_traffic:' . $node['id'] . ':' . $body['batch_id'];
        $accepted = Redis::eval(<<<'LUA'
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
for i = 1, #ARGV, 3 do
    local u = tonumber(redis.call('HGET', KEYS[2], ARGV[i]) or '0')
    local d = tonumber(redis.call('HGET', KEYS[3], ARGV[i]) or '0')
    if not u or not d or u + tonumber(ARGV[i+1]) > 9000000000000000000
        or d + tonumber(ARGV[i+2]) > 9000000000000000000 then
        return redis.error_reply('Invalid traffic counter')
    end
end
for i = 1, #ARGV, 3 do
    redis.call('HINCRBY', KEYS[2], ARGV[i], ARGV[i+1])
    redis.call('HINCRBY', KEYS[3], ARGV[i], ARGV[i+2])
end
redis.call('SET', KEYS[1], '1', 'EX', 2592000)
return 1
LUA
            , 3, $receipt, 'v2board_upload_traffic', 'v2board_download_traffic', ...$args);
        if ((int) $accepted === 1) {
            try {
                $info = $node->toArray();
                StatUserJob::dispatch($body['users'], $info, 'v2node', 'd');
                StatServerJob::dispatch($body['users'], $info, 'v2node', 'd');
                Cache::put(CacheKey::get('SERVER_V2NODE_LAST_PUSH_AT', $node['id']), time(), 3600);
            } catch (\Throwable $error) {
                report($error);
            }
        }
        return response()->json(['data' => true], 200, ['Cache-Control' => 'private, no-store']);
    }

    public function grants(Request $request, ServerService $servers)
    {
        abort_unless($request->isMethod('GET'), 405);
        $secret = (string) config('v2board.server_token', '');
        abort_unless($secret !== '' && hash_equals($secret, (string) $request->bearerToken()), 403);
        $params = $request->validate(['node_id' => 'required|integer|min:1']);
        $id = (int) $params['node_id'];
        $node = $servers->getServer($id, 'v2node');
        abort_unless($node && $node['protocol'] === 'fastcat-v2', 404);
        $groups = $node['group_id'] ?? [];
        if (!$node['show']) {
            $childGroups = ServerV2node::where('parent_id', $id)->where('protocol', 'fastcat-v2')
                ->where('show', 1)->get(['group_id'])->pluck('group_id')->flatten()->all();
            $groups = array_values(array_intersect($groups, $childGroups));
        }
        $eligible = $groups ? array_fill_keys($servers->getAvailableUsers($groups)->pluck('id')->all(), true) : [];
        $mode = $request->header('X-FastCat-Transport-Modes') === '1'
            ? ($node['tls_settings']['fastcat_transport_mode'] ?? 'auto') : 'auto';
        return response()->json(FastCatManagedGrants::snapshot($id, $eligible, $mode), 200, ['Cache-Control' => 'private, no-store']);
    }
}
