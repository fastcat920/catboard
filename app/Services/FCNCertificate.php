<?php

namespace App\Services;

use InvalidArgumentException;
use RuntimeException;

/** Managed FCN certificates: identity is SHA256 of DER SubjectPublicKeyInfo. */
class FCNCertificate
{
    public static function forSave(array $settings, array $old, string $name, bool $rotate = false): array
    {
        if ($rotate) {
            foreach (['tls_key', 'tls_cert', 'fcn_spki_sha256', 'fcn_cert_expires_at'] as $field) unset($settings[$field]);
        } elseif (($old['fcn_trust_mode'] ?? '') === 'spki') {
            foreach (['tls_key', 'tls_cert', 'fcn_spki_sha256'] as $field) {
                if (empty($settings[$field]) && !empty($old[$field])) $settings[$field] = $old[$field];
            }
        }
        unset($settings['fcn_rotate_key']);
        return self::prepare($settings, $name);
    }

    public static function prepare(array $settings, string $name, bool $renew = false): array
    {
        $ip = filter_var($name, FILTER_VALIDATE_IP);
        if (!$ip && (strlen($name) > 253 || !preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iD', $name))) {
            throw new InvalidArgumentException('FCN 证书域名或 IP 格式不正确。');
        }
        $keyPem = (string) ($settings['tls_key'] ?? '');
        if ($keyPem === '' && !empty($settings['fcn_spki_sha256'])) {
            throw new InvalidArgumentException('已有 FCN 固定公钥缺少私钥，不能自动更换身份。');
        }
        if ($keyPem !== '') {
            $key = @openssl_pkey_get_private($keyPem);
            if ($key === false) throw new InvalidArgumentException('FCN 已有私钥无效，不能静默替换服务器身份。');
        } else {
            $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
            if ($key === false || !openssl_pkey_export($key, $keyPem)) throw new RuntimeException('无法生成 FCN 服务器密钥。');
        }
        $certPem = (string) ($settings['tls_cert'] ?? '');
        $cert = $certPem !== '' ? @openssl_x509_parse($certPem) : false;
        if ($cert && !@openssl_x509_check_private_key($certPem, $key)) {
            throw new InvalidArgumentException('FCN 证书与私钥不匹配。');
        }
        $san = ($ip ? 'IP Address:' : 'DNS:') . $name;
        $names = $cert ? explode(', ', $cert['extensions']['subjectAltName'] ?? '') : [];
        if ($renew || !$cert || ($cert['validTo_time_t'] ?? 0) < time() + 30 * 86400 || !in_array($san, $names, true)) {
            $path = tempnam(sys_get_temp_dir(), 'fcn-openssl-');
            if ($path === false) throw new RuntimeException('无法创建 FCN 证书配置。');
            try {
                $alt = ($ip ? 'IP:' : 'DNS:') . $name;
                $config = "[req]\ndistinguished_name=dn\n[dn]\n[v3]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=$alt\n";
                if (file_put_contents($path, $config) === false) throw new RuntimeException('无法写入证书配置。');
                $options = ['config' => $path, 'digest_alg' => 'sha256', 'req_extensions' => 'v3', 'x509_extensions' => 'v3'];
                $csr = openssl_csr_new(['commonName' => $name], $key, $options);
                $signed = $csr ? openssl_csr_sign($csr, null, $key, 365, $options, random_int(1, PHP_INT_MAX)) : false;
                if (!$signed || !openssl_x509_export($signed, $certPem)) throw new RuntimeException('无法签发 FCN 自签证书。');
                $cert = openssl_x509_parse($certPem);
            } finally {
                @unlink($path);
            }
        }
        $settings['server_name'] = $name;
        $settings['cert_mode'] = 'remote';
        $settings['fcn_trust_mode'] = 'spki';
        $settings['tls_cert'] = $certPem;
        $settings['tls_key'] = $keyPem;
        $settings['fcn_spki_sha256'] = self::pin($certPem);
        $settings['fcn_cert_expires_at'] = (int) $cert['validTo_time_t'];
        return $settings;
    }

    public static function publicSettings(array $settings, string $fallbackName): array
    {
        // Subscription/API consumers never receive certificate private keys or DNS API secrets.
        return [
            'server_name' => !empty($settings['server_name']) ? $settings['server_name'] : $fallbackName,
            'fcn_trust_mode' => $settings['fcn_trust_mode'] ?? 'ca',
            'fcn_spki_sha256' => $settings['fcn_spki_sha256'] ?? null,
            'fcn_cert_expires_at' => $settings['fcn_cert_expires_at'] ?? null,
        ];
    }

    public static function pin(string $certificate): string
    {
        $public = @openssl_pkey_get_public($certificate);
        $details = $public !== false ? openssl_pkey_get_details($public) : false;
        if (!$details || empty($details['key'])) throw new InvalidArgumentException('FCN 证书公钥无效。');
        $body = preg_replace('/-----[^-]+-----|\s+/', '', $details['key']);
        $der = base64_decode($body, true);
        if ($der === false) throw new InvalidArgumentException('FCN 公钥编码无效。');
        return 'sha256/' . base64_encode(hash('sha256', $der, true));
    }
}
