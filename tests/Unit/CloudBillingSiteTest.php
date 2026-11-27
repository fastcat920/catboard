<?php

namespace Tests\Unit;

use App\Models\CloudAccount;
use App\Services\CloudBillingService;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\TestCase;

class CloudBillingSiteTest extends TestCase
{
    #[DataProvider('endpointProvider')]
    public function test_cloud_billing_endpoints_follow_account_site($method, $site, $expected)
    {
        $account = new CloudAccount();
        $account->site = $site;
        $reflection = new ReflectionMethod(CloudBillingService::class, $method);

        $this->assertSame($expected, $reflection->invoke(new CloudBillingService(), $account));
    }

    public static function endpointProvider(): array
    {
        return [
            ['aliyunEndpoint', 'china', 'https://business.aliyuncs.com/'],
            ['aliyunEndpoint', 'international', 'https://business.ap-southeast-1.aliyuncs.com/'],
            ['tencentHost', 'china', 'billing.tencentcloudapi.com'],
            ['tencentHost', 'international', 'billing.intl.tencentcloudapi.com'],
            ['ucloudEndpoint', 'china', 'https://api.ucloud.cn/'],
            ['ucloudEndpoint', 'international', 'https://api.ucloud-global.com/'],
            ['ucloudEndpoint', null, 'https://api.ucloud.cn/'],
        ];
    }
}
