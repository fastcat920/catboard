# Referral growth program

Run `php artisan v2board:upgrade-database` after deployment. The migration creates
the referral settings, levels, milestones, and idempotent reward ledger, and
backfills historical qualified referrals without granting retroactive money.

The program starts with the existing global commission percentage, no invitee
cash reward, and a three-day commission freeze. Example levels and milestones
are created disabled so an administrator can review them before activation.

An invite becomes qualified when the invited user completes their first paid
plan order at or above the configured minimum amount. Each invited user can
qualify only once. Reward event keys are unique, so repeated payment callbacks
cannot grant the same reward twice.

The administrator entry named `邀请管理` provides:

- conversion and revenue overview;
- first-order threshold, invitee reward, base rate, freeze period, and monthly cap;
- referral levels and milestone rules;
- referral relationships and reward ledger.

The user invite page shows the current level, qualified referral count,
commission rate, and progress toward the next enabled milestone.
