<?php

namespace App\Providers;

use App\Services\NodeSecurity\EntrySyncService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        //
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        $this->app['view']->addNamespace('theme', public_path() . '/theme');
        foreach (EntrySyncService::modelMap() as $serverType => $modelClass) {
            $modelClass::saved(function ($server) use ($serverType) {
                if (!$server->wasChanged('host') && !$server->wasChanged('port')) return;
                app(EntrySyncService::class)->syncModelToPrimary($serverType, $server);
            });
        }
    }
}
