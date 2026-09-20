<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddReferralLevelRevenueRequirements extends Migration
{
    public function up()
    {
        Schema::table('v2_referral_level', function (Blueprint $table) {
            $table->unsignedBigInteger('required_revenue')->default(0)->after('required_invites');
            $table->unsignedBigInteger('retain_revenue')->default(0)->after('retain_invites');
        });
    }

    public function down()
    {
        Schema::table('v2_referral_level', function (Blueprint $table) {
            $table->dropColumn(['required_revenue', 'retain_revenue']);
        });
    }
}
