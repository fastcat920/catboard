<?php

namespace App\Http\Routes\V1;

use Illuminate\Contracts\Routing\Registrar;

class ProbeRoute
{
    public function map(Registrar $router)
    {
        $router->group(['prefix' => 'security/probe'], function ($router) {
            $router->get('/tasks', 'V1\\ProbeController@tasks');
            $router->post('/results', 'V1\\ProbeController@results');
        });
    }
}
