<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class UserCoupon extends Model { protected $table='v2_user_coupon'; protected $dateFormat='U'; protected $guarded=['id']; public function template(){return $this->belongsTo(CouponTemplate::class,'template_id');} }
