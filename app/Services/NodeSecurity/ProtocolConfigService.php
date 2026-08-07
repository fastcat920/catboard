<?php

namespace App\Services\NodeSecurity;

class ProtocolConfigService
{
    public function outbound(string $uri): array
    {
        $scheme = strtolower((string)parse_url($uri, PHP_URL_SCHEME));
        if ($scheme === 'vmess') return $this->vmess($uri);
        if ($scheme === 'vless') return $this->urlProtocol($uri, 'vless');
        if ($scheme === 'trojan') return $this->urlProtocol($uri, 'trojan');
        if ($scheme === 'ss') return $this->shadowsocks($uri);
        throw new \InvalidArgumentException('unsupported protocol');
    }

    private function vmess(string $uri): array
    {
        $data = json_decode($this->decodeBase64(substr($uri, 8)), true);
        if (!is_array($data) || empty($data['add']) || empty($data['port']) || empty($data['id'])) {
            throw new \InvalidArgumentException('invalid vmess link');
        }
        $out = [
            'type' => 'vmess', 'tag' => 'proxy', 'server' => $data['add'], 'server_port' => (int)$data['port'],
            'uuid' => $data['id'], 'security' => $data['scy'] ?? 'auto', 'alter_id' => (int)($data['aid'] ?? 0),
        ];
        if (!empty($data['tls']) && $data['tls'] !== 'none') $out['tls'] = $this->tls($data['sni'] ?? $data['host'] ?? $data['add'], $data);
        $this->transport($out, $data['net'] ?? 'tcp', $data['path'] ?? '', $data['host'] ?? '');
        return $out;
    }

    private function urlProtocol(string $uri, string $type): array
    {
        $parts = parse_url($uri);
        if (!$parts || empty($parts['host']) || empty($parts['port']) || empty($parts['user'])) {
            throw new \InvalidArgumentException('invalid protocol link');
        }
        parse_str($parts['query'] ?? '', $query);
        $out = [
            'type' => $type, 'tag' => 'proxy', 'server' => $parts['host'], 'server_port' => (int)$parts['port'],
        ];
        if ($type === 'vless') {
            $out['uuid'] = rawurldecode($parts['user']);
            if (!empty($query['flow'])) $out['flow'] = $query['flow'];
        } else {
            $out['password'] = rawurldecode($parts['user']);
        }
        $security = strtolower($query['security'] ?? '');
        if (in_array($security, ['tls', 'reality'], true)) {
            $out['tls'] = $this->tls($query['sni'] ?? $parts['host'], $query);
            if ($security === 'reality') {
                $out['tls']['reality'] = [
                    'enabled' => true, 'public_key' => $query['pbk'] ?? '', 'short_id' => $query['sid'] ?? '',
                ];
            }
        }
        $this->transport($out, $query['type'] ?? 'tcp', $query['path'] ?? ($query['serviceName'] ?? ''), $query['host'] ?? '');
        return $out;
    }

    private function shadowsocks(string $uri): array
    {
        $value = substr($uri, 5);
        $value = explode('#', $value, 2)[0];
        if (strpos($value, '@') === false) $value = $this->decodeBase64($value);
        [$credential, $address] = array_pad(explode('@', $value, 2), 2, '');
        if (strpos($credential, ':') === false) $credential = $this->decodeBase64($credential);
        [$method, $password] = array_pad(explode(':', $credential, 2), 2, '');
        $addressParts = parse_url('tcp://' . $address);
        if (!$method || !$password || !$addressParts || empty($addressParts['host']) || empty($addressParts['port'])) {
            throw new \InvalidArgumentException('invalid shadowsocks link');
        }
        return [
            'type' => 'shadowsocks', 'tag' => 'proxy', 'server' => $addressParts['host'],
            'server_port' => (int)$addressParts['port'], 'method' => rawurldecode($method),
            'password' => rawurldecode($password),
        ];
    }

    private function tls(string $serverName, array $options): array
    {
        $tls = [
            'enabled' => true, 'server_name' => $serverName,
            'insecure' => in_array(strtolower((string)($options['allowInsecure'] ?? '0')), ['1', 'true'], true),
        ];
        if (!empty($options['fp'])) $tls['utls'] = ['enabled' => true, 'fingerprint' => $options['fp']];
        return $tls;
    }

    private function transport(array &$out, string $network, string $path, string $host): void
    {
        if ($network === 'ws') {
            $out['transport'] = ['type' => 'ws', 'path' => rawurldecode($path ?: '/')];
            if ($host !== '') $out['transport']['headers'] = ['Host' => $host];
        } elseif ($network === 'grpc') {
            $out['transport'] = ['type' => 'grpc', 'service_name' => rawurldecode($path)];
        }
    }

    private function decodeBase64(string $value): string
    {
        $value = strtr(trim($value), '-_', '+/');
        $value .= str_repeat('=', (4 - strlen($value) % 4) % 4);
        $decoded = base64_decode($value, true);
        if ($decoded === false) throw new \InvalidArgumentException('invalid base64 data');
        return $decoded;
    }
}
