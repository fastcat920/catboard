<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddProtocolProbeSupport extends Migration
{
    public function up()
    {
        Schema::table('v2_security_probe_target', function (Blueprint $table) {
            $table->boolean('protocol_check_enabled')->default(false)->after('status');
            $table->string('protocol_type', 24)->nullable()->after('protocol_check_enabled');
            $table->text('protocol_share_encrypted')->nullable()->after('protocol_type');
            $table->string('protocol_config_hash', 64)->nullable()->after('protocol_share_encrypted');
            $table->unsignedInteger('protocol_interval_seconds')->default(300)->after('protocol_config_hash');
            $table->unsignedInteger('protocol_run_requested_at')->nullable()->after('protocol_interval_seconds');
            $table->unsignedInteger('protocol_updated_at')->nullable()->after('protocol_run_requested_at');
        });
        Schema::table('v2_security_probe_result', function (Blueprint $table) {
            $table->string('check_type', 16)->default('tcp')->after('snapshot_id');
            $table->string('error_stage', 32)->nullable()->after('error_code');
            $table->index(['check_type', 'server_type', 'server_id', 'checked_at'], 'probe_result_check_target_time');
        });
        Schema::table('v2_security_node_state', function (Blueprint $table) {
            $table->string('protocol_status', 32)->default('unconfigured')->after('status');
            $table->string('protocol_error_stage', 32)->nullable()->after('protocol_status');
            $table->string('protocol_error_code', 64)->nullable()->after('protocol_error_stage');
            $table->unsignedInteger('protocol_latency_ms')->nullable()->after('protocol_error_code');
            $table->unsignedInteger('protocol_last_checked_at')->nullable()->after('protocol_latency_ms');
            $table->unsignedInteger('protocol_failure_started_at')->nullable()->after('protocol_last_checked_at');
            $table->unsignedInteger('protocol_consecutive_failures')->default(0)->after('protocol_failure_started_at');
            $table->unsignedInteger('protocol_consecutive_successes')->default(0)->after('protocol_consecutive_failures');
            $table->unsignedBigInteger('protocol_active_event_id')->nullable()->after('protocol_consecutive_successes');
        });
    }

    public function down()
    {
        Schema::table('v2_security_node_state', function (Blueprint $table) {
            $table->dropColumn([
                'protocol_status', 'protocol_error_stage', 'protocol_error_code', 'protocol_latency_ms',
                'protocol_last_checked_at', 'protocol_failure_started_at', 'protocol_consecutive_failures',
                'protocol_consecutive_successes', 'protocol_active_event_id',
            ]);
        });
        Schema::table('v2_security_probe_result', function (Blueprint $table) {
            $table->dropIndex('probe_result_check_target_time');
            $table->dropColumn(['check_type', 'error_stage']);
        });
        Schema::table('v2_security_probe_target', function (Blueprint $table) {
            $table->dropColumn([
                'protocol_check_enabled', 'protocol_type', 'protocol_share_encrypted', 'protocol_config_hash',
                'protocol_interval_seconds', 'protocol_run_requested_at', 'protocol_updated_at',
            ]);
        });
    }
}
