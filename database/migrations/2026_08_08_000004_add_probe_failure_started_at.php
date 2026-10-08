<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddProbeFailureStartedAt extends Migration
{
    public function up()
    {
        Schema::table('v2_security_node_state', function (Blueprint $table) {
            $table->unsignedInteger('failure_started_at')->nullable()->after('consecutive_successes');
            $table->index('failure_started_at');
        });
    }

    public function down()
    {
        Schema::table('v2_security_node_state', function (Blueprint $table) {
            $table->dropIndex(['failure_started_at']);
            $table->dropColumn('failure_started_at');
        });
    }
}
