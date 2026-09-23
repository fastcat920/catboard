<?php

namespace App\Http\Controllers\V1;

use App\Http\Controllers\Controller;
use App\Services\NodeSecurity\ProbeAuthService;
use App\Services\NodeSecurity\ProbeService;
use Illuminate\Http\Request;

class ProbeController extends Controller
{
    public function tasks(Request $request)
    {
        $probe = (new ProbeAuthService())->authenticate($request);
        if (!$probe) abort(401, 'probe authentication failed');
        return response(['data' => ['server_time' => time(), 'tasks' => (new ProbeService())->tasks()]]);
    }

    public function results(Request $request)
    {
        $probe = (new ProbeAuthService())->authenticate($request);
        if (!$probe) abort(401, 'probe authentication failed');
        $request->validate(['results' => 'required|array|max:500']);
        return response(['data' => ['accepted' => (new ProbeService())->storeResults($probe, $request->input('results'))]]);
    }
}
