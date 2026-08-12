<?php

namespace App\Protocols;

use App\Services\FastCatSubscriptionCipher;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

class FastCatV1 extends ClashMeta
{
    public $flag = 'fastcat-v1';

    public function handle()
    {
        if (!config('fastcat.subscription.enabled', false)) {
            throw new ServiceUnavailableHttpException(null, 'FastCat encrypted subscription is disabled.');
        }

        $yaml = parent::handle();
        $envelope = app(FastCatSubscriptionCipher::class)->encrypt($yaml);

        header('Content-Type: application/vnd.fastcat.subscription+json; charset=utf-8');
        header('X-FastCat-Protocol: 1');
        header('Cache-Control: private, no-store');

        return $envelope;
    }
}
