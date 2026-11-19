<?php

namespace App\Http\Controllers\V1\Server;

use App\Http\Controllers\Controller;
use App\Services\FastCatManagedGrants;
use App\Models\ServerV2node;
use App\Services\ServerService;
use Illuminate\Http\Request;

class FastCatController extends Controller
{
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
