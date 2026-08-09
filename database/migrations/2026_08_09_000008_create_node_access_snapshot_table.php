<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateNodeAccessSnapshotTable extends Migration
{
    public function up()
    {
        Schema::create('v2_node_access_snapshot', function (Blueprint $table) {
            $table->unsignedBigInteger('access_log_id');
            $table->unsignedInteger('user_id');
            $table->unsignedBigInteger('snapshot_id');
            $table->unsignedInteger('requested_at');
            $table->unsignedInteger('created_at');
            $table->primary(['access_log_id', 'snapshot_id'], 'node_access_snapshot_primary');
            $table->index(['snapshot_id', 'user_id'], 'node_access_snapshot_snapshot_user');
            $table->index(['user_id', 'snapshot_id'], 'node_access_snapshot_user_snapshot');
            $table->index(['snapshot_id', 'requested_at'], 'node_access_snapshot_snapshot_time');
            $table->index(['user_id', 'requested_at'], 'node_access_snapshot_user_time');
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_node_access_snapshot');
    }
}
