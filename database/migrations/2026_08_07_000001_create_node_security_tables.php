<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateNodeSecurityTables extends Migration
{
    public function up()
    {
        Schema::create('v2_node_snapshot', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('version', 64)->unique();
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->unsignedBigInteger('watermark_group_id')->nullable();
            $table->string('server_name')->nullable();
            $table->string('host_hash', 64);
            $table->text('host_encrypted')->nullable();
            $table->string('port', 32)->nullable();
            $table->string('config_hash', 64);
            $table->unsignedInteger('published_at');
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['server_type', 'server_id', 'published_at'], 'node_snapshot_server_time');
            $table->index('watermark_group_id');
        });

        Schema::create('v2_node_access_log', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('user_id');
            $table->string('session_id', 64)->nullable();
            $table->text('snapshot_ids')->nullable();
            $table->string('snapshot_set_hash', 64)->nullable();
            $table->string('endpoint', 64);
            $table->string('request_ip', 64)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->string('device_hash', 64)->nullable();
            $table->string('etag', 64)->nullable();
            $table->unsignedSmallInteger('response_status')->default(200);
            $table->unsignedInteger('response_bytes')->default(0);
            $table->unsignedInteger('duration_ms')->default(0);
            $table->unsignedInteger('requested_at');
            $table->unsignedInteger('created_at');
            $table->index(['user_id', 'requested_at'], 'node_access_user_time');
            $table->index(['requested_at', 'response_status'], 'node_access_time_status');
            $table->index('snapshot_set_hash');
            $table->index('ip_hash');
            $table->index('device_hash');
        });

        Schema::create('v2_node_block_event', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->unsignedBigInteger('snapshot_id')->nullable();
            $table->unsignedBigInteger('watermark_group_id')->nullable();
            $table->string('event_type', 32)->default('blocked');
            $table->string('status', 32)->default('suspected');
            $table->unsignedInteger('first_failed_at');
            $table->unsignedInteger('confirmed_at')->nullable();
            $table->text('evidence')->nullable();
            $table->text('remark')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['server_type', 'server_id', 'first_failed_at'], 'node_event_server_time');
            $table->index(['status', 'first_failed_at']);
            $table->index('watermark_group_id');
        });

        Schema::create('v2_security_user_score', function (Blueprint $table) {
            $table->unsignedInteger('user_id')->primary();
            $table->unsignedSmallInteger('risk_score')->default(0);
            $table->unsignedInteger('event_hits')->default(0);
            $table->unsignedInteger('early_access_hits')->default(0);
            $table->unsignedInteger('watermark_hits')->default(0);
            $table->unsignedInteger('unique_ips')->default(0);
            $table->unsignedInteger('unique_devices')->default(0);
            $table->string('status', 32)->default('normal');
            $table->text('risk_reasons')->nullable();
            $table->unsignedInteger('last_risk_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['risk_score', 'last_risk_at']);
            $table->index('status');
        });

        Schema::create('v2_watermark_experiment', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('name');
            $table->string('status', 32)->default('draft');
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->unsignedInteger('round')->default(1);
            $table->unsignedInteger('created_by');
            $table->text('notes')->nullable();
            $table->unsignedInteger('started_at')->nullable();
            $table->unsignedInteger('ended_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['status', 'started_at']);
        });

        Schema::create('v2_watermark_group', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('experiment_id');
            $table->string('name', 64);
            $table->boolean('is_control')->default(false);
            $table->string('server_type', 32)->nullable();
            $table->unsignedInteger('server_id')->nullable();
            $table->text('watermark_host_encrypted')->nullable();
            $table->string('watermark_host_hash', 64)->nullable();
            $table->string('watermark_port', 32)->nullable();
            $table->string('status', 32)->default('active');
            $table->unsignedInteger('failure_count')->default(0);
            $table->unsignedInteger('last_check_at')->nullable();
            $table->boolean('last_check_ok')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['experiment_id', 'status']);
            $table->index(['server_type', 'server_id']);
        });

        Schema::create('v2_watermark_group_user', function (Blueprint $table) {
            $table->unsignedBigInteger('group_id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('assigned_at');
            $table->primary(['group_id', 'user_id']);
            $table->index('user_id');
        });

        Schema::create('v2_security_alert', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('type', 64);
            $table->string('severity', 16)->default('warning');
            $table->string('title');
            $table->text('payload')->nullable();
            $table->unsignedInteger('user_id')->nullable();
            $table->unsignedBigInteger('event_id')->nullable();
            $table->unsignedInteger('read_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->index(['read_at', 'created_at']);
        });

        Schema::create('v2_security_setting', function (Blueprint $table) {
            $table->string('key', 96)->primary();
            $table->text('value')->nullable();
            $table->unsignedInteger('updated_at');
        });

        Schema::create('v2_security_admin_log', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('admin_id');
            $table->string('action', 96);
            $table->string('target_type', 64)->nullable();
            $table->string('target_id', 64)->nullable();
            $table->text('payload')->nullable();
            $table->string('request_ip', 64)->nullable();
            $table->unsignedInteger('created_at');
            $table->index(['admin_id', 'created_at']);
            $table->index(['target_type', 'target_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_security_admin_log');
        Schema::dropIfExists('v2_security_setting');
        Schema::dropIfExists('v2_security_alert');
        Schema::dropIfExists('v2_watermark_group_user');
        Schema::dropIfExists('v2_watermark_group');
        Schema::dropIfExists('v2_watermark_experiment');
        Schema::dropIfExists('v2_security_user_score');
        Schema::dropIfExists('v2_node_block_event');
        Schema::dropIfExists('v2_node_access_log');
        Schema::dropIfExists('v2_node_snapshot');
    }
}
