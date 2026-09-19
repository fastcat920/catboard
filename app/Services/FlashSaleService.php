<?php

namespace App\Services;

use App\Models\FlashSaleCampaign;
use App\Models\Order;
use App\Models\User;

class FlashSaleService
{
    public function match(User $user, int $planId, string $period, int $amount, int $orderType): ?FlashSaleCampaign
    {
        $now = time();
        return FlashSaleCampaign::where('enabled', 1)
            ->where('starts_at', '<=', $now)
            ->where('ends_at', '>=', $now)
            ->orderBy('priority', 'DESC')->orderBy('id', 'DESC')->get()
            ->first(function (FlashSaleCampaign $campaign) use ($user, $planId, $period, $amount, $orderType) {
                if ($campaign->total_limit && $campaign->order_count >= $campaign->total_limit) return false;
                if ($campaign->minimum_amount > $amount) return false;
                if ($campaign->audience === 'new' && $orderType !== 1) return false;
                if ($campaign->audience === 'existing' && $orderType === 1) return false;
                if ($campaign->plan_ids && !in_array($planId, array_map('intval', $campaign->plan_ids), true)) return false;
                if ($campaign->periods && !in_array($period, $campaign->periods, true)) return false;
                if ($campaign->per_user_limit && Order::where('user_id', $user->id)->where('flash_sale_campaign_id', $campaign->id)->where('status', 3)->count() >= $campaign->per_user_limit) return false;
                return true;
            });
    }

    public function quote(FlashSaleCampaign $campaign, int $amount): array
    {
        if ($campaign->discount_type === 'fixed_price') $final = (int)$campaign->discount_value;
        elseif ($campaign->discount_type === 'percent_off') $final = (int)round($amount * (100 - $campaign->discount_value) / 100);
        else $final = $amount - (int)$campaign->discount_value;
        $final = max(0, min($amount, $final));
        return ['final_amount' => $final, 'discount_amount' => $amount - $final];
    }

    public function apply(Order $order, User $user): ?FlashSaleCampaign
    {
        $campaign = $this->match($user, (int)$order->plan_id, (string)$order->period, (int)$order->total_amount, (int)$order->type);
        if (!$campaign) return null;
        $quote = $this->quote($campaign, (int)$order->total_amount);
        $order->flash_sale_campaign_id = $campaign->id;
        $order->flash_sale_discount_amount = $quote['discount_amount'];
        $order->discount_amount = (int)$order->discount_amount + $quote['discount_amount'];
        $order->total_amount = $quote['final_amount'];
        $order->flash_sale_snapshot = [
            'id' => $campaign->id, 'name' => $campaign->name, 'name_en' => $campaign->name_en,
            'discount_type' => $campaign->discount_type, 'discount_value' => $campaign->discount_value,
            'allow_coupon' => (bool)$campaign->allow_coupon,
        ];
        return $campaign;
    }

    public function complete(Order $order): void
    {
        if (!$order->flash_sale_campaign_id || !$order->flash_sale_discount_amount) return;
        FlashSaleCampaign::where('id', $order->flash_sale_campaign_id)->update([
            'order_count' => \DB::raw('order_count + 1'),
            'revenue' => \DB::raw('revenue + '.(int)($order->total_amount + $order->balance_amount)),
            'discount_total' => \DB::raw('discount_total + '.(int)$order->flash_sale_discount_amount),
        ]);
    }
}
