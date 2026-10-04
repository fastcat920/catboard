<?php

namespace App\Services;

use App\Models\ClientStorageTarget;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\Crypt;

class ClientConfigStorageService
{
    private $client;

    public function __construct()
    {
        $this->client = new Client(['timeout' => 20, 'connect_timeout' => 8, 'http_errors' => false]);
    }

    public function upload(ClientStorageTarget $target, string $objectKey, string $body): array
    {
        $accessKey = $this->decrypt($target->access_key_id_encrypted, 'AccessKey ID');
        $secretKey = $this->decrypt($target->secret_key_encrypted, 'SecretKey');
        if ($target->provider === 'aliyun_oss') {
            return $this->uploadAliyun($target, $objectKey, $body, $accessKey, $secretKey);
        }
        if ($target->provider === 'tencent_cos') {
            return $this->uploadTencent($target, $objectKey, $body, $accessKey, $secretKey);
        }
        if ($target->provider === 'ucloud_us3') {
            return $this->uploadUcloud($target, $objectKey, $body, $accessKey, $secretKey);
        }
        throw new \RuntimeException('不支持的云存储类型');
    }

    public function verifyPublicObject(string $url, string $expectedBody): void
    {
        $separator = strpos($url, '?') === false ? '?' : '&';
        $response = $this->client->get($url . $separator . '_verify=' . time(), [
            'headers' => ['Cache-Control' => 'no-cache'],
        ]);
        if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
            throw new \RuntimeException('发布后校验失败：公开地址返回 HTTP ' . $response->getStatusCode());
        }
        $actual = (string)$response->getBody();
        if (!hash_equals(hash('sha256', $expectedBody), hash('sha256', $actual))) {
            throw new \RuntimeException('发布后校验失败：远端文件内容与本次发布不一致');
        }
    }

    public function deleteObject(ClientStorageTarget $target, string $objectKey): void
    {
        $accessKey = $this->decrypt($target->access_key_id_encrypted, 'AccessKey ID');
        $secretKey = $this->decrypt($target->secret_key_encrypted, 'SecretKey');
        if ($target->provider === 'aliyun_oss') {
            $this->deleteAliyun($target, $objectKey, $accessKey, $secretKey);
            return;
        }
        if ($target->provider === 'tencent_cos') {
            $this->deleteTencent($target, $objectKey, $accessKey, $secretKey);
            return;
        }
        if ($target->provider === 'ucloud_us3') {
            $this->deleteUcloud($target, $objectKey, $accessKey, $secretKey);
            return;
        }
        throw new \RuntimeException('不支持的云存储类型');
    }

    public function publicUrlFor(ClientStorageTarget $target, string $objectKey): string
    {
        $baseKey = ltrim((string)$target->object_key, '/');
        $public = (string)$target->public_url;
        if ($baseKey !== '' && substr($public, -strlen($baseKey)) === $baseKey) {
            return substr($public, 0, -strlen($baseKey)) . ltrim($objectKey, '/');
        }
        return rtrim($public, '/') . '/' . $this->encodePath($objectKey);
    }

    public function defaultPublicUrlFor(ClientStorageTarget $target, string $objectKey): string
    {
        $provider = $target->provider === 'tencent_cos' ? 'cos' : ($target->provider === 'ucloud_us3' ? 'us3' : 'oss');
        list($url) = $this->targetAddress($target, $objectKey, $provider);
        return $url;
    }

    public function versionedObjectKey(ClientStorageTarget $target, int $version): string
    {
        $key = ltrim((string)$target->object_key, '/');
        $slash = strrpos($key, '/');
        $prefix = $slash === false ? '' : substr($key, 0, $slash + 1);
        return $prefix . 'releases/config-v' . $version . '.json';
    }

    private function uploadAliyun(ClientStorageTarget $target, string $objectKey, string $body, string $accessKey, string $secretKey): array
    {
        list($url, $host, $path) = $this->targetAddress($target, $objectKey, 'oss');
        $date = gmdate('D, d M Y H:i:s \G\M\T');
        $contentType = 'application/octet-stream';
        $contentMd5 = base64_encode(md5($body, true));
        $canonicalResource = '/' . $target->bucket . '/' . ltrim($objectKey, '/');
        $token = $this->optionalDecrypt($target->security_token_encrypted);
        $ossHeaders = [];
        if ($this->usesAutomaticPublicUrl($target)) $ossHeaders['x-oss-object-acl'] = 'public-read';
        if ($token) $ossHeaders['x-oss-security-token'] = $token;
        ksort($ossHeaders);
        $canonicalHeaders = '';
        foreach ($ossHeaders as $name => $value) $canonicalHeaders .= $name . ':' . $value . "\n";
        $stringToSign = "PUT\n{$contentMd5}\n{$contentType}\n{$date}\n{$canonicalHeaders}{$canonicalResource}";
        $headers = [
            'Host' => $host,
            'Date' => $date,
            'Content-MD5' => $contentMd5,
            'Content-Type' => $contentType,
            'Authorization' => 'OSS ' . $accessKey . ':' . base64_encode(hash_hmac('sha1', $stringToSign, $secretKey, true)),
        ];
        if ($this->usesAutomaticPublicUrl($target)) $headers['x-oss-object-acl'] = 'public-read';
        if ($token) $headers['x-oss-security-token'] = $token;
        return $this->put($url, $headers, $body);
    }

    private function uploadTencent(ClientStorageTarget $target, string $objectKey, string $body, string $accessKey, string $secretKey): array
    {
        list($url, $host, $path) = $this->targetAddress($target, $objectKey, 'cos');
        $now = time();
        $keyTime = $now . ';' . ($now + 600);
        $contentType = 'application/octet-stream';
        $contentMd5 = base64_encode(md5($body, true));
        $signedHeaders = [
            'content-md5' => $contentMd5,
            'content-type' => $contentType,
            'host' => strtolower($host),
        ];
        if ($this->usesAutomaticPublicUrl($target)) $signedHeaders['x-cos-acl'] = 'public-read';
        $token = $this->optionalDecrypt($target->security_token_encrypted);
        if ($token) $signedHeaders['x-cos-security-token'] = $token;
        ksort($signedHeaders);
        $canonicalHeaders = implode('&', array_map(function ($key) use ($signedHeaders) {
            return rawurlencode($key) . '=' . rawurlencode($signedHeaders[$key]);
        }, array_keys($signedHeaders)));
        $headerList = implode(';', array_keys($signedHeaders));
        $httpString = "put\n{$path}\n\n{$canonicalHeaders}\n";
        $signKey = hash_hmac('sha1', $keyTime, $secretKey);
        $stringToSign = "sha1\n{$keyTime}\n" . sha1($httpString) . "\n";
        $signature = hash_hmac('sha1', $stringToSign, $signKey);
        $authorization = 'q-sign-algorithm=sha1&q-ak=' . rawurlencode($accessKey)
            . '&q-sign-time=' . $keyTime . '&q-key-time=' . $keyTime
            . '&q-header-list=' . $headerList . '&q-url-param-list=&q-signature=' . $signature;
        $headers = ['Host' => $host, 'Content-Type' => $contentType, 'Content-MD5' => $contentMd5, 'Authorization' => $authorization];
        if ($this->usesAutomaticPublicUrl($target)) $headers['x-cos-acl'] = 'public-read';
        if ($token) $headers['x-cos-security-token'] = $token;
        return $this->put($url, $headers, $body);
    }

    private function uploadUcloud(ClientStorageTarget $target, string $objectKey, string $body, string $accessKey, string $secretKey): array
    {
        list($url, $host) = $this->targetAddress($target, $objectKey, 'us3');
        $date = gmdate('D, d M Y H:i:s \G\M\T');
        $contentType = 'application/octet-stream';
        $canonicalResource = '/' . $target->bucket . '/' . ltrim($objectKey, '/');
        $stringToSign = "PUT\n\n{$contentType}\n{$date}\n{$canonicalResource}";
        $headers = [
            'Host' => $host,
            'Date' => $date,
            'Content-Type' => $contentType,
            'Authorization' => 'UCloud ' . $accessKey . ':' . base64_encode(hash_hmac('sha1', $stringToSign, $secretKey, true)),
        ];
        return $this->put($url, $headers, $body);
    }

    private function deleteAliyun(ClientStorageTarget $target, string $objectKey, string $accessKey, string $secretKey): void
    {
        list($url, $host) = $this->targetAddress($target, $objectKey, 'oss');
        $date = gmdate('D, d M Y H:i:s \G\M\T');
        $canonicalResource = '/' . $target->bucket . '/' . ltrim($objectKey, '/');
        $token = $this->optionalDecrypt($target->security_token_encrypted);
        $canonicalHeaders = $token ? 'x-oss-security-token:' . $token . "\n" : '';
        $stringToSign = "DELETE\n\n\n{$date}\n{$canonicalHeaders}{$canonicalResource}";
        $headers = [
            'Host' => $host,
            'Date' => $date,
            'Authorization' => 'OSS ' . $accessKey . ':' . base64_encode(hash_hmac('sha1', $stringToSign, $secretKey, true)),
        ];
        if ($token) $headers['x-oss-security-token'] = $token;
        $this->delete($url, $headers);
    }

    private function deleteTencent(ClientStorageTarget $target, string $objectKey, string $accessKey, string $secretKey): void
    {
        list($url, $host, $path) = $this->targetAddress($target, $objectKey, 'cos');
        $now = time();
        $keyTime = $now . ';' . ($now + 600);
        $signedHeaders = ['host' => strtolower($host)];
        $token = $this->optionalDecrypt($target->security_token_encrypted);
        if ($token) $signedHeaders['x-cos-security-token'] = $token;
        ksort($signedHeaders);
        $canonicalHeaders = implode('&', array_map(function ($key) use ($signedHeaders) {
            return rawurlencode($key) . '=' . rawurlencode($signedHeaders[$key]);
        }, array_keys($signedHeaders)));
        $headerList = implode(';', array_keys($signedHeaders));
        $httpString = "delete\n{$path}\n\n{$canonicalHeaders}\n";
        $signKey = hash_hmac('sha1', $keyTime, $secretKey);
        $stringToSign = "sha1\n{$keyTime}\n" . sha1($httpString) . "\n";
        $signature = hash_hmac('sha1', $stringToSign, $signKey);
        $authorization = 'q-sign-algorithm=sha1&q-ak=' . rawurlencode($accessKey)
            . '&q-sign-time=' . $keyTime . '&q-key-time=' . $keyTime
            . '&q-header-list=' . $headerList . '&q-url-param-list=&q-signature=' . $signature;
        $headers = ['Host' => $host, 'Authorization' => $authorization];
        if ($token) $headers['x-cos-security-token'] = $token;
        $this->delete($url, $headers);
    }

    private function deleteUcloud(ClientStorageTarget $target, string $objectKey, string $accessKey, string $secretKey): void
    {
        list($url, $host) = $this->targetAddress($target, $objectKey, 'us3');
        $date = gmdate('D, d M Y H:i:s \G\M\T');
        $canonicalResource = '/' . $target->bucket . '/' . ltrim($objectKey, '/');
        $stringToSign = "DELETE\n\n\n{$date}\n{$canonicalResource}";
        $headers = [
            'Host' => $host,
            'Date' => $date,
            'Authorization' => 'UCloud ' . $accessKey . ':' . base64_encode(hash_hmac('sha1', $stringToSign, $secretKey, true)),
        ];
        $this->delete($url, $headers);
    }

    private function targetAddress(ClientStorageTarget $target, string $objectKey, string $provider): array
    {
        $rawEndpoint = trim((string)$target->endpoint);
        $scheme = stripos($rawEndpoint, 'http://') === 0 ? 'http' : 'https';
        $endpoint = preg_replace('#^https?://#i', '', $rawEndpoint);
        $endpoint = rtrim($endpoint, '/');
        if ($endpoint === '') {
            if ($provider === 'cos' && $target->region) $endpoint = 'cos.' . $target->region . '.myqcloud.com';
            else throw new \RuntimeException('云存储 Endpoint 不能为空');
        }
        $host = strpos($endpoint, $target->bucket . '.') === 0 ? $endpoint : $target->bucket . '.' . $endpoint;
        $path = '/' . $this->encodePath($objectKey);
        return [$scheme . '://' . $host . $path, $host, $path];
    }

    private function usesAutomaticPublicUrl(ClientStorageTarget $target): bool
    {
        return rtrim((string)$target->public_url, '/') === rtrim($this->defaultPublicUrlFor($target, $target->object_key), '/');
    }

    private function put(string $url, array $headers, string $body): array
    {
        $response = $this->client->put($url, ['headers' => $headers, 'body' => $body]);
        $status = $response->getStatusCode();
        if ($status < 200 || $status >= 300) {
            $message = trim((string)$response->getBody());
            throw new \RuntimeException('云存储上传失败（HTTP ' . $status . '）：' . mb_substr($message, 0, 500));
        }
        return ['etag' => trim($response->getHeaderLine('ETag'), '"'), 'status' => $status];
    }

    private function delete(string $url, array $headers): void
    {
        $response = $this->client->delete($url, ['headers' => $headers]);
        $status = $response->getStatusCode();
        if (($status < 200 || $status >= 300) && $status !== 404) {
            $message = trim((string)$response->getBody());
            throw new \RuntimeException('测试文件清理失败（HTTP ' . $status . '）：' . mb_substr($message, 0, 500));
        }
    }

    private function encodePath(string $value): string
    {
        return implode('/', array_map('rawurlencode', explode('/', ltrim($value, '/'))));
    }

    private function decrypt(?string $value, string $label): string
    {
        $plain = $this->optionalDecrypt($value);
        if (!$plain) throw new \RuntimeException($label . ' 尚未配置');
        return $plain;
    }

    private function optionalDecrypt(?string $value): ?string
    {
        return $value ? Crypt::decryptString($value) : null;
    }
}
