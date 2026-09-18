<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralCouponGrant extends Model
{
    protected $table = 'v2_referral_coupon_grant';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
}
