<?php

namespace App\Services;

use App\Models\CloudAccount;
use Carbon\Carbon;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\Crypt;
use RuntimeException;

class CloudBillingService
{
    const ALIYUN_CHINA_ENDPOINT = 'https://business.aliyuncs.com/';
    const ALIYUN_INTERNATIONAL_ENDPOINT = 'https://business.ap-southeast-1.aliyuncs.com/';
    const ALIYUN_VERSION = '2017-12-14';
    const TENCENT_ENDPOINT = 'https://billing.tencentcloudapi.com/';
    const TENCENT_HOST = 'billing.tencentcloudapi.com';
    const TENCENT_VERSION = '2018-07-09';
    const UCLOUD_ENDPOINT = 'https://api.ucloud.cn/';

    private $aliyunEndpointsByAccount = [];

    public function snapshot(CloudAccount $account)
    {
        $timezone = config('app.timezone', 'Asia/Shanghai');
        $now = Carbon::now($timezone);
        $currentMonth = $now->format('Y-m');
        $previousMonth = $now->copy()->subMonthNoOverflow()->format('Y-m');

        switch ($account->provider) {
            case 'aliyun':
                return $this->aliyunSnapshot($account, $currentMonth, $previousMonth);
            case 'tencent':
                return $this->tencentSnapshot($account, $currentMonth, $previousMonth);
            case 'ucloud':
                return $this->ucloudSnapshot($account, $currentMonth, $previousMonth);
            default:
                throw new RuntimeException('不支持的云账号类型');
        }
    }

    private function aliyunSnapshot(CloudAccount $account, $currentMonth, $previousMonth)
    {
        $balanceResponse = $this->aliyunRequest($account, 'QueryAccountBalance');
        $currentResponse = $this->aliyunRequest($account, 'QueryBillOverview', ['BillingCycle' => $currentMonth]);
        $previousResponse = $this->aliyunRequest($account, 'QueryBillOverview', ['BillingCycle' => $previousMonth]);
        $balanceData = $balanceResponse['Data'] ?? [];

        return [
            'balance' => $this->number($balanceData['AvailableAmount'] ?? $balanceData['AvailableCashAmount'] ?? 0),
            'current_month_amount' => $this->sumAliyunBill($currentResponse),
            'previous_month_amount' => $this->sumAliyunBill($previousResponse),
            'currency' => strtoupper((string)($balanceData['Currency'] ?? $this->aliyunCurrency($currentResponse) ?? 'CNY')),
        ];
    }

    private function tencentSnapshot(CloudAccount $account, $currentMonth, $previousMonth)
    {
        $balanceResponse = $this->tencentRequest($account, 'DescribeAccountBalance', []);
        $currentResponse = $this->tencentRequest($account, 'DescribeBillSummary', [
            'Month' => $currentMonth,
            'GroupType' => 'business',
        ]);
        $previousResponse = $this->tencentRequest($account, 'DescribeBillSummary', [
            'Month' => $previousMonth,
            'GroupType' => 'business',
        ]);

        return [
            'balance' => $this->number($balanceResponse['Response']['RealBalance'] ?? $balanceResponse['Response']['Balance'] ?? 0) / 100,
            'current_month_amount' => $this->sumTencentBill($currentResponse),
            'previous_month_amount' => $this->sumTencentBill($previousResponse),
            'currency' => 'CNY',
        ];
    }

    private function ucloudSnapshot(CloudAccount $account, $currentMonth, $previousMonth)
    {
        $balanceResponse = $this->ucloudRequest($account, 'GetBalance');
        $balanceData = isset($balanceResponse['AccountInfo']) && is_array($balanceResponse['AccountInfo'])
            ? $balanceResponse['AccountInfo']
            : $balanceResponse;

        return [
            'balance' => $this->number($balanceData['AmountAvailable'] ?? $balanceData['Amount'] ?? 0),
            'current_month_amount' => $this->ucloudMonthAmount($account, $currentMonth),
            'previous_month_amount' => $this->ucloudMonthAmount($account, $previousMonth),
            'currency' => 'CNY',
        ];
    }

