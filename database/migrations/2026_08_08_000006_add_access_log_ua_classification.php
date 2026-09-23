<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddAccessLogUaClassification extends Migration
{
    public function up()
    {
        Schema::table('v2_node_access_log', function (Blueprint $table) {
            $table->char('ua_hash', 64)->nullable()->after('user_agent');
            $table->string('client_family', 64)->nullable()->after('ua_hash');
            $table->string('client_version', 32)->nullable()->after('client_family');
            $table->string('client_platform', 32)->nullable()->after('client_version');
            $table->index(['client_family', 'requested_at'], 'node_access_client_time');
            $table->index(['client_platform', 'requested_at'], 'node_access_platform_time');
            $table->index(['ua_hash', 'requested_at'], 'node_access_ua_time');
        });
    }

    public function down()
    {
        Schema::table('v2_node_access_log', function (Blueprint $table) {
            $table->dropIndex('node_access_client_time');
            $table->dropIndex('node_access_platform_time');
            $table->dropIndex('node_access_ua_time');
            $table->dropColumn(['ua_hash', 'client_family', 'client_version', 'client_platform']);
        });
    }
}
