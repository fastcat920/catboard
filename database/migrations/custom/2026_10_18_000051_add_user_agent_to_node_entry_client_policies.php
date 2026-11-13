<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddUserAgentToNodeEntryClientPolicies extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_node_entry_client_policy') || Schema::hasColumn('v2_node_entry_client_policy', 'user_agent')) return;
        Schema::table('v2_node_entry_client_policy', function (Blueprint $table) {
            $table->string('user_agent', 512)->nullable()->after('client_platform');
        });
    }

    public function down()
    {
        if (!Schema::hasTable('v2_node_entry_client_policy') || !Schema::hasColumn('v2_node_entry_client_policy', 'user_agent')) return;
        Schema::table('v2_node_entry_client_policy', function (Blueprint $table) {
            $table->dropColumn('user_agent');
        });
    }
}