    private function aliyunRequest(CloudAccount $account, $action, array $parameters = [])
    {
        $accountKey = (string)($account->getKey() ?: spl_object_hash($account));
        $endpoints = array_values(array_unique(array_filter([
            $this->aliyunEndpointsByAccount[$accountKey] ?? null,
            self::ALIYUN_CHINA_ENDPOINT,
            self::ALIYUN_INTERNATIONAL_ENDPOINT,
        ])));
        $lastSiteError = null;

        foreach ($endpoints as $endpoint) {
            $requestParameters = array_merge([
                'Format' => 'JSON',
                'Version' => self::ALIYUN_VERSION,
                'AccessKeyId' => $this->accessKeyId($account),
                'SignatureMethod' => 'HMAC-SHA1',
                'SignatureVersion' => '1.0',
                'SignatureNonce' => bin2hex(random_bytes(16)),
                'Timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
                'Action' => $action,
            ], $parameters);
            $token = $this->securityToken($account);
            if ($token !== '') {
                $requestParameters['SecurityToken'] = $token;
            }
            ksort($requestParameters);
            $canonical = [];
            foreach ($requestParameters as $key => $value) {
                $canonical[] = $this->aliyunEncode($key) . '=' . $this->aliyunEncode($value);
            }
            $canonicalQuery = implode('&', $canonical);
            $stringToSign = 'GET&%2F&' . $this->aliyunEncode($canonicalQuery);
            $requestParameters['Signature'] = base64_encode(hash_hmac('sha1', $stringToSign, $this->accessKeySecret($account) . '&', true));

            $response = $this->jsonResponse('GET', $endpoint, ['query' => $requestParameters], '阿里云费用中心');
            $decoded = $response['data'];
            $code = (string)($decoded['Code'] ?? $decoded['code'] ?? '');
            $message = (string)($decoded['Message'] ?? $decoded['message'] ?? '');

            if (strcasecmp($code, 'AuthSiteFail') === 0) {
                $lastSiteError = $message;
                continue;
            }
            if ($response['status'] < 200 || $response['status'] >= 300) {
                throw new RuntimeException('阿里云费用中心请求失败（HTTP ' . $response['status'] . '）' . ($message ? '：' . $message : ''));
            }
            if (($decoded['Success'] ?? true) === false || ($code !== '' && !in_array($code, ['200', 'Success'], true))) {
                throw new RuntimeException(($code ?: 'AliyunError') . '：' . ($message ?: '阿里云费用中心请求失败'));
            }

            $this->aliyunEndpointsByAccount[$accountKey] = $endpoint;
            return $decoded;
        }

        throw new RuntimeException('阿里云账号站点识别失败，请确认 AccessKey 属于当前阿里云账号' . ($lastSiteError ? '：' . $lastSiteError : ''));
    }

