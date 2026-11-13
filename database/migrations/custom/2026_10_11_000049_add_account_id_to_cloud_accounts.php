<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAccountIdToCloudAccounts extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_cloud_account') && !Schema::hasColumn('v2_cloud_account', 'account_id')) {
            Schema::table('v2_cloud_account', function (Blueprint $table) {
                $table->string('account_id', 191)->nullable()->after('name');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('v2_cloud_account') && Schema::hasColumn('v2_cloud_account', 'account_id')) {
            Schema::table('v2_cloud_account', function (Blueprint $table) {
                $table->dropColumn('account_id');
            });
        }
    }
}
