<?php

namespace App\Services;

class FastCatManagedGrants
{
    private const GRANT_TTL = 604800;

    private static function directory(int $id): string
    {
        return storage_path('app/fastcat-v2/' . $id);
    }

    public static function snapshot(int $id, array $eligible, string $mode = 'auto'): array
    {
        $dir = self::directory($id);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('Could not create node authorization directory.');
        }
        if (file_put_contents($dir . '/heartbeat', $mode, LOCK_EX) !== strlen($mode)) {
            throw new \RuntimeException('Could not record node authorization heartbeat.');
        }

        $h2 = [];
        $h3 = [];
        $accounts = [];
        foreach (new \FilesystemIterator($dir) as $file) {
            if (!preg_match('/^([1-9][0-9]*)\.account\.json$/D', $file->getFilename(), $parts)
                || !isset($eligible[(int) $parts[1]])
                || $file->getMTime() < time() - self::GRANT_TTL) {
                continue;
            }
            $grant = json_decode(file_get_contents($file->getPathname()), true);
            if (!is_array($grant) || !self::validToken($grant['token'] ?? null)
                || !self::validToken($grant['h3-token'] ?? null)) {
                throw new \RuntimeException('Invalid managed node authorization record.');
            }
            $h2[] = $grant['token'];
            $h3[] = $grant['h3-token'];
            $accounts[] = (int) $parts[1];
        }

        return ['h2' => $h2, 'h3' => $h3, 'transport_mode' => $mode, 'account_ids' => $accounts];
    }

    public static function issue(array $server, int $user, bool $transportModes = false): ?array
    {
        $id = (int) ($server['_fastcat_managed_parent'] ?? $server['id'] ?? 0);
        if ($id < 1 || $user < 1) return null;
        $dir = self::directory($id);
        $heartbeat = @filemtime($dir . '/heartbeat');
        if ($heartbeat === false || $heartbeat < time() - 45) return null;

        $configured = $server['tls_settings']['fastcat_transport_mode'] ?? 'auto';
        $parentMode = $server['_fastcat_parent_mode'] ?? $configured;
        $mode = ($configured === 'auto') ? $parentMode : $configured;
        if (($parentMode !== 'auto' && $mode !== $parentMode)
            || ($parentMode !== 'auto' && @file_get_contents($dir . '/heartbeat') !== $parentMode)
            || ($mode === 'h3' && !$transportModes)) return null;

        $host = $server['host'] ?? '';
        $port = (int) ($server['port'] ?? 0);
        if (!is_string($host) || !filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)
            || $port < 1 || $port > 65535) return null;

        $file = $dir . '/' . $user . '.account.json';
        $lock = fopen($dir . '/.lock', 'c');
        if (!$lock) throw new \RuntimeException('Could not open managed authorization lock.');
        try {
            if (!flock($lock, LOCK_EX)) throw new \RuntimeException('Could not lock managed authorizations.');
            $grant = is_file($file) ? json_decode(file_get_contents($file), true) : null;
            if (!is_array($grant) || !self::validToken($grant['token'] ?? null)
                || !self::validToken($grant['h3-token'] ?? null)
                || filemtime($file) < time() - self::GRANT_TTL) {
                $grant = ['token' => bin2hex(random_bytes(32)), 'h3-token' => bin2hex(random_bytes(32))];
                $tmp = tempnam($dir, '.grant-');
                if ($tmp === false) throw new \RuntimeException('Could not stage managed authorization.');
                try {
                    $json = json_encode($grant);
                    if (file_put_contents($tmp, $json) !== strlen($json) || !rename($tmp, $file)) {
                        throw new \RuntimeException('Could not save managed authorization.');
                    }
                } finally {
                    if (is_file($tmp)) unlink($tmp);
                }
            } elseif (!touch($file)) {
                throw new \RuntimeException('Could not renew managed authorization.');
            }
        } finally {
            fclose($lock);
        }
        $entry = ['type' => 'fastcat-auto', 'server' => $host, 'port' => $port, 'h3-port' => $port, 'udp' => true];
        $sni = $server['_fastcat_managed_sni'] ?? $host;
        if (!is_string($sni) || !filter_var($sni, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) return null;
        if ($sni !== $host) {
            $entry['sni'] = $sni;
            $entry['h3-sni'] = $sni;
        }
        $ipv4 = $server['tls_settings']['fastcat_endpoint_ipv4'] ?? null;
        if (is_string($ipv4) && filter_var($ipv4, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $entry['server'] = $ipv4;
            $entry['sni'] = $sni;
            $entry['h3-sni'] = $sni;
        }
        $entry['tls-key-exchange'] = $server['tls_settings']['fastcat_tls_key_exchange'] ?? 'default';
        if ($mode === 'h2') {
            $entry['type'] = 'fastcat-h2';
            $entry['udp'] = false;
            unset($entry['h3-port'], $entry['h3-sni'], $grant['h3-token']);
        } elseif ($mode === 'h3') {
            $entry['transport-mode'] = 'h3';
        }
        return $entry + $grant;
    }

    private static function validToken($token): bool
    {
        return is_string($token) && preg_match('/^[a-f0-9]{64}$/D', $token);
    }
}
