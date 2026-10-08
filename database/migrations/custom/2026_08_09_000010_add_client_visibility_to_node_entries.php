<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddClientVisibilityToNodeEntries extends Migration
{
    public function up()
    {
        if (Schema::hasTable('v2_node_entry_setting') && !Schema::hasColumn('v2_node_entry_setting', 'client_visibility_mode')) {
            Schema::table('v2_node_entry_setting', function (Blueprint $table) {
                $table->string('client_visibility_mode', 16)->default('all')->after('check_interval');
            });
        }
        if (Schema::hasTable('v2_node_entry_client_policy') && !Schema::hasColumn('v2_node_entry_client_policy', 'visibility')) {
            Schema::table('v2_node_entry_client_policy', function (Blueprint $table) {
                $table->string('visibility', 8)->default('show')->after('delivery_mode');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('v2_node_entry_client_policy') && Schema::hasColumn('v2_node_entry_client_policy', 'visibility')) {
            Schema::table('v2_node_entry_client_policy', function (Blueprint $table) { $table->dropColumn('visibility'); });
        }
        if (Schema::hasTable('v2_node_entry_setting') && Schema::hasColumn('v2_node_entry_setting', 'client_visibility_mode')) {
            Schema::table('v2_node_entry_setting', function (Blueprint $table) { $table->dropColumn('client_visibility_mode'); });
        }
    }
}
