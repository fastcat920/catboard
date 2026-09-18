<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessCouponDistributionTask;
use App\Models\CouponDistributionTask;
use App\Models\CouponRedemptionCode;
use App\Models\CouponTemplate;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Models\UserCoupon;
use App\Services\CouponWalletService;
use App\Services\CouponAudienceService;
use App\Utils\Helper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CouponCenterController extends Controller
{
    public function dashboard()
    {
        return response(['data'=>[
            'templates'=>CouponTemplate::count(),'issued'=>UserCoupon::count(),'available'=>UserCoupon::where('status','available')->count(),
            'used'=>UserCoupon::where('status','used')->count(),'expired'=>UserCoupon::where('status','expired')->count(),
            'discount_total'=>(int)Order::whereNotNull('user_coupon_id')->where('status',3)->sum('coupon_discount_amount'),
            'revenue'=>(int)Order::whereNotNull('user_coupon_id')->where('status',3)->sum('total_amount'),
            'template_ranking'=>CouponTemplate::orderBy('used_count','DESC')->limit(10)->get(['id','name','issued_count','used_count']),
        ]]);
    }
    public function templates(){return response(['data'=>CouponTemplate::orderBy('id','DESC')->get(),'plans'=>Plan::orderBy('id')->get(['id','name'])]);}
    public function saveTemplate(Request $request)
    {
        $data=$request->validate(['name'=>'required|string|max:100','name_en'=>'nullable|string|max:100','description'=>'nullable|string|max:1000','description_en'=>'nullable|string|max:1000','discount_type'=>'required|in:fixed,percent','discount_value'=>'required|integer|min:1','minimum_amount'=>'required|integer|min:0','maximum_discount'=>'nullable|integer|min:1','plan_ids'=>'nullable|array','plan_ids.*'=>'integer|exists:v2_plan,id','periods'=>'nullable|array','first_order_only'=>'required|boolean','new_user_only'=>'required|boolean','allow_renewal'=>'required|boolean','stackable'=>'required|boolean','per_user_limit'=>'required|integer|min:1','total_limit'=>'nullable|integer|min:1','daily_limit'=>'nullable|integer|min:1','valid_days'=>'nullable|integer|min:1|max:3650','starts_at'=>'nullable|integer','ends_at'=>'nullable|integer','enabled'=>'required|boolean']);
        if($data['discount_type']==='percent' && $data['discount_value']>100) abort(422,'折扣比例不能超过 100%');
        if(empty($data['valid_days']) && empty($data['ends_at'])) abort(422,'必须设置领取后有效天数或固定结束时间');
        $template=$request->input('id')?CouponTemplate::findOrFail($request->input('id')):new CouponTemplate();
        if($template->exists && $template->issued_count>0){$immutable=['discount_type','discount_value','minimum_amount','maximum_discount','plan_ids','periods','first_order_only','new_user_only','allow_renewal','stackable'];foreach($immutable as $key)if(($template->{$key}??null)!=($data[$key]??null))abort(422,'模板已发放，优惠规则不可修改；请复制创建新模板');}
        $template->fill($data)->save(); return response(['data'=>$template]);
    }
    public function copyTemplate(Request $request){$source=CouponTemplate::findOrFail($request->input('id'));$copy=$source->replicate();$copy->name=$copy->name.' - 副本';$copy->issued_count=0;$copy->used_count=0;$copy->enabled=0;$copy->save();return response(['data'=>$copy]);}
    public function dropTemplate(Request $request){$t=CouponTemplate::findOrFail($request->input('id'));if($t->issued_count>0)abort(422,'模板已有发放记录，只能停用');return response(['data'=>(bool)$t->delete()]);}
    public function estimate(Request $request,CouponAudienceService $audience){$filters=$request->input('filters',[]);return response(['data'=>['count'=>$audience->query($filters)->count()]]);}
    public function createTask(Request $request,CouponAudienceService $audience)
    {
        $data=$request->validate(['template_id'=>'required|integer|exists:v2_coupon_template,id','name'=>'required|string|max:100','filters'=>'required|array']);$count=$audience->query($data['filters'])->count();
        $task=CouponDistributionTask::create(['template_id'=>$data['template_id'],'admin_id'=>$request->user['id']??null,'name'=>$data['name'],'filters'=>$data['filters'],'estimated_count'=>$count]);
        ProcessCouponDistributionTask::dispatch($task->id);return response(['data'=>$task]);
    }
    public function tasks(){return response(['data'=>CouponDistributionTask::orderBy('id','DESC')->limit(200)->get()]);}
    public function cancelTask(Request $request){$task=CouponDistributionTask::findOrFail($request->input('id'));if(!in_array($task->status,['pending','running']))abort(422,'当前任务不能取消');$task->status='cancelled';$task->save();return response(['data'=>true]);}
    public function userCoupons(Request $request)
    {
        $q=UserCoupon::with('template')->orderBy('id','DESC');if($request->input('status'))$q->where('status',$request->input('status'));if($request->input('template_id'))$q->where('template_id',$request->input('template_id'));
        if($request->input('keyword')){$ids=User::where('email','like','%'.trim($request->input('keyword')).'%')->pluck('id');$q->whereIn('user_id',$ids);}
        $total=$q->count();$rows=$q->forPage(max(1,(int)$request->input('current',1)),min(100,max(10,(int)$request->input('pageSize',20))))->get();$emails=User::whereIn('id',$rows->pluck('user_id'))->pluck('email','id');$rows->each(function($x)use($emails){$x->user_email=$emails->get($x->user_id);});return response(['data'=>$rows,'total'=>$total]);
    }
    public function issueUser(Request $request,CouponWalletService $service){$data=$request->validate(['template_id'=>'required|integer','user_id'=>'required|integer']);$coupon=$service->issue(CouponTemplate::findOrFail($data['template_id']),User::findOrFail($data['user_id']),'manual','admin:'.($request->user['id']??0).':'.time());return response(['data'=>$coupon]);}
    public function revoke(Request $request){$data=$request->validate(['id'=>'required|integer','reason'=>'required|string|max:200']);$c=UserCoupon::findOrFail($data['id']);if(!in_array($c->status,['pending','available']))abort(422,'只有未使用优惠券可以撤销');$c->status='revoked';$c->revoke_reason=$data['reason'];$c->save();DB::table('v2_coupon_operation_record')->insert(['user_coupon_id'=>$c->id,'user_id'=>$c->user_id,'admin_id'=>$request->user['id']??null,'action'=>'revoked','detail'=>json_encode(['reason'=>$data['reason']],JSON_UNESCAPED_UNICODE),'created_at'=>time()]);return response(['data'=>true]);}
    public function extend(Request $request){$data=$request->validate(['id'=>'required|integer','days'=>'required|integer|min:1|max:3650']);$c=UserCoupon::findOrFail($data['id']);if(in_array($c->status,['used','revoked']))abort(422,'当前状态不可延期');$c->expires_at=max(time(),$c->expires_at)+$data['days']*86400;if($c->status==='expired')$c->status='available';$c->save();DB::table('v2_coupon_operation_record')->insert(['user_coupon_id'=>$c->id,'user_id'=>$c->user_id,'admin_id'=>$request->user['id']??null,'action'=>'extended','detail'=>json_encode(['days'=>$data['days']]),'created_at'=>time()]);return response(['data'=>$c]);}
    public function codes(){return response(['data'=>CouponRedemptionCode::orderBy('id','DESC')->limit(500)->get()]);}
    public function generateCodes(Request $request)
    {
        $data=$request->validate(['template_id'=>'required|integer|exists:v2_coupon_template,id','mode'=>'required|in:public,single','count'=>'required|integer|min:1|max:500','usage_limit'=>'required|integer|min:1','per_user_limit'=>'required|integer|min:1','starts_at'=>'nullable|integer','ends_at'=>'nullable|integer']);$rows=[];
        $count=$data['count'];unset($data['count']);for($i=0;$i<$count;$i++)$rows[]=CouponRedemptionCode::create(array_merge($data,['code'=>strtoupper(Helper::randomChar(12))]));return response(['data'=>$rows]);
    }
    public function toggleCode(Request $request){$c=CouponRedemptionCode::findOrFail($request->input('id'));$c->enabled=!$c->enabled;$c->save();return response(['data'=>$c]);}
    public function restore(Request $request,CouponWalletService $service){$data=$request->validate(['order_id'=>'required|integer|exists:v2_order,id','reason'=>'required|string|max:200']);$coupon=$service->restoreUsed(Order::findOrFail($data['order_id']),$data['reason']);if(!$coupon)abort(422,'该订单没有可恢复的已使用优惠券');return response(['data'=>$coupon]);}
    public function importTask(Request $request)
    {
        $data=$request->validate(['template_id'=>'required|integer|exists:v2_coupon_template,id','name'=>'required|string|max:100','csv'=>'required|string|max:2000000']);$ids=[];$emails=[];foreach(preg_split('/\r\n|\r|\n/',$data['csv']) as $line){$value=trim(str_getcsv($line)[0]??'');if(!$value)continue;if(filter_var($value,FILTER_VALIDATE_EMAIL))$emails[]=strtolower($value);elseif(ctype_digit($value))$ids[]=(int)$value;}
        if(!$ids&&!$emails)abort(422,'CSV 中未找到有效用户 ID 或邮箱');$task=CouponDistributionTask::create(['template_id'=>$data['template_id'],'admin_id'=>$request->user['id']??null,'name'=>$data['name'],'filters'=>['user_ids'=>array_values(array_unique($ids)),'emails'=>array_values(array_unique($emails))],'estimated_count'=>User::whereIn('id',$ids)->orWhereIn('email',$emails)->count()]);ProcessCouponDistributionTask::dispatch($task->id);return response(['data'=>$task]);
    }
    public function exportUserCoupons(Request $request)
    {
        $rows=UserCoupon::with('template')->orderBy('id')->get();$emails=User::whereIn('id',$rows->pluck('user_id'))->pluck('email','id');$csv="ID,用户,优惠券,来源,状态,生效时间,过期时间,订单ID\r\n";foreach($rows as $x)$csv.=implode(',',[$x->id,$emails->get($x->user_id),str_replace(',','，',$x->template?$x->template->name:''),$x->source,$x->status,date('Y-m-d H:i:s',$x->starts_at),date('Y-m-d H:i:s',$x->expires_at),$x->order_id])."\r\n";return response("\xEF\xBB\xBF".$csv,200,['Content-Type'=>'text/csv; charset=UTF-8','Content-Disposition'=>'attachment; filename=user-coupons.csv']);
    }
}
