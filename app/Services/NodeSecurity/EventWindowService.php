<?php

namespace App\Services\NodeSecurity;

class EventWindowService
{
    public function calculate($event, int $configuredWindow): array
    {
        $failedAt = max(0, (int)$event->first_failed_at);
        $configuredWindow = max(30, $configuredWindow);
        $configuredStart = max(0, $failedAt - $configuredWindow);
        $firstHealthyAt = isset($event->monitoring_first_healthy_at)
            ? (int)$event->monitoring_first_healthy_at
            : 0;
        $hasValidBaseline = $firstHealthyAt > 0 && $firstHealthyAt <= $failedAt;
        $startAt = $hasValidBaseline ? max($configuredStart, $firstHealthyAt) : $configuredStart;

        return [
            'start_at' => $startAt,
            'end_at' => $failedAt,
            'configured_seconds' => $configuredWindow,
            'effective_seconds' => max(0, $failedAt - $startAt),
            'source' => $hasValidBaseline && $firstHealthyAt > $configuredStart
                ? 'monitoring_first_healthy'
                : 'configured_window',
            'has_baseline' => $hasValidBaseline,
        ];
    }
}
