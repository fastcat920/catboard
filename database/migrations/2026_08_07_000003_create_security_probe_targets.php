<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSecurityProbeTargets extends Migration
{
    public function up()
    {
        Schema::create('v2_security_probe_target', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('server_type', 32);
            $table->unsignedInteger('server_id');
            $table->string('status', 16)->default('active');
            $table->unsignedInteger('created_by');
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->unique(['server_type', 'server_id'], 'probe_target_server_unique');
            $table->index(['status', 'updated_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_security_probe_target');
    }
}
