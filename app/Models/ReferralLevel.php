<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralLevel extends Model
{
    protected $table = 'v2_referral_level';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
}
