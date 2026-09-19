<?php

namespace App\Console\Commands;

use App\Services\NodeSecurity\UaClassifierService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NodeSecurityBackfillUa extends Command
{
    protected $signature = 'security:backfill-ua {--force : Reclassify records that already have classification data}';
    protected $description = 'Classify historical node access user agents';

    public function handle(): int
    {
        $classifier = new UaClassifierService();
        $query = DB::table('v2_node_access_log')->select('id', 'user_agent')->orderBy('id');
        if (!$this->option('force')) $query->whereNull('client_family');
        $updated = 0;
        $query->chunkById(500, function ($rows) use ($classifier, &$updated) {
            foreach ($rows as $row) {
                DB::table('v2_node_access_log')->where('id', $row->id)->update($classifier->classify($row->user_agent));
                $updated++;
            }
        });
        $this->info("UA classification completed: {$updated} records updated.");
        return 0;
    }
}
