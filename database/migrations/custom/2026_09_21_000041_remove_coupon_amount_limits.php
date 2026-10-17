<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RemoveCouponAmountLimits extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_coupon_template')) return;

        $columns = array_values(array_filter(['minimum_amount', 'maximum_discount'], function ($column) {
            return Schema::hasColumn('v2_coupon_template', $column);
        }));
        if (!$columns) return;

        Schema::table('v2_coupon_template', function (Blueprint $table) use ($columns) {
            $table->dropColumn($columns);
        });
    }

    public function down()
    {
        if (!Schema::hasTable('v2_coupon_template')) return;
        $addMinimum = !Schema::hasColumn('v2_coupon_template', 'minimum_amount');
        $addMaximum = !Schema::hasColumn('v2_coupon_template', 'maximum_discount');
        if (!$addMinimum && !$addMaximum) return;

        Schema::table('v2_coupon_template', function (Blueprint $table) use ($addMinimum, $addMaximum) {
            if ($addMinimum) {
                $table->unsignedInteger('minimum_amount')->default(0)->after('discount_value');
            }
            if ($addMaximum) {
                $table->unsignedInteger('maximum_discount')->nullable()->after('discount_value');
            }
        });
    }
}
