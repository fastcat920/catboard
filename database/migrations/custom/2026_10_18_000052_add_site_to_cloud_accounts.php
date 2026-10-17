<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSiteToCloudAccounts extends Migration
{
    public function up()
    {
        Schema::table('v2_cloud_account', function (Blueprint $table) {
            $table->string('site', 24)->default('china')->after('provider')->index();
        });
    }

    public function down()
    {
        Schema::table('v2_cloud_account', function (Blueprint $table) {
            $table->dropIndex(['site']);
            $table->dropColumn('site');
        });
    }
}
