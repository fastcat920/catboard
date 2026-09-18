<?php

namespace App\Services;

use App\Models\CouponTemplate;
use App\Models\Order;
use App\Models\User;
use App\Models\UserCoupon;
use Illuminate\Support\Facades\DB;

class CouponWalletService
{
    public function issue(CouponTemplate $template, User $user, string $source, string $reference): ?UserCoupon
    {
        return DB::transaction(function () use ($template, $user, $source, $reference) {
            $template = CouponTemplate::where('id', $template->id)->lockForUpdate()->first();
            if (!$template || !$template->enabled) return null;
            $existing = UserCoupon::where(compact('source'))->where('source_reference', $reference)->where('template_id', $template->id)->where('user_id', $user->id)->first();
            if ($existing) return $existing;
            if ($template->total_limit && $template->issued_count >= $template->total_limit) return null;
            if ($template->daily_limit && UserCoupon::where('template_id', $template->id)->where('created_at', '>=', strtotime('today'))->count() >= $template->daily_limit) return null;
            if (UserCoupon::where('template_id', $template->id)->where('user_id', $user->id)->whereNotIn('status', ['revoked'])->count() >= $template->per_user_limit) return null;
            $startsAt = max(time(), (int)$template->starts_at);
            $expiresAt = $template->valid_days ? $startsAt + $template->valid_days * 86400 : (int)$template->ends_at;
            if ($template->ends_at) $expiresAt = $expiresAt ? min($expiresAt, (int)$template->ends_at) : (int)$template->ends_at;
            if (!$expiresAt || $expiresAt <= $startsAt) return null;
            $coupon = UserCoupon::create(['template_id'=>$template->id,'user_id'=>$user->id,'source'=>$source,'source_reference'=>$reference,'status'=>$startsAt>time()?'pending':'available','starts_at'=>$startsAt,'expires_at'=>$expiresAt]);
            $template->increment('issued_count'); $this->record($coupon, $user->id, 'issued', ['source'=>$source]);
            return $coupon;
        });
    }

    public function wallet(int $userId)
    {
        $this->refreshStatuses($userId);
        return UserCoupon::with('template')->where('user_id', $userId)->orderBy('id', 'DESC')->get();
    }

    public function available(User $user, int $planId, string $period, int $amount, ?int $orderType = null)
    {
        $this->refreshStatuses($user->id);
        return UserCoupon::with('template')->where('user_id', $user->id)->where('status', 'available')->get()
            ->filter(function ($coupon) use ($user, $planId, $period, $amount, $orderType) { return $this->eligible($coupon, $user, $planId, $period, $amount, $orderType); })
            ->map(function ($coupon) use ($amount) { $coupon->calculated_discount = $this->discount($coupon->template, $amount); return $coupon; })
            ->sort(function ($a, $b) { return $a->calculated_discount === $b->calculated_discount ? $a->expires_at <=> $b->expires_at : $b->calculated_discount <=> $a->calculated_discount; })->values();
    }

    public function lockForOrder(Order $order, User $user, ?int $selectedId, bool $disableAuto): ?UserCoupon
    {
        if ($disableAuto && !$selectedId) return null;
        $available = $this->available($user, $order->plan_id, $order->period, $order->total_amount, $order->type);
        $selected = $selectedId ? $available->firstWhere('id', $selectedId) : $available->first();
        if ($selectedId && !$selected) abort(422, '所选优惠券不满足当前订单使用条件');
        if (!$selected) return null;
        $coupon = UserCoupon::where('id', $selected->id)->where('status', 'available')->lockForUpdate()->first();
        if (!$coupon) abort(422, '优惠券已被使用或锁定，请重新选择');
        $discount = $this->discount($selected->template, $order->total_amount);
        $order->user_coupon_id = $coupon->id; $order->coupon_discount_amount = $discount;
        $order->discount_amount = (int)$order->discount_amount + $discount; $order->total_amount -= $discount;
        $order->coupon_snapshot = ['template_id'=>$selected->template->id,'name'=>$selected->template->name,'name_en'=>$selected->template->name_en,'discount_type'=>$selected->template->discount_type,'discount_value'=>$selected->template->discount_value,'discount_amount'=>$discount];
        $coupon->status='locked'; $coupon->locked_trade_no=$order->trade_no; $coupon->locked_at=time(); $coupon->save();
        $this->record($coupon, $user->id, 'locked', ['trade_no'=>$order->trade_no,'discount'=>$discount]);
        return $coupon;
    }

