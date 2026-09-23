<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NodeSecurityBackfillAccessSnapshots extends Command
{
    protected $signature = 'security:backfill-access-snapshots {--chunk=500 : Access logs processed per batch}';
    protected $description = 'Expand historical access-log snapshot IDs into the indexed relation table';

    public function handle(): int
    {
        $chunk = max(50, min(5000, (int)$this->option('chunk')));
        $processed = 0;
        $inserted = 0;
        DB::table('v2_node_access_log')->select('id', 'user_id', 'snapshot_ids', 'requested_at', 'created_at')
            ->whereNotNull('snapshot_ids')->orderBy('id')->chunkById($chunk, function ($rows) use (&$processed, &$inserted) {
                $records = [];
                foreach ($rows as $row) {
                    $snapshotIds = array_values(array_unique(array_filter(array_map('intval', json_decode($row->snapshot_ids, true) ?: []))));
                    foreach ($snapshotIds as $snapshotId) {
                        $records[] = [
                            'access_log_id' => (int)$row->id, 'user_id' => (int)$row->user_id,
                            'snapshot_id' => $snapshotId, 'requested_at' => (int)$row->requested_at,
                            'created_at' => (int)($row->created_at ?: $row->requested_at),
                        ];
                    }
                    $processed++;
                }
                foreach (array_chunk($records, 1000) as $batch) $inserted += DB::table('v2_node_access_snapshot')->insertOrIgnore($batch);
                $this->output->write("\rProcessed {$processed} access logs; inserted {$inserted} links");
            });
        $this->newLine();
        $this->info("Snapshot access backfill completed: {$processed} logs processed, {$inserted} links inserted.");
        return 0;
    }
}
