<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CreateReferralProgramTables extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_referral_setting')) {
            Schema::create('v2_referral_setting', function (Blueprint $table) {
                $table->increments('id');
                $table->boolean('enabled')->default(true);
                $table->unsignedInteger('first_order_min')->default(0);
                $table->unsignedInteger('invitee_reward')->default(0);
                $table->unsignedTinyInteger('base_commission_rate')->default(10);
                $table->unsignedSmallInteger('freeze_days')->default(3);
                $table->unsignedInteger('monthly_reward_limit')->nullable();
                $table->unsignedInteger('created_at');
                $table->unsignedInteger('updated_at');
            });
            DB::table('v2_referral_setting')->insert([
                'enabled' => 1,
                'base_commission_rate' => (int)config('v2board.invite_commission', 10),
                'freeze_days' => 3,
                'created_at' => time(),
                'updated_at' => time(),
            ]);
        }

        if (!Schema::hasTable('v2_referral_level')) {
            Schema::create('v2_referral_level', function (Blueprint $table) {
                $table->increments('id');
                $table->string('name');
                $table->unsignedInteger('required_invites')->default(0);
                $table->unsignedTinyInteger('commission_rate')->default(10);
                $table->unsignedInteger('sort')->default(0);
                $table->boolean('enabled')->default(true);
                $table->unsignedInteger('created_at');
                $table->unsignedInteger('updated_at');
            });
            DB::table('v2_referral_level')->insert([
                ['name' => '推广大使', 'required_invites' => 5, 'commission_rate' => 12, 'sort' => 1, 'enabled' => 0, 'created_at' => time(), 'updated_at' => time()],
                ['name' => '高级推广', 'required_invites' => 10, 'commission_rate' => 15, 'sort' => 2, 'enabled' => 0, 'created_at' => time(), 'updated_at' => time()],
                ['name' => '合作伙伴', 'required_invites' => 20, 'commission_rate' => 20, 'sort' => 3, 'enabled' => 0, 'created_at' => time(), 'updated_at' => time()],
            ]);
        }

        if (!Schema::hasTable('v2_referral_milestone')) {
            Schema::create('v2_referral_milestone', function (Blueprint $table) {
                $table->increments('id');
                $table->string('name');
                $table->unsignedInteger('required_invites');
                $table->enum('reward_type', ['balance', 'commission_balance'])->default('balance');
                $table->unsignedInteger('reward_value');
                $table->boolean('enabled')->default(true);
                $table->unsignedInteger('created_at');
                $table->unsignedInteger('updated_at');
                $table->unique('required_invites');
            });
            DB::table('v2_referral_milestone')->insert([
                ['name' => '邀请 3 人奖励', 'required_invites' => 3, 'reward_type' => 'balance', 'reward_value' => 500, 'enabled' => 0, 'created_at' => time(), 'updated_at' => time()],
                ['name' => '邀请 5 人奖励', 'required_invites' => 5, 'reward_type' => 'balance', 'reward_value' => 1000, 'enabled' => 0, 'created_at' => time(), 'updated_at' => time()],
                ['name' => '邀请 10 人奖励', 'required_invites' => 10, 'reward_type' => 'balance', 'reward_value' => 2000, 'enabled' => 0, 'created_at' => time(), 'updated_at' => time()],
            ]);
        }

        if (!Schema::hasTable('v2_referral_reward')) {
            Schema::create('v2_referral_reward', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('event_key')->unique();
                $table->unsignedInteger('user_id')->index();
                $table->unsignedInteger('invited_user_id')->nullable()->index();
                $table->unsignedInteger('order_id')->nullable()->index();
                $table->enum('reward_type', ['balance', 'commission_balance', 'level', 'effective_invite']);
                $table->unsignedInteger('reward_value')->default(0);
                $table->enum('status', ['pending', 'granted', 'reversed', 'rejected'])->default('pending')->index();
                $table->string('description')->nullable();
                $table->text('meta')->nullable();
                $table->unsignedInteger('granted_at')->nullable();
                $table->unsignedInteger('created_at');
                $table->unsignedInteger('updated_at');
            });
            $firstOrders = DB::table('v2_order')
                ->select('user_id', DB::raw('MIN(id) as order_id'))
                ->whereNotNull('invite_user_id')
                ->whereIn('status', [3, 4])
                ->groupBy('user_id')
                ->get();
            foreach ($firstOrders as $first) {
                $order = DB::table('v2_order')->where('id', $first->order_id)->first();
                if (!$order) continue;
                DB::table('v2_referral_reward')->insert([
                    'event_key' => 'effective_invite:' . $order->user_id,
                    'user_id' => $order->invite_user_id,
                    'invited_user_id' => $order->user_id,
                    'order_id' => $order->id,
                    'reward_type' => 'effective_invite',
                    'reward_value' => 0,
                    'status' => 'granted',
                    'description' => '历史有效邀请回填',
                    'granted_at' => $order->updated_at,
                    'created_at' => time(),
                    'updated_at' => time(),
                ]);
            }
        }
    }

    public function down()
    {
        Schema::dropIfExists('v2_referral_reward');
        Schema::dropIfExists('v2_referral_milestone');
        Schema::dropIfExists('v2_referral_level');
        Schema::dropIfExists('v2_referral_setting');
    }
}
