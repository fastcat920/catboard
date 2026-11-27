<?php

namespace App\Services\NodeSecurity;

final class PublicNodeSettings
{
    private const INTERNAL_KEYS = [
        'privatekey', 'echkey', 'tlscert', 'tlskey', 'certfile', 'keyfile',
        'dnsenv', 'trustedxforwardedfor', 'certmode', 'fcntlsprivatekey',
        'listenip', 'serverport', 'passwordalgo', 'apikey',
    ];

    public static function forNodeList(array $server): array
    {
        $fields = [
            'id', 'name', 'type', 'protocol', 'host', 'port', 'mport', 'server_name',
            'sort', 'rate', 'tags', 'is_online', 'last_check_at', 'cache_key',
            'network', 'network_settings', 'networkSettings', 'tls', 'tls_settings',
            'tlsSettings', 'flow', 'cipher', 'security', 'encryption', 'encryption_settings',
            'allow_insecure', 'insecure', 'congestion_control', 'zero_rtt_handshake',
            'up_mbps', 'down_mbps', 'obfs', 'obfs_password', 'padding_scheme',
        ];
        return self::strip(array_intersect_key($server, array_flip($fields)), true);
    }

    public static function strip(array $settings, bool $removeInternalMetadata = false): array
    {
        foreach ($settings as $key => $value) {
            if (is_string($key)) {
                $normalized = preg_replace('/[^a-z0-9]/', '', strtolower($key));
                if (in_array($normalized, self::INTERNAL_KEYS, true)
                    || ($removeInternalMetadata && strpos($key, '_') === 0)) {
                    unset($settings[$key]);
                    continue;
                }
            }
            if (is_array($value)) {
                $settings[$key] = self::strip($value, $removeInternalMetadata);
            }
        }
        return $settings;
    }
}
