<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class EnableTotalReferralLeaderboardAwards extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_referral_leaderboard_award')) return;
        DB::statement("ALTER TABLE `v2_referral_leaderboard_award` MODIFY `period_type` ENUM('week','month','total') NOT NULL");
    }

    public function down()
    {
        if (!Schema::hasTable('v2_referral_leaderboard_award')) return;
        DB::table('v2_referral_leaderboard_award')->where('period_type', 'total')->delete();
        DB::statement("ALTER TABLE `v2_referral_leaderboard_award` MODIFY `period_type` ENUM('week','month') NOT NULL");
    }
}
