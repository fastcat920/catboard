<?php

namespace App\Http\Controllers\V1\User;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\User;
use App\Services\PlanService;
use App\Services\FlashSaleService;
use App\Services\OrderService;
use App\Models\Order;
use App\Support\ContentLocale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PlanController extends Controller
{
    public function fetch(Request $request)
    {
        $user = User::find($request->user['id']);
        if ($request->input('id')) {
            $plan = Plan::where('id', $request->input('id'))->first();
            if (!$plan) {
                abort(500, __('Subscription plan does not exist'));
            }
            if ((!$plan->show && !$plan->renew) || (!$plan->show && $user->plan_id !== $plan->id)) {
                abort(500, __('Subscription plan does not exist'));
            }
            ContentLocale::localize($plan, ['name', 'content'], $request);
            $this->attachFlashSales($plan, $user, $request);
            return response([
                'data' => $plan
            ]);
        }

        $counts = PlanService::countActiveUsers();
        $plans = Plan::where('show', 1)
            ->orderBy('sort', 'ASC')
            ->get();
        foreach ($plans as $k => $v) {
            ContentLocale::localize($plans[$k], ['name', 'content'], $request);
            $this->attachFlashSales($plans[$k], $user, $request);
            if ($plans[$k]->capacity_limit === NULL) continue;
            if (!isset($counts[$plans[$k]->id])) continue;
            $plans[$k]->capacity_limit = $plans[$k]->capacity_limit - $counts[$plans[$k]->id]->count;
        }
        return response([
            'data' => $plans
        ]);
    }

    private function attachFlashSales(Plan $plan, User $user, Request $request): void
    {
        $periods = ['month_price','quarter_price','half_year_price','year_price','two_year_price','three_year_price','onetime_price'];
        $service = app(FlashSaleService::class); $sales = [];
        foreach ($periods as $period) {
            if ($plan->{$period} === null) continue;
            $order = new Order(['user_id'=>$user->id,'plan_id'=>$plan->id,'period'=>$period,'total_amount'=>$plan->{$period}]);
            (new OrderService($order))->setOrderType($user);
            $campaign = $service->match($user, (int)$plan->id, $period, (int)$plan->{$period}, (int)$order->type);
            if (!$campaign) continue;
            $quote = $service->quote($campaign, (int)$plan->{$period});
            $name = ContentLocale::isEnglish($request) && $campaign->name_en ? $campaign->name_en : $campaign->name;
            $description = ContentLocale::isEnglish($request) && $campaign->description_en ? $campaign->description_en : $campaign->description;
            $sales[$period] = ['id'=>$campaign->id,'name'=>$name,'description'=>$description,'ends_at'=>$campaign->ends_at,'original_amount'=>(int)$plan->{$period},'final_amount'=>$quote['final_amount'],'discount_amount'=>$quote['discount_amount']];
        }
        $plan->setAttribute('active_flash_sales', $sales);
    }
}
