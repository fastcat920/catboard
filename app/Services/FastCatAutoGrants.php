<?php

namespace App\Services;

class FastCatAutoGrants
{
    /** Resolve existing authorized logical nodes, after plan, visibility and audit filtering. */
    public static function apply(array $servers, int $userId, string $directory, ?string $device = null): array
    {
        if ($userId <= 0 || $directory === '') {
            return array_values(array_filter($servers, static function ($server) {
                return ($server['protocol'] ?? '') !== 'fastcat-v2';
            }));
        }
        $output = [];
        $lookups = [];
        $emitted = [];
        foreach ($servers as $server) {
            if (($server['_entry_mode'] ?? '') === 'info') {
                $output[] = $server;
                continue;
            }
            $nativeV2 = ($server['protocol'] ?? '') === 'fastcat-v2';
            if ($nativeV2 && $device === null) continue;
            $key = ($server['type'] ?? '') . ':' . ($server['id'] ?? '');
            if (!preg_match('/^[a-z][a-z0-9]*:[1-9][0-9]*$/D', $key)) {
                if (!$nativeV2) $output[] = $server;
                continue;
            }
            if (!array_key_exists($key, $lookups)) {
                $root = $directory . '/' . $key;
                $entry = self::record($root . '/endpoints.json');
                // An existing HTTP/2 + v1 node stays available during a staged rollout.
                $useDevice = $device !== null && isset($entry['h3-port']);
                $lookups[$key] = $nativeV2 && !$useDevice
                    ? null
                    : self::lookup($root, $userId, $useDevice ? $device : null);
            }
            $node = $lookups[$key];
            if ($node === null) {
                if (!$nativeV2) $output[] = $server;
                continue;
            }
            if (!isset($emitted[$key])) {
                $name = $server['_entry_logical_name'] ?? $server['name'];
                $output[] = ['name' => $name, '_fastcat_auto_proxy' => ['name' => $name] + $node];
                $emitted[$key] = true;
            }
        }
        return $output;
    }

    private static function record(string $path): ?array
    {
        if (!is_file($path) || !is_readable($path)) return null;
        $contents = @file_get_contents($path, false, null, 0, 8193);
        if ($contents === false || strlen($contents) > 8192) return null;
        $data = json_decode($contents, true);
        return is_array($data) ? $data : null;
    }

    public static function verifiedDevice(string $proof, string $token, string $key, int $now): ?string
    {
        if ($token === '' || strlen($key) < 32 || !preg_match('/^v2\.(dev_[0-9a-f]{24})\.([0-9]{10})\.([0-9a-f]{64})$/D', $proof, $m)) return null;
        if (abs($now - (int)$m[2]) > 60) return null;
        $signed = 'v2.' . $m[1] . '.' . $m[2] . '.' . hash('sha256', $token);
        return hash_equals(hash_hmac('sha256', $signed, $key), $m[3]) ? $m[1] : null;
    }

    public static function lookup(string $root, int $userId, ?string $device = null): ?array
    {
        if ($device !== null && !preg_match('/^dev_[0-9a-f]{24}$/D', $device)) return null;
        $suffix = $device === null ? '' : '.' . $device;
        $grant = self::record($root . '/grants/' . $userId . $suffix . '.json');
        if ($grant === null) return null;
        $node = self::endpoints($root, $device !== null);
        if ($node === null) return null;
        $keys = $device === null ? ['token', 'fallback-token'] : ['token', 'h3-token'];
        foreach ($keys as $field) {
            $value = $grant[$field] ?? null;
            if (!is_string($value) || !preg_match('/^[!-~]{24,512}$/D', $value)) return null;
            $node[$field] = $value;
        }
        return $node;
    }

    public static function endpoints(string $root, bool $v2 = false): ?array
    {
        $node = ['type' => 'fastcat-auto'];
        $entry = self::record($root . '/endpoints.json');
        if ($entry === null || !isset($entry['server'])) return null;
        $hosts = $v2 ? ['server', 'sni', 'h3-server', 'h3-sni'] : ['server', 'sni', 'fallback-server', 'fallback-sni'];
        foreach ($hosts as $field) {
            if (!array_key_exists($field, $entry)) continue;
            $value = $entry[$field];
            if (!is_string($value) || $value === '' ||
                (!filter_var($value, FILTER_VALIDATE_IP) &&
                 !filter_var($value, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME))) return null;
            $node[$field] = $value;
        }
        foreach (['port', $v2 ? 'h3-port' : 'fallback-port'] as $field) {
            $value = $entry[$field] ?? null;
            if (!is_int($value) || $value < 1 || $value > 65535) return null;
            $node[$field] = $value;
        }
        if ($v2) {
            $mode = $entry['tls-key-exchange'] ?? 'default';
            if (!in_array($mode, ['default', 'x25519', 'x25519mlkem768'], true)) return null;
            $node['tls-key-exchange'] = $mode;
            $node['udp'] = true;
        }
        return $node;
    }
}
