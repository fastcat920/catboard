<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralCampaign extends Model
{
    protected $table = 'v2_referral_campaign';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
    protected $casts = ['plan_ids' => 'array'];
}
