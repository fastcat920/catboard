<?php

namespace Tests\Unit;

use App\Services\NodeSecurity\ExperimentService;
use App\Services\NodeSecurity\RiskService;
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
        $this->assertSame(0, $service->calculateScore(0, 0, 0));
        $this->assertSame(48, $service->calculateScore(1, 1, 1));
        $this->assertSame(100, $service->calculateScore(20, 20, 20));
    }
}
