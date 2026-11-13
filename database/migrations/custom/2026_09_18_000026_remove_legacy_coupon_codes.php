<?php
use Illuminate\Database\Migrations\Migration;use Illuminate\Database\Schema\Blueprint;use Illuminate\Support\Facades\Schema;
class RemoveLegacyCouponCodes extends Migration { public function up(){Schema::dropIfExists('v2_referral_coupon_grant');Schema::dropIfExists('v2_coupon');Schema::table('v2_referral_setting',function(Blueprint $t){if(Schema::hasColumn('v2_referral_setting','newcomer_coupon_id'))$t->dropColumn('newcomer_coupon_id');if(Schema::hasColumn('v2_referral_setting','newcomer_reward_valid_days'))$t->dropColumn('newcomer_reward_valid_days');});}public function down(){} }
