<?php

require __DIR__ . '/../app/Services/NewTrafficPeriod.php';

use App\Services\NewTrafficPeriod;

function calculate(string $now, string $expires, int $method = 0, int $used = 90, int $hold = 0): array
{
    $zone = new DateTimeZone('Asia/Shanghai');
    return NewTrafficPeriod::preview(true, false, $method, $used, 100, (new DateTimeImmutable($expires, $zone))->getTimestamp(), $hold, new DateTimeImmutable($now, $zone));
}
function check($condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$normal = calculate('2027-01-31 12:00:00', '2027-03-01');
check($normal['eligible'] && $normal['deduct_seconds'] === 12 * 3600, '28-day February qualifies at exactly 90% and only deducts the time to February');
check($normal['hold_until'] - (new DateTimeImmutable('2027-01-31 12:00:00', new DateTimeZone('Asia/Shanghai')))->getTimestamp() === 28 * 86400, 'early period duration must use the 28-day calendar cycle');
check(!calculate('2027-02-01', '2027-03-01')['eligible'], 'only the current period cannot be used twice');
check(!calculate('2027-01-31 12:00:00', '2027-03-01', 0, 89)['eligible'], '89 percent is not eligible');
check(calculate('2028-01-31 12:00:00', '2028-03-01')['eligible'], 'leap February qualifies');
check(calculate('2027-02-27 12:00:00', '2027-04-30', 1)['deduct_seconds'] === 12 * 3600, 'end-of-month anchor must clamp to February 28');
check(calculate('2027-02-27 12:00:00', '2028-02-29', 4)['deduct_seconds'] === 12 * 3600, 'February 29 annual anchor must clamp to February 28');
$held = calculate('2027-02-01 12:00:00', '2027-03-01', 0, 90, $normal['hold_until']);
check(!$held['eligible'], 'an already advanced period cannot consume its original boundary again');
check(calculate('2027-01-31', '2027-03-01', 2)['reason'] === 'NEW_PERIOD_NOT_ALLOWED', 'non-resetting plans are excluded');
$shorterFollowingMonth = calculate('2027-03-01 01:00:00', '2027-05-01');
check($shorterFollowingMonth['hold_until'] > $shorterFollowingMonth['reset_at'], 'original boundary must be skipped even when the following month is shorter');
echo "Natural calendar, 90% eligibility, leap dates and early reset hold passed\n";
