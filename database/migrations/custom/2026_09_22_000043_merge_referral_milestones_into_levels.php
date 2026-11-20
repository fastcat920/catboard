<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MergeReferralMilestonesIntoLevels extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_referral_level') || !Schema::hasTable('v2_referral_milestone')) return;

        Schema::table('v2_referral_milestone', function (Blueprint $table) {
            $table->dropUnique(['required_invites']);
            $table->unsignedInteger('referral_level_id')->nullable()->after('id');
            $table->unique('referral_level_id', 'referral_milestone_level_unique');
        });

        DB::transaction(function () {
            $milestones = DB::table('v2_referral_milestone')->orderBy('required_invites')->orderBy('id')->get();
            foreach ($milestones as $milestone) {
                $level = DB::table('v2_referral_level')
                    ->where('required_invites', $milestone->required_invites)
                    ->where('required_revenue', 0)
                    ->orderBy('sort')->orderBy('id')->first();

                if (!$level) {
                    $inherited = DB::table('v2_referral_level')
                        ->where('required_invites', '<=', $milestone->required_invites)
                        ->where('required_revenue', 0)
                        ->orderBy('required_invites', 'DESC')->orderBy('sort', 'DESC')->orderBy('id', 'DESC')->first();
                    $now = time();
                    $levelId = DB::table('v2_referral_level')->insertGetId([
                        'name' => $milestone->name,
                        'name_en' => $milestone->name_en,
                        'description' => '达到本等级可领取一次性达标奖励',
                        'description_en' => 'Reach this level to receive a one-time achievement reward.',
                        'required_invites' => $milestone->required_invites,
                        'required_revenue' => 0,
                        'commission_rate' => $inherited ? $inherited->commission_rate : 10,
                        'member_discount' => $inherited ? $inherited->member_discount : 0,
                        'valid_days' => $inherited ? $inherited->valid_days : 0,
                        'retain_invites' => $inherited ? $inherited->retain_invites : 0,
                        'retain_revenue' => $inherited ? $inherited->retain_revenue : 0,
                        'sort' => 4290000000 - (int)$milestone->id,
                        'enabled' => $milestone->enabled,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                } else {
                    $levelId = $level->id;
                }

                DB::table('v2_referral_milestone')->where('id', $milestone->id)->update([
                    'referral_level_id' => $levelId,
                    'updated_at' => time(),
                ]);
            }

            DB::table('v2_referral_level')
                ->orderBy('required_invites')->orderBy('required_revenue')->orderBy('id')
                ->get()->values()->each(function ($level, $index) {
                    DB::table('v2_referral_level')->where('id', $level->id)->update([
                        'sort' => ($index + 1) * 10,
                        'updated_at' => time(),
                    ]);
                });
        });
    }

    public function down()
    {
        if (!Schema::hasTable('v2_referral_milestone') || !Schema::hasColumn('v2_referral_milestone', 'referral_level_id')) return;

        Schema::table('v2_referral_milestone', function (Blueprint $table) {
            $table->dropUnique('referral_milestone_level_unique');
            $table->dropColumn('referral_level_id');
            $table->unique('required_invites');
        });
    }
}
