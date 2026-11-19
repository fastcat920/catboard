<?php

namespace App\Http\Controllers\V1\Server;

use App\Http\Controllers\Controller;
use App\Services\FastCatManagedGrants;
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
        $eligible = $node['show'] ? array_fill_keys($servers->getAvailableUsers($node['group_id'])->pluck('id')->all(), true) : [];
        return response()->json(FastCatManagedGrants::snapshot($id, $eligible), 200, ['Cache-Control' => 'private, no-store']);
    }
}
