<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

class RemoveCouponRedemptionCodes extends Migration
{
    public function up()
    {
        Schema::dropIfExists('v2_coupon_redemption_code');
    }

    public function down()
    {
        // 优惠券兑换码功能已废弃，不再恢复旧数据表。
    }
}
