<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateAccountDeletionTables extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('v2_trial_claim')) {
            Schema::create('v2_trial_claim', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->char('email_hash', 64)->unique();
                $table->unsignedInteger('user_id')->nullable()->index();
                $table->unsignedInteger('claimed_at');
                $table->unsignedInteger('created_at');
                $table->unsignedInteger('updated_at');
            });
        }

        if (!Schema::hasTable('v2_account_deletion_log')) {
            Schema::create('v2_account_deletion_log', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedInteger('user_id')->index();
                $table->char('email_hash', 64);
                $table->string('deletion_type', 16);
                $table->unsignedInteger('admin_id')->nullable();
                $table->text('reason')->nullable();
                $table->unsignedInteger('created_at');
            });
        }

        if (Schema::hasTable('v2_user')) {
            if (!Schema::hasColumn('v2_user', 'deleted_at')) {
                Schema::table('v2_user', function (Blueprint $table) {
                    $table->unsignedInteger('deleted_at')->nullable()->after('remarks')->index();
                });
            }
            if (!Schema::hasColumn('v2_user', 'deletion_type')) {
                Schema::table('v2_user', function (Blueprint $table) {
                    $table->string('deletion_type', 16)->nullable()->after('deleted_at');
                });
            }
            if (!Schema::hasColumn('v2_user', 'deletion_reason')) {
                Schema::table('v2_user', function (Blueprint $table) {
                    $table->text('deletion_reason')->nullable()->after('deletion_type');
                });
            }
            if (!Schema::hasColumn('v2_user', 'deleted_by_admin_id')) {
                Schema::table('v2_user', function (Blueprint $table) {
                    $table->unsignedInteger('deleted_by_admin_id')->nullable()->after('deletion_reason');
                });
            }
        }
    }

    public function down()
    {
        if (Schema::hasTable('v2_user')) {
            $columns = array_values(array_filter([
                'deleted_by_admin_id', 'deletion_reason', 'deletion_type', 'deleted_at',
            ], function ($column) {
                return Schema::hasColumn('v2_user', $column);
            }));
            if ($columns) {
                Schema::table('v2_user', function (Blueprint $table) use ($columns) {
                    $table->dropColumn($columns);
                });
            }
        }
        Schema::dropIfExists('v2_account_deletion_log');
        Schema::dropIfExists('v2_trial_claim');
    }
}
