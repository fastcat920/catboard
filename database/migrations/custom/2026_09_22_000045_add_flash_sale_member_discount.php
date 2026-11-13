<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddFlashSaleMemberDiscount extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_flash_sale_campaign') && !Schema::hasColumn('v2_flash_sale_campaign', 'allow_member_discount')) {
            Schema::table('v2_flash_sale_campaign', function (Blueprint $table) {
                $table->boolean('allow_member_discount')->default(true)->after('allow_coupon');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('v2_flash_sale_campaign') && Schema::hasColumn('v2_flash_sale_campaign', 'allow_member_discount')) {
            Schema::table('v2_flash_sale_campaign', function (Blueprint $table) {
                $table->dropColumn('allow_member_discount');
            });
        }
    }
}
