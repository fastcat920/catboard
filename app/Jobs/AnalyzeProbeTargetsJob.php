<?php

namespace App\Jobs;

use App\Services\NodeSecurity\ProbeAnalysisService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;

class AnalyzeProbeTargetsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;
    public $timeout = 60;
    private $targets;
    private $dedupeKey;

    public function __construct(array $targets, string $dedupeKey)
    {
        $this->onConnection('redis');
        $this->onQueue('node_security');
        $this->targets = $targets;
        $this->dedupeKey = $dedupeKey;
    }

    public function handle()
    {
        try {
            (new ProbeAnalysisService())->analyzeTargets($this->targets);
        } finally {
            Cache::forget($this->dedupeKey);
        }
    }

    public function failed(\Throwable $exception)
    {
        Cache::forget($this->dedupeKey);
    }
}
