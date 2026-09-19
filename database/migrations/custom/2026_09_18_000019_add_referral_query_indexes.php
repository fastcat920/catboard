<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddReferralQueryIndexes extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_referral_reward')) return;
        Schema::table('v2_referral_reward', function (Blueprint $table) {
            $table->index(['reward_type', 'status', 'created_at'], 'referral_type_status_created_idx');
            $table->index(['order_id', 'status'], 'referral_order_status_idx');
        });
        Schema::table('v2_user', function (Blueprint $table) {
            $table->index('invite_user_id', 'referral_user_inviter_idx');
        });
        Schema::table('v2_order', function (Blueprint $table) {
            $table->index(['status', 'invite_user_id'], 'referral_order_status_inviter_idx');
        });
    }

    public function down()
    {
        if (!Schema::hasTable('v2_referral_reward')) return;
        Schema::table('v2_referral_reward', function (Blueprint $table) {
            $table->dropIndex('referral_type_status_created_idx');
            $table->dropIndex('referral_order_status_idx');
        });
        Schema::table('v2_user', function (Blueprint $table) {
            $table->dropIndex('referral_user_inviter_idx');
        });
        Schema::table('v2_order', function (Blueprint $table) {
            $table->dropIndex('referral_order_status_inviter_idx');
        });
    }
}
