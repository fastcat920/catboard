<?php

namespace App\Services;

use App\Models\AliyunDnsAccount;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\Crypt;
use RuntimeException;

class AliyunDnsService
{
    const ENDPOINT = 'https://alidns.cn-hangzhou.aliyuncs.com/';
    const VERSION = '2015-01-09';

    public function listInstanceConfigs(AliyunDnsAccount $account)
    {
        return $this->request($account, 'ListCloudGtmInstanceConfigs', [
            'PageNumber' => 1,
            'PageSize' => 100,
            'AcceptLanguage' => 'zh-CN',
        ]);
    }

    public function fullInfo(AliyunDnsAccount $account, $instanceId, $configId)
    {
        return $this->request($account, 'DescribeCloudGtmInstanceConfigFullInfo', [
            'InstanceId' => $instanceId,
            'ConfigId' => $configId,
            'AcceptLanguage' => 'zh-CN',
        ]);
    }

    public function updateInstanceBasic(AliyunDnsAccount $account, array $parameters)
    {
        return $this->request($account, 'UpdateCloudGtmInstanceConfigBasic', $parameters);
    }

    public function updateInstanceStrategy(AliyunDnsAccount $account, array $parameters)
    {
        return $this->request($account, 'UpdateCloudGtmInstanceConfigLbStrategy', $parameters);
    }

    public function updateInstanceStatus(AliyunDnsAccount $account, $instanceId, $configId, $status)
    {
        return $this->request($account, 'UpdateCloudGtmInstanceConfigEnableStatus', [
            'InstanceId' => $instanceId,
            'ConfigId' => $configId,
            'EnableStatus' => $status,
        ]);
    }

    public function updatePoolStatus(AliyunDnsAccount $account, $poolId, $status)
    {
        return $this->request($account, 'UpdateCloudGtmAddressPoolEnableStatus', [
            'AddressPoolId' => $poolId,
            'EnableStatus' => $status,
        ]);
    }

    public function updatePoolStrategy(AliyunDnsAccount $account, array $parameters)
    {
        return $this->request($account, 'UpdateCloudGtmAddressPoolLbStrategy', $parameters);
    }

    public function updateAddressStatus(AliyunDnsAccount $account, $addressId, $status)
    {
        return $this->request($account, 'UpdateCloudGtmAddressEnableStatus', [
            'AddressId' => $addressId,
            'EnableStatus' => $status,
        ]);
    }

    public function request(AliyunDnsAccount $account, $action, array $parameters = [])
    {
        $accessKeyId = Crypt::decryptString($account->access_key_id_encrypted);
        $accessKeySecret = Crypt::decryptString($account->access_key_secret_encrypted);
        $parameters = array_merge([
            'Format' => 'JSON',
            'Version' => self::VERSION,
            'AccessKeyId' => $accessKeyId,
            'SignatureMethod' => 'HMAC-SHA1',
            'SignatureVersion' => '1.0',
            'SignatureNonce' => bin2hex(random_bytes(16)),
            'Timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'Action' => $action,
            'AcceptLanguage' => 'zh-CN',
            'ClientToken' => bin2hex(random_bytes(16)),
        ], $parameters);
        if ($account->security_token_encrypted) {
            $parameters['SecurityToken'] = Crypt::decryptString($account->security_token_encrypted);
        }
        $parameters = array_filter($parameters, function ($value) {
            return $value !== null && $value !== '';
        });
        ksort($parameters);
        $canonical = [];
        foreach ($parameters as $key => $value) {
            $canonical[] = $this->percentEncode($key) . '=' . $this->percentEncode($value);
        }
        $canonicalQuery = implode('&', $canonical);
        $stringToSign = 'GET&%2F&' . $this->percentEncode($canonicalQuery);
        $parameters['Signature'] = base64_encode(hash_hmac('sha1', $stringToSign, $accessKeySecret . '&', true));

        try {
            $response = (new Client([
                'timeout' => 15,
                'connect_timeout' => 8,
                'http_errors' => false,
            ]))->get(self::ENDPOINT, ['query' => $parameters]);
        } catch (\Throwable $error) {
            throw new RuntimeException('无法连接阿里云云解析 DNS：' . $error->getMessage(), 0, $error);
        }

        $statusCode = $response->getStatusCode();
        $body = (string)$response->getBody();
        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('阿里云返回了无法识别的数据（HTTP ' . $statusCode . '）');
        }
        if ($statusCode < 200 || $statusCode >= 300 || isset($decoded['Code'])) {
            $message = isset($decoded['Message']) ? $decoded['Message'] : '请求失败';
            $code = isset($decoded['Code']) ? $decoded['Code'] : 'HTTP ' . $statusCode;
            $requestId = isset($decoded['RequestId']) ? '，RequestId：' . $decoded['RequestId'] : '';
            throw new RuntimeException($code . '：' . $message . $requestId);
        }
        return $decoded;
    }

    private function percentEncode($value)
    {
        return str_replace('%7E', '~', rawurlencode((string)$value));
    }
}
