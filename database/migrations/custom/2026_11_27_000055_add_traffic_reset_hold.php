<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddTrafficResetHold extends Migration
{
    public function up()
    {
        Schema::table('v2_user', function (Blueprint $table) {
            $table->unsignedInteger('traffic_reset_not_before')->nullable();
        });
    }

    public function down()
    {
        Schema::table('v2_user', function (Blueprint $table) {
            $table->dropColumn('traffic_reset_not_before');
        });
    }
}
