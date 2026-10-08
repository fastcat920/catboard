<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateNodeSecurityProbeTables extends Migration
{
    public function up()
    {
        Schema::create('v2_security_probe', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('name', 96);
            $table->string('region', 32)->default('CN');
            $table->string('carrier', 32)->default('unknown');
            $table->string('secret_hash', 64);
            $table->text('secret_encrypted');
            $table->string('status', 16)->default('active');
            $table->string('last_ip', 64)->nullable();
            $table->string('version', 32)->nullable();
            $table->unsignedInteger('last_seen_at')->nullable();
            $table->unsignedInteger('created_by');
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['status', 'last_seen_at']);
            $table->index(['region', 'carrier']);
        });

        Schema::create('v2_security_probe_result', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('probe_id')->nullable();
            $table->string('probe_region', 32);
            $table->string('probe_carrier', 32);
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->unsignedBigInteger('snapshot_id')->nullable();
            $table->boolean('success');
            $table->unsignedInteger('latency_ms')->nullable();
            $table->string('error_code', 64)->nullable();
            $table->unsignedInteger('checked_at');
            $table->unsignedInteger('created_at');
            $table->index(['server_type', 'server_id', 'checked_at'], 'probe_result_server_time');
            $table->index(['probe_id', 'checked_at']);
            $table->index(['success', 'checked_at']);
        });

        Schema::create('v2_security_node_state', function (Blueprint $table) {
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->string('status', 32)->default('unknown');
            $table->unsignedInteger('consecutive_failures')->default(0);
            $table->unsignedInteger('consecutive_successes')->default(0);
            $table->unsignedInteger('domestic_ok')->default(0);
            $table->unsignedInteger('domestic_failed')->default(0);
            $table->unsignedInteger('overseas_ok')->default(0);
            $table->unsignedInteger('overseas_failed')->default(0);
            $table->unsignedBigInteger('active_event_id')->nullable();
            $table->unsignedInteger('last_checked_at')->nullable();
            $table->unsignedInteger('last_changed_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->primary(['server_type', 'server_id']);
            $table->index(['status', 'last_checked_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_security_node_state');
        Schema::dropIfExists('v2_security_probe_result');
        Schema::dropIfExists('v2_security_probe');
    }
}
