<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ExpandReferralRewards extends Migration
{
    public function up()
    {
        Schema::table('v2_referral_setting', function (Blueprint $table) {
            $table->unsignedInteger('newcomer_coupon_id')->nullable()->after('invitee_reward');
            $table->unsignedSmallInteger('newcomer_reward_valid_days')->default(30)->after('newcomer_coupon_id');
        });
        Schema::create('v2_referral_coupon_grant', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('user_id')->index();
            $table->unsignedInteger('inviter_id')->nullable()->index();
            $table->unsignedInteger('template_coupon_id');
            $table->unsignedInteger('coupon_id')->unique();
            $table->enum('status', ['issued', 'used', 'expired', 'revoked'])->default('issued')->index();
            $table->unsignedInteger('expires_at')->index();
            $table->unsignedInteger('used_at')->nullable();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
            $table->unique(['user_id', 'template_coupon_id'], 'referral_coupon_user_template_unique');
        });
        DB::statement("ALTER TABLE `v2_referral_milestone` MODIFY `reward_type` ENUM('balance','commission_balance','traffic','duration') NOT NULL DEFAULT 'balance'");
        DB::statement("ALTER TABLE `v2_referral_reward` MODIFY `reward_type` ENUM('balance','commission_balance','level','effective_invite','traffic','duration') NOT NULL");
        Schema::table('v2_referral_level', function (Blueprint $table) {
            $table->string('name_en')->nullable()->after('name');
            $table->string('description')->nullable()->after('name_en');
            $table->string('description_en')->nullable()->after('description');
            $table->unsignedSmallInteger('valid_days')->default(0)->after('commission_rate');
            $table->unsignedInteger('retain_invites')->default(0)->after('valid_days');
        });
        Schema::table('v2_user', function (Blueprint $table) {
            $table->unsignedInteger('referral_level_id')->nullable()->index()->after('commission_rate');
            $table->unsignedInteger('referral_level_expires_at')->nullable()->index()->after('referral_level_id');
        });
    }

    public function down()
    {
        Schema::table('v2_user', function (Blueprint $table) {
            $table->dropIndex(['referral_level_id']);
            $table->dropIndex(['referral_level_expires_at']);
            $table->dropColumn(['referral_level_id', 'referral_level_expires_at']);
        });
        Schema::table('v2_referral_level', function (Blueprint $table) {
            $table->dropColumn(['name_en', 'description', 'description_en', 'valid_days', 'retain_invites']);
        });
        DB::statement("ALTER TABLE `v2_referral_reward` MODIFY `reward_type` ENUM('balance','commission_balance','level','effective_invite') NOT NULL");
        DB::statement("ALTER TABLE `v2_referral_milestone` MODIFY `reward_type` ENUM('balance','commission_balance') NOT NULL DEFAULT 'balance'");
        Schema::dropIfExists('v2_referral_coupon_grant');
        Schema::table('v2_referral_setting', function (Blueprint $table) {
            $table->dropColumn(['newcomer_coupon_id', 'newcomer_reward_valid_days']);
        });
    }
}
