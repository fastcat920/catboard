<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

class DropReferralAdminLogTable extends Migration
{
    public function up()
    {
        Schema::dropIfExists('v2_referral_admin_log');
    }

    public function down()
    {
        // The audit feature was intentionally removed; rollback does not restore collected logs.
    }
}
