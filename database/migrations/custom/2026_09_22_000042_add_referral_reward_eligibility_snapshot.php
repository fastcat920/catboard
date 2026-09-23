<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddReferralRewardEligibilitySnapshot extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_referral_setting')
            && !Schema::hasColumn('v2_referral_setting', 'no_active_plan_reward_policy')) {
            Schema::table('v2_referral_setting', function (Blueprint $table) {
                $table->string('no_active_plan_reward_policy', 32)
                    ->default('allow_all')
                    ->after('monthly_reward_limit');
            });
        }

        if (Schema::hasTable('v2_user')) {
            $addCommissionEligibility = !Schema::hasColumn('v2_user', 'invite_commission_eligible');
            $addInviteeEligibility = !Schema::hasColumn('v2_user', 'invitee_reward_eligible');
            $addEvaluatedAt = !Schema::hasColumn('v2_user', 'invite_reward_evaluated_at');
            if ($addCommissionEligibility || $addInviteeEligibility || $addEvaluatedAt) {
                Schema::table('v2_user', function (Blueprint $table) use ($addCommissionEligibility, $addInviteeEligibility, $addEvaluatedAt) {
                    if ($addCommissionEligibility) {
                        $table->boolean('invite_commission_eligible')->nullable()->after('invite_user_id');
                    }
                    if ($addInviteeEligibility) {
                        $table->boolean('invitee_reward_eligible')->nullable()->after('invite_commission_eligible');
                    }
                    if ($addEvaluatedAt) {
                        $table->unsignedInteger('invite_reward_evaluated_at')->nullable()->after('invitee_reward_eligible');
                    }
                });
            }
        }
    }

    public function down()
    {
        if (Schema::hasTable('v2_user')) {
            $columns = array_values(array_filter([
                'invite_commission_eligible',
                'invitee_reward_eligible',
                'invite_reward_evaluated_at',
            ], function ($column) {
                return Schema::hasColumn('v2_user', $column);
            }));
            if ($columns) {
                Schema::table('v2_user', function (Blueprint $table) use ($columns) {
                    $table->dropColumn($columns);
                });
            }
        }

        if (Schema::hasTable('v2_referral_setting')
            && Schema::hasColumn('v2_referral_setting', 'no_active_plan_reward_policy')) {
            Schema::table('v2_referral_setting', function (Blueprint $table) {
                $table->dropColumn('no_active_plan_reward_policy');
            });
        }
    }
}
