<?php

namespace App\Http\Controllers\V1\Admin\Server;

use App\Http\Controllers\Controller;
use App\Models\ServerV2node;
use Illuminate\Http\Request;
use ParagonIE_Sodium_Compat as SodiumCompat;
use App\Utils\Helper;
use App\Services\FCNCertificate;

class V2nodeController extends Controller
{
    public function save(Request $request)
    {
        $params = $request->validate([
            'group_id' => 'required',
            'route_id' => 'nullable|array',
            'name' => 'required',
            'parent_id' => 'nullable|integer',
            'host' => 'required',
            'listen_ip' => 'nullable',
            'port' => 'required',
            'server_port' => 'required',
            'protocol' => 'required|in:shadowsocks,vmess,vless,trojan,tuic,hysteria2,anytls,fcn-v1,fcn-v2,fcn-v3',
            'tls' => 'required|in:0,1,2',
            'tls_settings' => 'nullable|array',
            'flow' => 'nullable|in:xtls-rprx-vision',
            'network' => 'required|in:tcp,ws,grpc,http,httpupgrade,xhttp',
            'network_settings' => 'nullable|array',
            'trusted_x_forwarded_for' => 'nullable|array',
            'encryption' => 'nullable',
            'encryption_settings' => 'nullable|array',
            'disable_sni' => 'required|in:0,1',
            'udp_relay_mode' => 'nullable',
            'zero_rtt_handshake' => 'required|in:0,1',
            'congestion_control' => 'nullable',
            'cipher' => 'nullable',
            'up_mbps' => 'nullable|numeric',
            'down_mbps' => 'nullable|numeric',
            'obfs' => 'nullable',
            'obfs_password' => 'nullable',
            'padding_scheme' => 'nullable',
            'tags' => 'nullable|array',
            'rate' => 'required',
            'show' => 'nullable|in:0,1',
            'sort' => 'nullable'
        ]);
        $legacyFCN = in_array($params['protocol'], ['fcn-v1', 'fcn-v2'], true);
        $isFCNV3 = $params['protocol'] === 'fcn-v3';
        if ($legacyFCN || $isFCNV3) {
            $rules = [
                'tls_settings.fcn_trust_mode' => $legacyFCN ? 'nullable|in:ca,spki' : 'nullable|in:ca',
                'tls_settings.fcn_rotate_key' => 'nullable|boolean',
                'tls_settings.server_name' => 'nullable|string|max:253',
                'host' => 'required|string|max:253',
                'port' => 'required|integer|min:1|max:65535',
                'server_port' => 'required|integer|min:1|max:65535',
            ];
            if ($isFCNV3) {
                $rules['listen_ip'] = 'nullable|ip';
            }
            $request->validate($rules);
            $settings = $params['tls_settings'] ?? [];
            if ($isFCNV3) {
                foreach ([$params['host'], $settings['server_name'] ?? ''] as $name) {
                    if ($name !== '' && !filter_var($name, FILTER_VALIDATE_IP)
                        && !filter_var($name, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) {
                        abort(422, 'FCN v3 的连接地址和 SNI 必须是有效的域名或 IP。');
                    }
                }
            }

            if ($legacyFCN && ($settings['fcn_trust_mode'] ?? 'ca') === 'spki') {
                $existing = $request->input('id') ? ServerV2node::find($request->input('id')) : null;
                $old = $existing ? ($existing->tls_settings ?? []) : [];
                // Preserve managed keys from the stored node only.
                try {
                    $name = trim($settings['server_name'] ?? '') ?: $params['host'];
                    $settings = FCNCertificate::forSave([], $old, $name, (bool) ($settings['fcn_rotate_key'] ?? false));
                } catch (\InvalidArgumentException $e) {
                    abort(422, $e->getMessage());
                }
            } else {
                $request->validate([
                    'tls_settings.cert_mode' => $legacyFCN ? 'required|in:file,http,dns,remote' : 'required|in:file,http,dns',
                    'tls_settings.cert_file' => 'required_if:tls_settings.cert_mode,file|nullable|string|starts_with:/',
                    'tls_settings.key_file' => 'required_if:tls_settings.cert_mode,file|nullable|string|starts_with:/',
                    'tls_settings.tls_cert' => 'required_if:tls_settings.cert_mode,remote|nullable|string',
                    'tls_settings.tls_key' => 'required_if:tls_settings.cert_mode,remote|nullable|string',
                    'tls_settings.provider' => 'required_if:tls_settings.cert_mode,dns|nullable|string|regex:/\A[a-z0-9_-]+\z/',
                    'tls_settings.dns_env' => 'nullable|string',
                ], [
                    'tls_settings.cert_mode.required' => 'FCN 需要选择可信证书模式。',
                    'tls_settings.cert_mode.in' => '请选择此 FCN 协议支持的证书模式。',
                    'tls_settings.cert_file.required_if' => '请填写已有证书链的绝对路径。',
                    'tls_settings.key_file.required_if' => '请填写已有私钥的绝对路径。',
                    'tls_settings.provider.required_if' => '请填写 DNS 服务商。',
                    'tls_settings.provider.regex' => '请填写有效的 DNS 服务商代码。',
                ]);
                try {
                    $settings = FCNCertificate::caSettingsForSave($settings, $params['host']);
                } catch (\InvalidArgumentException $e) {
                    abort(422, $e->getMessage());
                }
            }
            $params['tls_settings'] = $settings;
        }
        if ($isFCNV3) {
            $params['listen_ip'] = $params['listen_ip'] ?? '0.0.0.0';
            $params['cipher'] = null;
            $params['obfs'] = null;
            $params['udp_relay_mode'] = null;
            $params['up_mbps'] = 0;
            $params['down_mbps'] = 0;
        }
        if ($legacyFCN || $isFCNV3) {
            $params['tls'] = 1;
            $params['network'] = 'tcp'; // Database field. FCN transports use QUIC over UDP.
            $params['flow'] = null;
            $params['network_settings'] = null;
            $params['trusted_x_forwarded_for'] = null;
            $params['encryption'] = null;
            $params['encryption_settings'] = null;
            $params['disable_sni'] = 0;
            $params['zero_rtt_handshake'] = 0;
            $params['congestion_control'] = 'bbr';
        }
        if ($params['protocol'] == 'anytls' && $params['tls'] === 0) {
            $params['tls'] = 1;
        }
        if (in_array($params['protocol'], ['hysteria2', 'trojan', 'tuic'])) {
            $params['tls'] = 1;
        }
        if (isset($params['tls']) && (int)$params['tls'] === 2) {
            $keyPair = SodiumCompat::crypto_box_keypair();
            $params['tls_settings'] = $params['tls_settings'] ?? [];
            if (!isset($params['tls_settings']['public_key'])) {
                $params['tls_settings']['public_key'] = Helper::base64EncodeUrlSafe(SodiumCompat::crypto_box_publickey($keyPair));
            }
            if (!isset($params['tls_settings']['private_key'])) {
                $params['tls_settings']['private_key'] = Helper::base64EncodeUrlSafe(SodiumCompat::crypto_box_secretkey($keyPair));
            }
            if (!isset($params['tls_settings']['short_id'])) {
                $params['tls_settings']['short_id'] = substr(sha1($params['tls_settings']['private_key']), 0, 8);
            }
            if (!isset($params['tls_settings']['server_port'])) {
                $params['tls_settings']['server_port'] = "443";
            }
        }
        if (isset($params['tls_settings']) && !empty($params['tls_settings']['ech']) && $params['tls_settings']['ech'] === 'custom') {
            if (empty($params['tls_settings']['ech_server_name'])) {
                $params['tls_settings']['ech'] = '';
            } else {
                $outerSni = $params['tls_settings']['ech_server_name'];
                if (empty($params['tls_settings']['ech_key']) || empty($params['tls_settings']['ech_config'])) {
                    $echPair = Helper::generateEchKeyPair($outerSni);
                    if (empty($params['tls_settings']['ech_key'])) {
                        $params['tls_settings']['ech_key'] = $echPair['ech_key'];
                    }
                    if (empty($params['tls_settings']['ech_config'])) {
                        $params['tls_settings']['ech_config'] = $echPair['ech_config'];
                    }
                }
            }
        }
        if (isset($params['network_settings'])) {
            $ns = $params['network_settings'];
            if (isset($ns['acceptProxyProtocol'])) {
                $ns['acceptProxyProtocol'] = filter_var($ns['acceptProxyProtocol'], FILTER_VALIDATE_BOOLEAN);
            }
            $params['network_settings'] = $ns;
        }
        if ($params['network'] != 'tcp' && isset($params['encryption']) && $params['encryption'] != 'mlkem768x25519plus') {
            $params['flow'] = null;
        }
        if ($params['network'] == 'xhttp' && isset($params['network_settings'])) {
            $ns = $params['network_settings'];
            if (isset($ns['extra']) && is_array($ns['extra'])) {
                $extra = $ns['extra'];
                if (isset($extra['xPaddingObfsMode'])) {
                    $extra['xPaddingObfsMode'] = filter_var($extra['xPaddingObfsMode'], FILTER_VALIDATE_BOOLEAN);
                }
                if (isset($extra['noGRPCHeader'])) {
                    $extra['noGRPCHeader'] = filter_var($extra['noGRPCHeader'], FILTER_VALIDATE_BOOLEAN);
                }
                if (isset($extra['noSSEHeader'])) {
                    $extra['noSSEHeader'] = filter_var($extra['noSSEHeader'], FILTER_VALIDATE_BOOLEAN);
                }
                if (isset($extra['scMaxBufferedPosts'])) {
                    $extra['scMaxBufferedPosts'] = (int)$extra['scMaxBufferedPosts'];
                }
                if (isset($extra['xmux']) && is_array($extra['xmux'])) {
                    $xmux = $extra['xmux'];
                    if (isset($xmux['hKeepAlivePeriod'])) {
                        $xmux['hKeepAlivePeriod'] = (int)$xmux['hKeepAlivePeriod'];
                    }
                    $extra['xmux'] = $xmux;
                }
                if (isset($extra['downloadSettings']) && is_array($extra['downloadSettings'])) {
                    $downloadSettings = $extra['downloadSettings'];
                    if (isset($downloadSettings['port'])) {
                        $downloadSettings['port'] = (int)$downloadSettings['port'];
                    }
                    $extra['downloadSettings'] = $downloadSettings;
                }
                $ns['extra'] = $extra;
            }
            $params['network_settings'] = $ns;
        }
        if (isset($params['encryption']) && $params['encryption'] == 'mlkem768x25519plus') {
            $keyPair = SodiumCompat::crypto_box_keypair();
            $params['encryption_settings'] = $params['encryption_settings'] ?? [];
            if (!isset($params['encryption_settings']['mode'])) {
                $params['encryption_settings']['mode'] = 'native';
            }
            if (isset($params['encryption_settings']['rtt'])) {
                if ($params['encryption_settings']['rtt'] == '1rtt') {
                    $params['encryption_settings']['ticket'] = '0s';
                }
            } else {
                $params['encryption_settings']['rtt'] = '0rtt';
                $params['encryption_settings']['ticket'] = '600s';
            }
            if (!isset($params['encryption_settings']['private_key'])) {
                $params['encryption_settings']['private_key'] = Helper::base64EncodeUrlSafe(SodiumCompat::crypto_box_secretkey($keyPair));
            }
            if (!isset($params['encryption_settings']['password'])) {
                $params['encryption_settings']['password'] = Helper::base64EncodeUrlSafe(SodiumCompat::crypto_box_publickey($keyPair));
            }
        }

        if (isset($params['padding_scheme'])) {
            $params['padding_scheme'] = json_decode($params['padding_scheme']);
        }

        if (!isset($params['up_mbps'])) {
            $params['up_mbps'] = 0;
        }
        if (!isset($params['down_mbps'])) {
            $params['down_mbps'] = 0;
        }

        if(isset($params['obfs'])) {
            if(!isset($params['obfs_password']))  $params['obfs_password'] = Helper::getServerKey($request->input('created_at'), 16);
        } else {
            $params['obfs_password'] = null;
        }

        if($params['protocol'] == 'shadowsocks' && !isset($params['cipher'])) {
            $params['cipher'] = 'aes-128-gcm';
        }

        if ($request->input('id')) {
            $server = ServerV2node::find($request->input('id'));
            if (!$server) {
                abort(500, '服务器不存在');
            }
            try {
                $server->update($params);
            } catch (\Exception $e) {
                abort(500, '保存失败');
            }
            return response([
                'data' => true
            ]);
        }

        if (!ServerV2node::create($params)) {
            abort(500, '创建失败');
        }
        return response([
            'data' => true
        ]);
    }

    public function drop(Request $request)
    {
        if ($request->input('id')) {
            $server = ServerV2node::find($request->input('id'));
            if (!$server) {
                abort(500, '节点ID不存在');
            }
        }
        return response([
            'data' => $server->delete()
        ]);
    }

    public function update(Request $request)
    {
        $params = $request->validate([
            'show' => 'nullable|in:0,1',
        ]);

        $server = ServerV2node::find($request->input('id'));

        if (!$server) {
            abort(500, '该服务器不存在');
        }
        try {
            $server->update($params);
        } catch (\Exception $e) {
            abort(500, '保存失败');
        }
        return response([
            'data' => true
        ]);
    }

    public function copy(Request $request)
    {
        $server = ServerV2node::find($request->input('id'));
        $server->show = 0;
        if (!$server) {
            abort(500, '服务器不存在');
        }
        if (!ServerV2node::create($server->toArray())) {
            abort(500, '复制失败');
        }

        return response([
            'data' => true
        ]);
    }
}
