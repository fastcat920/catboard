<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClientRemoteConfig extends Model
{
    protected $table = 'v2_client_config';
    protected $dateFormat = 'U';
    protected $guarded = ['id'];
    protected $casts = ['config_version' => 'integer'];

    public function getContentAttribute(): array
    {
        return json_decode($this->content_json ?: '{}', true) ?: [];
    }

    public function publications()
    {
        return $this->hasMany(ClientConfigPublication::class, 'config_id');
    }
}