    public function consume(Order $order): void
    {
        if (!$order->user_coupon_id) return;
        DB::transaction(function () use ($order) {
            $coupon=UserCoupon::where('id',$order->user_coupon_id)->lockForUpdate()->first();
            if (!$coupon || $coupon->status==='used') return;
            if ($coupon->status!=='locked' || $coupon->locked_trade_no!==$order->trade_no) throw new \RuntimeException('订单优惠券锁定状态异常');
            $coupon->status='used'; $coupon->order_id=$order->id; $coupon->used_at=time(); $coupon->save();
            CouponTemplate::where('id',$coupon->template_id)->increment('used_count'); $this->record($coupon,$coupon->user_id,'used',['order_id'=>$order->id]);
        });
    }

    public function release(Order $order, string $reason='order_cancelled'): void
    {
        if (!$order->user_coupon_id) return;
        $coupon=UserCoupon::where('id',$order->user_coupon_id)->where('status','locked')->where('locked_trade_no',$order->trade_no)->lockForUpdate()->first();
        if (!$coupon) return;
        $coupon->status=$coupon->expires_at>time()?'available':'expired'; $coupon->locked_trade_no=null; $coupon->locked_at=null; $coupon->save();
        $this->record($coupon,$coupon->user_id,'released',['reason'=>$reason]);
    }

    public function restoreUsed(Order $order, string $reason='full_refund'): ?UserCoupon
    {
        if (!$order->user_coupon_id) return null;
        return DB::transaction(function () use ($order, $reason) {
            $coupon=UserCoupon::where('id',$order->user_coupon_id)->lockForUpdate()->first();if(!$coupon||$coupon->status!=='used'||(int)$coupon->order_id!==(int)$order->id)return null;
            $coupon->status=$coupon->expires_at>time()?'available':'expired';$coupon->order_id=null;$coupon->used_at=null;$coupon->save();CouponTemplate::where('id',$coupon->template_id)->where('used_count','>',0)->decrement('used_count');$this->record($coupon,$coupon->user_id,'restored',['reason'=>$reason,'order_id'=>$order->id]);return $coupon;
        });
    }

    private function eligible(UserCoupon $coupon, User $user, int $planId, string $period, int $amount, ?int $orderType): bool
    {
        $t=$coupon->template; if(!$t || $amount<$t->minimum_amount) return false;
        if($t->plan_ids && !in_array($planId,array_map('intval',$t->plan_ids),true)) return false;
        if($t->periods && !in_array($period,$t->periods,true)) return false;
        $hasPaid=Order::where('user_id',$user->id)->where('status',3)->where('plan_id','>',0)->exists();
        if(($t->first_order_only || $t->new_user_only) && $hasPaid) return false;
        if(!$t->allow_renewal && (int)$orderType===2) return false;
        return true;
    }
    private function discount(CouponTemplate $t,int $amount): int { $value=$t->discount_type==='fixed'?$t->discount_value:(int)round($amount*$t->discount_value/100); if($t->maximum_discount)$value=min($value,$t->maximum_discount); return min($amount,max(0,$value)); }
    private function refreshStatuses(int $userId): void { UserCoupon::where('user_id',$userId)->where('status','pending')->where('starts_at','<=',time())->update(['status'=>'available','updated_at'=>time()]); UserCoupon::where('user_id',$userId)->whereIn('status',['pending','available'])->where('expires_at','<',time())->update(['status'=>'expired','updated_at'=>time()]); }
    private function record(UserCoupon $coupon,int $userId,string $action,array $detail=[]): void { DB::table('v2_coupon_operation_record')->insert(['user_coupon_id'=>$coupon->id,'user_id'=>$userId,'action'=>$action,'detail'=>json_encode($detail,JSON_UNESCAPED_UNICODE),'created_at'=>time()]); }
}
