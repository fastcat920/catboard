<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RemoveCouponNewUserOnly extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_coupon_template') || !Schema::hasColumn('v2_coupon_template', 'new_user_only')) return;

        DB::table('v2_coupon_template')
            ->where('new_user_only', 1)
            ->update(['first_order_only' => 1]);

        Schema::table('v2_coupon_template', function (Blueprint $table) {
            $table->dropColumn('new_user_only');
        });
    }

    public function down()
    {
        if (!Schema::hasTable('v2_coupon_template') || Schema::hasColumn('v2_coupon_template', 'new_user_only')) return;

        Schema::table('v2_coupon_template', function (Blueprint $table) {
            $table->boolean('new_user_only')->default(false)->after('first_order_only');
        });
    }
}
