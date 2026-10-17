<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddReferralLevelMemberDiscount extends Migration
{
    public function up()
    {
        Schema::table('v2_referral_level', function (Blueprint $table) {
            $table->unsignedTinyInteger('member_discount')->default(0)->after('commission_rate');
        });
    }

    public function down()
    {
        Schema::table('v2_referral_level', function (Blueprint $table) {
            $table->dropColumn('member_discount');
        });
    }
}
