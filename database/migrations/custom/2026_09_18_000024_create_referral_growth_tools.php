<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateReferralGrowthTools extends Migration
{
    public function up()
    {
        Schema::create('v2_referral_visit', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('invite_code', 32)->index();
            $table->string('channel', 50)->default('direct')->index();
            $table->string('visitor_hash', 64)->index();
            $table->unsignedInteger('user_id')->nullable()->index();
            $table->string('ip_hash', 64)->nullable();
            $table->unsignedInteger('created_at')->index();
        });
        Schema::create('v2_referral_material', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->text('copy_zh')->nullable();
            $table->text('copy_en')->nullable();
            $table->longText('image_data')->nullable();
            $table->boolean('enabled')->default(true)->index();
            $table->unsignedInteger('sort')->default(0);
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_referral_material');
        Schema::dropIfExists('v2_referral_visit');
    }
}
