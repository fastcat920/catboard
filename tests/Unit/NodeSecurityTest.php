<?php

namespace Tests\Unit;

use App\Services\NodeSecurity\ExperimentService;
use App\Services\NodeSecurity\EventWindowService;
use App\Services\NodeSecurity\RiskService;
use App\Services\NodeSecurity\UaClassifierService;
use PHPUnit\Framework\TestCase;

class NodeSecurityTest extends TestCase
{
    public function testWatermarkAssignmentIsStableAndInRange()
    {
        $service = new ExperimentService();
        $first = $service->groupIndex(12, 998, 8);
        $this->assertSame($first, $service->groupIndex(12, 998, 8));
        $this->assertGreaterThanOrEqual(0, $first);
        $this->assertLessThan(8, $first);
    }

    public function testRiskScoreRewardsRepeatedAndWatermarkEvidenceAndCapsAtOneHundred()
    {
        $service = new RiskService();
        $this->assertSame(0, $service->calculateScore(0, 0));
        $this->assertSame(40, $service->calculateScore(1, 1));
        $this->assertSame(100, $service->calculateScore(20, 20));
    }

    public function testUserAgentClassificationSupportsCommonClients()
    {
        $service = new UaClassifierService();
        $fastcat = $service->classify('fastcat/3.1.0 clash-verge Platform/windows');
        $flclash = $service->classify('FlClash/v0.8.84 clash-verge Platform/android');
        $this->assertSame('FastCat', $fastcat['client_family']);
        $this->assertSame('3.1.0', $fastcat['client_version']);
        $this->assertSame('Windows', $fastcat['client_platform']);
        $this->assertSame('FlClash', $flclash['client_family']);
        $this->assertSame('Android', $flclash['client_platform']);
    }

    public function testEventWindowUsesMonitoringBaselineWhenItIsMoreRecent()
    {
        $event = (object)[
            'first_failed_at' => 1000,
            'monitoring_first_healthy_at' => 850,
        ];
        $window = (new EventWindowService())->calculate($event, 300);
        $this->assertSame(850, $window['start_at']);
        $this->assertSame(150, $window['effective_seconds']);
        $this->assertSame('monitoring_first_healthy', $window['source']);
    }

    public function testEventWindowKeepsConfiguredLimitForOlderOrMissingBaseline()
    {
        $service = new EventWindowService();
        $older = $service->calculate((object)[
            'first_failed_at' => 1000,
            'monitoring_first_healthy_at' => 500,
        ], 300);
        $missing = $service->calculate((object)['first_failed_at' => 1000], 300);
        $this->assertSame(700, $older['start_at']);
        $this->assertSame(700, $missing['start_at']);
        $this->assertFalse($missing['has_baseline']);
    }
}
