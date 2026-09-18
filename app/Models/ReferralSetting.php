<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralSetting extends Model
{
    protected $table = 'v2_referral_setting';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];

    public static function current()
    {
        return static::first() ?: new static([
            'enabled' => 1,
            'first_order_min' => 0,
            'invitee_reward' => 0,
            'newcomer_coupon_id' => null,
            'newcomer_reward_valid_days' => 30,
            'base_commission_rate' => (int)config('v2board.invite_commission', 10),
            'freeze_days' => 3,
        ]);
    }
}
