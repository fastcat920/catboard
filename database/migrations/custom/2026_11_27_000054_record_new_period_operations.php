<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RecordNewPeriodOperations extends Migration
{
    public function up()
    {
        Schema::create('v2_new_period_receipt', function (Blueprint $table) {
            $table->unsignedInteger('user_id');
            $table->uuid('operation_id');
            $table->unsignedInteger('created_at');
            $table->primary(['user_id', 'operation_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_new_period_receipt');
    }
}
