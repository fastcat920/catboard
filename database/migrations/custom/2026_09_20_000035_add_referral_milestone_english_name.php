<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddReferralMilestoneEnglishName extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_referral_milestone') && !Schema::hasColumn('v2_referral_milestone', 'name_en')) {
            Schema::table('v2_referral_milestone', function (Blueprint $table) {
                $table->string('name_en')->nullable()->after('name');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('v2_referral_milestone') && Schema::hasColumn('v2_referral_milestone', 'name_en')) {
            Schema::table('v2_referral_milestone', function (Blueprint $table) {
                $table->dropColumn('name_en');
            });
        }
    }
}
