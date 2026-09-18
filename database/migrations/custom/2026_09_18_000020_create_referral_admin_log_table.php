<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateReferralAdminLogTable extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_referral_admin_log')) return;
        Schema::create('v2_referral_admin_log', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('admin_id')->index();
            $table->string('action', 64)->index();
            $table->string('target_type', 32);
            $table->string('target_id', 64)->nullable();
            $table->text('before_data')->nullable();
            $table->text('after_data')->nullable();
            $table->string('request_ip', 64)->nullable();
            $table->unsignedInteger('created_at')->index();
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_referral_admin_log');
    }
}
