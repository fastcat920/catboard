<?php

namespace App\Http\Controllers\V1\User;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Services\CouponWalletService;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class CouponController extends Controller
{
    public function wallet(Request $request, CouponWalletService $service)
    {
        return response(['data' => $service->wallet((int)$request->user['id'])]);
    }

    public function available(Request $request, CouponWalletService $service)
    {
        $data=$request->validate(['plan_id'=>'required|integer','period'=>'required|string']);
        $plan=Plan::findOrFail($data['plan_id']); if(!array_key_exists($data['period'],$plan->getAttributes()) || $plan[$data['period']]===null) abort(422,'当前付款周期不可购买');
        $user=User::findOrFail($request->user['id']);
        $order=new Order(['user_id'=>$user->id,'plan_id'=>$plan->id,'period'=>$data['period'],'total_amount'=>$plan[$data['period']]]);
        (new OrderService($order))->setOrderType($user);
        $coupons=$service->available($user,$plan->id,$data['period'],(int)$order->total_amount,(int)$order->type);
        return response(['data'=>['original_amount'=>(int)$order->total_amount,'recommended'=>$coupons->first(),'available_coupons'=>$coupons]]);
    }

    public function redeem(Request $request, CouponWalletService $service)
    {
        $key='coupon-redeem:'.$request->user['id'];if(RateLimiter::tooManyAttempts($key,10))abort(429,'兑换尝试过于频繁，请稍后再试');RateLimiter::hit($key,3600);
        $data=$request->validate(['code'=>'required|string|max:64']);
        return response(['data'=>$service->redeem(User::findOrFail($request->user['id']),$data['code'])]);
    }
}
