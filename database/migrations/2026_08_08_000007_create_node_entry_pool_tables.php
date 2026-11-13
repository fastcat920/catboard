<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateNodeEntryPoolTables extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_node_entry_pool')) Schema::create('v2_node_entry_pool', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->string('name', 96);
            $table->text('host_encrypted');
            $table->char('host_hash', 64);
            $table->unsignedInteger('port');
            $table->unsignedInteger('priority')->default(100);
            $table->boolean('is_primary')->default(false);
            $table->boolean('enabled')->default(true);
            $table->string('health_status', 32)->default('waiting');
            $table->unsignedInteger('last_checked_at')->nullable();
            $table->unsignedInteger('last_healthy_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['server_type', 'server_id', 'enabled'], 'node_entry_server_enabled');
            $table->index(['health_status', 'last_checked_at'], 'node_entry_health_time');
        });
        if (!Schema::hasTable('v2_node_entry_setting')) Schema::create('v2_node_entry_setting', function (Blueprint $table) {
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->string('delivery_mode', 24)->default('primary_only');
            $table->string('check_url')->default('http://www.gstatic.com/generate_204');
            $table->unsignedInteger('check_interval')->default(60);
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->primary(['server_type', 'server_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_node_entry_setting');
        Schema::dropIfExists('v2_node_entry_pool');
    }
}
