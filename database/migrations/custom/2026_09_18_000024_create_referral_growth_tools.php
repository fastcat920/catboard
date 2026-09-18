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
        Schema::create('v2_referral_leaderboard_setting', function (Blueprint $table) {
            $table->increments('id');
            $table->boolean('enabled')->default(false);
            $table->boolean('mask_email')->default(true);
            $table->text('reward_rules')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });
        Schema::create('v2_referral_leaderboard_award', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('period_key', 32);
            $table->enum('period_type', ['week', 'month'])->index();
            $table->unsignedInteger('user_id')->index();
            $table->unsignedInteger('rank');
            $table->unsignedInteger('reward_value')->default(0);
            $table->enum('status', ['granted', 'skipped', 'reversed'])->default('granted');
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->unique(['period_key', 'period_type', 'user_id'], 'referral_leaderboard_award_unique');
        });
    }

    public function down()
    {
        Schema::dropIfExists('v2_referral_leaderboard_award');
        Schema::dropIfExists('v2_referral_leaderboard_setting');
        Schema::dropIfExists('v2_referral_material');
        Schema::dropIfExists('v2_referral_visit');
    }
}
