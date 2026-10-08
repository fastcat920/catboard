<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

class RemoveReferralLeaderboard extends Migration
{
    public function up()
    {
        Schema::dropIfExists('v2_referral_leaderboard_award');
        Schema::dropIfExists('v2_referral_leaderboard_setting');
    }

    public function down()
    {
        // The referral leaderboard feature was intentionally removed.
    }
}