    private function tencentRequest(CloudAccount $account, $action, array $payload)
    {
        $timestamp = time();
        $date = gmdate('Y-m-d', $timestamp);
        $service = 'billing';
        $payloadJson = json_encode((object)$payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $canonicalHeaders = 'content-type:application/json; charset=utf-8\n' .
            'host:' . self::TENCENT_HOST . '\n' .
            'x-tc-action:' . strtolower($action) . '\n';
        $signedHeaders = 'content-type;host;x-tc-action';
        $canonicalRequest = "POST\n/\n\n" . $canonicalHeaders . "\n" . $signedHeaders . "\n" . hash('sha256', $payloadJson);
        $scope = $date . '/' . $service . '/tc3_request';
        $stringToSign = "TC3-HMAC-SHA256\n" . $timestamp . "\n" . $scope . "\n" . hash('sha256', $canonicalRequest);
        $secretDate = hash_hmac('sha256', $date, 'TC3' . $this->accessKeySecret($account), true);
        $secretService = hash_hmac('sha256', $service, $secretDate, true);
        $secretSigning = hash_hmac('sha256', 'tc3_request', $secretService, true);
        $signature = hash_hmac('sha256', $stringToSign, $secretSigning);
        $authorization = 'TC3-HMAC-SHA256 Credential=' . $this->accessKeyId($account) . '/' . $scope .
            ', SignedHeaders=' . $signedHeaders . ', Signature=' . $signature;
        $headers = [
            'Authorization' => $authorization,
            'Content-Type' => 'application/json; charset=utf-8',
            'Host' => self::TENCENT_HOST,
            'X-TC-Action' => $action,
            'X-TC-Timestamp' => $timestamp,
            'X-TC-Version' => self::TENCENT_VERSION,
        ];
        $token = $this->securityToken($account);
        if ($token !== '') {
            $headers['X-TC-Token'] = $token;
        }
        $decoded = $this->jsonRequest('POST', self::TENCENT_ENDPOINT, [
            'headers' => $headers,
            'body' => $payloadJson,
        ], '腾讯云费用中心');
        if (!empty($decoded['Response']['Error'])) {
            $error = $decoded['Response']['Error'];
            throw new RuntimeException(($error['Code'] ?? 'TencentError') . '：' . ($error['Message'] ?? '腾讯云费用中心请求失败'));
        }
        return $decoded;
    }

    private function ucloudRequest(CloudAccount $account, $action, array $parameters = [])
    {
        $parameters = array_merge(['Action' => $action, 'PublicKey' => $this->accessKeyId($account)], $parameters);
        ksort($parameters);
        $signing = '';
        foreach ($parameters as $key => $value) {
            $signing .= $key . $this->ucloudValue($value);
        }
        $parameters['Signature'] = sha1($signing . $this->accessKeySecret($account));
        $decoded = $this->jsonRequest('GET', self::UCLOUD_ENDPOINT, ['query' => $parameters], 'UCloud 财务中心');
        if ((int)($decoded['RetCode'] ?? -1) !== 0) {
            throw new RuntimeException('UCloud ' . ($decoded['RetCode'] ?? 'Error') . '：' . ($decoded['Message'] ?? '财务中心请求失败'));
        }
        return $decoded;
    }

    private function ucloudMonthAmount(CloudAccount $account, $month)
    {
        $paid = $this->ucloudRequest($account, 'ListUBillOverview', [
            'BillingCycle' => $month,
            'Dimension' => 'product',
            'HideUnpaid' => 1,
        ]);
        $unpaid = $this->ucloudRequest($account, 'ListUBillOverview', [
            'BillingCycle' => $month,
            'Dimension' => 'product',
            'HideUnpaid' => 0,
        ]);
        return $this->number($paid['TotalPaidAmount'] ?? 0) + $this->number($unpaid['TotalUnpaidAmount'] ?? 0);
    }

    private function sumAliyunBill(array $response)
    {
        $items = $response['Data']['Items']['Item'] ?? [];
        if (!is_array($items)) {
            return 0.0;
        }
        if ($this->isAssociative($items)) {
            $items = [$items];
        }
        return array_reduce($items, function ($total, $item) {
            return $total + $this->number(is_array($item) ? ($item['PretaxAmount'] ?? $item['AfterTaxAmount'] ?? 0) : 0);
        }, 0.0);
    }

    private function aliyunCurrency(array $response)
    {
        $items = $response['Data']['Items']['Item'] ?? [];
        if ($this->isAssociative($items)) {
            return $items['Currency'] ?? null;
        }
        return isset($items[0]['Currency']) ? $items[0]['Currency'] : null;
    }

    private function sumTencentBill(array $response)
    {
        if ((int)($response['Response']['Ready'] ?? 1) === 0) {
            throw new RuntimeException('腾讯云账单正在初始化，请稍后刷新');
        }
        $items = $response['Response']['SummaryDetail'] ?? [];
        if (!is_array($items)) {
            return 0.0;
        }
        return array_reduce($items, function ($total, $item) {
            return $total + $this->number(is_array($item) ? ($item['RealTotalCost'] ?? 0) : 0);
        }, 0.0);
    }

    private function jsonRequest($method, $url, array $options, $label)
    {
        $response = $this->jsonResponse($method, $url, $options, $label);
        if ($response['status'] < 200 || $response['status'] >= 300) {
            $decoded = $response['data'];
            $message = $decoded['Message'] ?? $decoded['message'] ?? $decoded['Response']['Error']['Message'] ?? '';
            throw new RuntimeException($label . '请求失败（HTTP ' . $response['status'] . '）' . ($message ? '：' . $message : ''));
        }
        return $response['data'];
    }

    private function jsonResponse($method, $url, array $options, $label)
    {
        try {
            $response = (new Client([
                'timeout' => 25,
                'connect_timeout' => 8,
                'http_errors' => false,
            ]))->request($method, $url, $options);
        } catch (\Throwable $error) {
            throw new RuntimeException('无法连接' . $label . '：' . $error->getMessage(), 0, $error);
        }
        $status = $response->getStatusCode();
        $decoded = json_decode((string)$response->getBody(), true);
        if (!is_array($decoded)) {
            throw new RuntimeException($label . '返回了无法识别的数据（HTTP ' . $status . '）');
        }
        return ['status' => $status, 'data' => $decoded];
    }

    private function accessKeyId(CloudAccount $account)
    {
        return Crypt::decryptString($account->access_key_id_encrypted);
    }

    private function accessKeySecret(CloudAccount $account)
    {
        return Crypt::decryptString($account->access_key_secret_encrypted);
    }

    private function securityToken(CloudAccount $account)
    {
        return $account->security_token_encrypted
            ? Crypt::decryptString($account->security_token_encrypted)
            : '';
    }

    private function aliyunEncode($value)
    {
        return str_replace('%7E', '~', rawurlencode((string)$value));
    }

    private function ucloudValue($value)
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        return (string)$value;
    }

    private function number($value)
    {
        return is_numeric($value) ? (float)$value : 0.0;
    }

    private function isAssociative(array $value)
    {
        if ($value === []) {
            return false;
        }
        return array_keys($value) !== range(0, count($value) - 1);
    }
}
