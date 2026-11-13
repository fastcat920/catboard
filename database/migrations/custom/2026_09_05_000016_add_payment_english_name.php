<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPaymentEnglishName extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('v2_payment', 'name_en')) {
            Schema::table('v2_payment', function (Blueprint $table) {
                $table->string('name_en')->nullable()->after('name');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('v2_payment', 'name_en')) {
            Schema::table('v2_payment', function (Blueprint $table) {
                $table->dropColumn('name_en');
            });
        }
    }
}
