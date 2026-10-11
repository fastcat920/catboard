<?php

namespace Tests\Unit;

use App\Http\Controllers\V1\Admin\AliyunDnsController;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class AliyunDnsControllerTest extends TestCase
{
    public function testRequestSourcesAreNormalizedFromAliyunNestedJsonValues()
    {
        $method = new ReflectionMethod(AliyunDnsController::class, 'stringList');
        $method->setAccessible(true);

        $sources = $method->invoke(new AliyunDnsController(), [
            'RequestSource' => [
                'RequestSource' => ['["default"]', '["telecom", "mobile"]', 'default'],
            ],
        ]);

        $this->assertSame(['default', 'telecom', 'mobile'], $sources);
    }
}
