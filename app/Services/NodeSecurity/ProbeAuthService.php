<?php

namespace App\Services\NodeSecurity;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class ProbeAuthService
{
    public function authenticate(Request $request)
    {
        $id = (int)$request->header('X-Probe-Id');
        $timestamp = (int)$request->header('X-Probe-Timestamp');
        $nonce = (string)$request->header('X-Probe-Nonce');
        $signature = (string)$request->header('X-Probe-Signature');
        if (!$id || !$timestamp || strlen($nonce) < 16 || !$signature || abs(time() - $timestamp) > 300) return null;
        $probe = DB::table('v2_security_probe')->where('id', $id)->where('status', 'active')->first();
        if (!$probe || !Cache::add('security_probe_nonce:' . $id . ':' . $nonce, 1, 600)) return null;
        $bodyHash = hash('sha256', (string)$request->getContent());
        $message = strtoupper($request->method()) . "\n" . $request->getPathInfo() . "\n{$timestamp}\n{$nonce}\n{$bodyHash}";
        $expected = hash_hmac('sha256', $message, Crypt::decryptString($probe->secret_encrypted));
        if (!hash_equals($expected, $signature)) return null;
        DB::table('v2_security_probe')->where('id', $id)->update([
            'last_ip' => $request->ip(), 'last_seen_at' => time(),
            'version' => mb_substr((string)$request->header('X-Probe-Version'), 0, 32), 'updated_at' => time(),
        ]);
        return $probe;
    }
}
