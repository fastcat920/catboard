<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPrimarySyncToNodeEntrySettings extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_node_entry_setting')) return;
        if (!Schema::hasColumn('v2_node_entry_setting', 'sync_primary_host')) {
            Schema::table('v2_node_entry_setting', function (Blueprint $table) {
                $table->boolean('sync_primary_host')->default(false)->after('client_visibility_mode');
            });
        }
        if (!Schema::hasColumn('v2_node_entry_setting', 'sync_primary_port')) {
            Schema::table('v2_node_entry_setting', function (Blueprint $table) {
                $table->boolean('sync_primary_port')->default(false)->after('sync_primary_host');
            });
        }
    }

    public function down()
    {
        if (!Schema::hasTable('v2_node_entry_setting')) return;
        if (Schema::hasColumn('v2_node_entry_setting', 'sync_primary_port')) {
            Schema::table('v2_node_entry_setting', function (Blueprint $table) { $table->dropColumn('sync_primary_port'); });
        }
        if (Schema::hasColumn('v2_node_entry_setting', 'sync_primary_host')) {
            Schema::table('v2_node_entry_setting', function (Blueprint $table) { $table->dropColumn('sync_primary_host'); });
        }
    }
}
