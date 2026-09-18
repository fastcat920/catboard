<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralMilestone extends Model
{
    protected $table = 'v2_referral_milestone';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
}
