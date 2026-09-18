<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralLeaderboardSetting extends Model
{
    protected $table = 'v2_referral_leaderboard_setting';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
    protected $casts = ['reward_rules' => 'array'];

    public static function current()
    {
        return static::first() ?: static::create(['enabled' => 0, 'mask_email' => 1, 'reward_rules' => []]);
    }
}
