<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddProbeFirstHealthyAt extends Migration
{
    public function up()
    {
        Schema::table('v2_security_node_state', function (Blueprint $table) {
            $table->unsignedInteger('first_healthy_at')->nullable()->after('failure_started_at');
            $table->index('first_healthy_at');
        });
        Schema::table('v2_node_block_event', function (Blueprint $table) {
            $table->unsignedInteger('monitoring_first_healthy_at')->nullable()->after('first_failed_at');
        });
    }

    public function down()
    {
        Schema::table('v2_security_node_state', function (Blueprint $table) {
            $table->dropIndex(['first_healthy_at']);
            $table->dropColumn('first_healthy_at');
        });
        Schema::table('v2_node_block_event', function (Blueprint $table) {
            $table->dropColumn('monitoring_first_healthy_at');
        });
    }
}
