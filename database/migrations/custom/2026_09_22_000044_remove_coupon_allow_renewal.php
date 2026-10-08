<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RemoveCouponAllowRenewal extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_coupon_template') && Schema::hasColumn('v2_coupon_template', 'allow_renewal')) {
            Schema::table('v2_coupon_template', function (Blueprint $table) {
                $table->dropColumn('allow_renewal');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('v2_coupon_template') && !Schema::hasColumn('v2_coupon_template', 'allow_renewal')) {
            Schema::table('v2_coupon_template', function (Blueprint $table) {
                $table->boolean('allow_renewal')->default(true)->after('first_order_only');
            });
        }
    }
}
