<?php

namespace App\Services;

class FastCatManagedGrants
{
    private const GRANT_TTL = 604800;

    private static function directory(int $id): string
    {
        return storage_path('app/fastcat-v2/' . $id);
    }

    public static function snapshot(int $id, array $eligible): array
    {
        $dir = self::directory($id);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('Could not create node authorization directory.');
        }
        if (!touch($dir . '/heartbeat')) {
            throw new \RuntimeException('Could not record node authorization heartbeat.');
        }

        $h2 = [];
        $h3 = [];
        foreach (new \FilesystemIterator($dir) as $file) {
            if (!preg_match('/^([1-9][0-9]*)\.dev_[0-9a-f]{24}\.json$/D', $file->getFilename(), $parts)
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
        }

        return ['h2' => $h2, 'h3' => $h3];
    }

    public static function issue(array $server, int $user, string $device): ?array
    {
        $id = (int) ($server['id'] ?? 0);
        if ($id < 1 || $user < 1 || !preg_match('/^dev_[0-9a-f]{24}$/D', $device)) return null;
        $dir = self::directory($id);
        $heartbeat = @filemtime($dir . '/heartbeat');
        if ($heartbeat === false || $heartbeat < time() - 45) return null;

        $host = $server['host'] ?? '';
        $port = (int) ($server['port'] ?? 0);
        if (!is_string($host) || !filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)
            || $port < 1 || $port > 65535) return null;

        $file = $dir . '/' . $user . '.' . $device . '.json';
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
        return ['type' => 'fastcat-auto', 'server' => $host, 'port' => $port, 'h3-port' => $port, 'udp' => true] + $grant;
    }

    private static function validToken($token): bool
    {
        return is_string($token) && preg_match('/^[a-f0-9]{64}$/D', $token);
    }
}
