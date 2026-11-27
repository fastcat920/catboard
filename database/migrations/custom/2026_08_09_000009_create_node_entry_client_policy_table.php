<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateNodeEntryClientPolicyTable extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_node_entry_client_policy')) return;
        Schema::create('v2_node_entry_client_policy', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->string('client_family', 64);
            $table->string('client_platform', 24)->nullable();
            $table->string('min_version', 32)->nullable();
            $table->string('max_version', 32)->nullable();
            $table->string('delivery_mode', 24);
            $table->string('check_url');
            $table->unsignedInteger('check_interval')->default(60);
            $table->unsignedInteger('priority')->default(100);
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->index(['server_type', 'server_id', 'enabled'], 'entry_client_policy_server');
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_node_entry_client_policy');
    }
}
