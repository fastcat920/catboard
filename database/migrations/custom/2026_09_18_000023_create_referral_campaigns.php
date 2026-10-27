<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateReferralCampaigns extends Migration
{
    public function up()
    {
        Schema::create('v2_referral_campaign', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->text('description')->nullable();
            $table->text('description_en')->nullable();
            $table->unsignedInteger('starts_at')->index();
            $table->unsignedInteger('ends_at')->index();
            $table->enum('audience', ['all', 'new', 'existing'])->default('all');
            $table->text('plan_ids')->nullable();
            $table->unsignedInteger('first_order_min')->default(0);
            $table->decimal('commission_multiplier', 6, 2)->default(1);
            $table->enum('inviter_reward_type', ['none', 'balance', 'commission_balance', 'traffic', 'duration'])->default('none');
            $table->unsignedInteger('inviter_reward_value')->default(0);
            $table->unsignedInteger('bonus_required_invites')->default(0);
            $table->enum('invitee_reward_type', ['none', 'balance', 'traffic', 'duration'])->default('none');
            $table->unsignedInteger('invitee_reward_value')->default(0);
            $table->unsignedInteger('budget_total')->nullable();
            $table->unsignedInteger('per_user_limit')->nullable();
            $table->unsignedInteger('grant_limit')->nullable();
            $table->unsignedInteger('granted_count')->default(0);
            $table->unsignedInteger('spent_amount')->default(0);
            $table->boolean('enabled')->default(true)->index();
            $table->unsignedInteger('created_at');
            $table->unsignedInteger('updated_at');
        });
        Schema::table('v2_referral_reward', function (Blueprint $table) {
            $table->unsignedInteger('campaign_id')->nullable()->index()->after('order_id');
        });
    }

    public function down()
    {
        Schema::table('v2_referral_reward', function (Blueprint $table) {
            $table->dropIndex(['campaign_id']);
            $table->dropColumn('campaign_id');
        });
        Schema::dropIfExists('v2_referral_campaign');
    }
}
