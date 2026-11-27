<?php

namespace App\Services;

use DateTimeImmutable;

final class NewTrafficPeriod
{
    public static function preview(
        bool $enabled, bool $banned, ?int $method, int $used, int $quota,
        ?int $expiresAt, int $notBefore, DateTimeImmutable $now
    ): array {
        $result = ['eligible' => false, 'reason' => 'NEW_PERIOD_NOT_ALLOWED'];
        if (!$enabled || $banned || $quota <= 0 || $expiresAt === null
            || $expiresAt <= $now->getTimestamp() || !in_array($method, [0, 1, 3, 4], true)) {
            return $result;
        }
        if ($used < $quota - intdiv($quota, 10)) {
            $result['reason'] = 'NEW_PERIOD_USAGE_TOO_LOW';
            return $result;
        }

        $expiry = $now->setTimestamp($expiresAt);
        $first = self::scheduledBoundary($now, $expiry, $method, $notBefore);
        $second = self::boundary($first, $expiry, $method);
        // Expiry-based monthly resets stop in the final 25 days.
        if ($expiresAt < $second->getTimestamp()
            || ($method === 1 && $expiresAt - $first->getTimestamp() <= 25 * 86400)) {
            $result['reason'] = 'NEW_PERIOD_INSUFFICIENT_DURATION';
            return $result;
        }
        $deduct = $first->getTimestamp() - $now->getTimestamp();

        return [
            'eligible' => true,
            'reason' => null,
            'reset_at' => $first->getTimestamp(),
            'deduct_seconds' => $deduct,
            'current_expires_at' => $expiresAt,
            'new_expires_at' => $expiresAt - $deduct,
            'hold_until' => max($first->getTimestamp() + 1, $second->getTimestamp() - $deduct),
        ];
    }

    public static function nextResetAt(
        DateTimeImmutable $now, int $expiresAt, int $method, int $notBefore
    ): ?int {
        if ($expiresAt <= $now->getTimestamp() || !in_array($method, [0, 1, 3, 4], true)) {
            return null;
        }
        $next = self::scheduledBoundary($now, $now->setTimestamp($expiresAt), $method, $notBefore)->getTimestamp();
        if ($next >= $expiresAt || ($method === 1 && $expiresAt - $next <= 25 * 86400)) {
            return null;
        }
        return $next;
    }

    private static function scheduledBoundary(
        DateTimeImmutable $now, DateTimeImmutable $expiry, int $method, int $notBefore
    ): DateTimeImmutable {
        $first = self::boundary($now, $expiry, $method);
        while ($first->getTimestamp() < $notBefore) {
            $first = self::boundary($first, $expiry, $method);
        }
        return $first;
    }

    private static function boundary(
        DateTimeImmutable $after, DateTimeImmutable $expiry, int $method
    ): DateTimeImmutable {
        $annual = $method === 3 || $method === 4;
        $year = (int) $after->format('Y');
        $month = $annual ? ($method === 3 ? 1 : (int) $expiry->format('n')) : (int) $after->format('n');
        $day = $method === 0 || $method === 3 ? 1 : (int) $expiry->format('j');
        $candidate = self::dayInMonth($after, $year, $month, $day);
        if ($candidate <= $after) {
            $base = $candidate->modify('first day of this month')->modify($annual ? '+1 year' : '+1 month');
            return self::dayInMonth($base, (int) $base->format('Y'), (int) $base->format('n'), $day);
        }
        return $candidate;
    }

    public static function dayInMonth(DateTimeImmutable $base, int $year, int $month, int $day): DateTimeImmutable
    {
        $start = $base->setDate($year, $month, 1)->setTime(0, 0);
        return $start->setDate($year, $month, min($day, (int) $start->format('t')));
    }
}
