(function () {
    "use strict";
    var root;
    var tab = "overview";
    var relationView = "relations";
    var responseCache = {};
    var listState = { relations: { current: 1, pageSize: 20, keyword: "", status: "" }, rewards: { current: 1, pageSize: 20, keyword: "", status: "", type: "", from: "", to: "" } };
    var dashboardPreloaded = false;
    var previousHeaderTitle = null;
    var nextLevelSort = 10;

    function api(path, options) {
        options = options || {};
        var headers = Object.assign({ Accept: "application/json", "Content-Type": "application/json" }, options.headers || {});
        var authorization = localStorage.getItem("authorization");
        if (authorization) headers.authorization = authorization;
        return fetch("/api/v1/" + window.settings.secure_path + "/referral" + path, Object.assign({ credentials: "include" }, options, { headers: headers }))
            .then(function (response) { return response.json().then(function (payload) {
                if (!response.ok) throw new Error(payload.message || "请求失败");
                return payload;
            }); });
    }

    function money(value) { return (Number(value || 0) / 100).toFixed(2); }
    function esc(value) { var d = document.createElement("div"); d.textContent = value == null ? "" : value; return d.innerHTML; }
    function dateTime(value) {
        if (value === null || value === undefined || value === "") return "-";
        var numeric = Number(value);
        var date = Number.isFinite(numeric) ? new Date(numeric < 1000000000000 ? numeric * 1000 : numeric) : new Date(value);
        return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
    }
    function rewardType(value) {
        return ({ effective_invite: "有效邀请", balance: "账户余额奖励", commission_balance: "佣金奖励", level: "成长等级调整", traffic: "流量奖励", duration: "套餐时长奖励" })[value] || value || "-";
    }
    function rewardValue(row) {
        if (row.reward_type === "effective_invite") return "-";
        if (row.reward_type === "traffic") return row.reward_value + " GB";
        if (row.reward_type === "duration") return row.reward_value + " 天";
        return row.reward_type === "level" ? row.reward_value + "%" : "¥" + money(row.reward_value);
    }
    function rewardStatus(value) {
        return ({ pending: "待发放", granted: "已发放", reversed: "已撤销", rejected: "已拒绝" })[value] || value || "-";
    }
    function field(name, label, value, type, step) { return '<div class="form-group"><label>' + label + '</label><input class="form-control" name="' + name + '" type="' + (type || "number") + '"' + (step ? ' step="' + step + '"' : '') + ' value="' + esc(value == null ? "" : value) + '"></div>'; }
    function cachedApi(path) {
        var cached = responseCache[path];
        if (cached && Date.now() - cached.time < 30000) return Promise.resolve(cached.payload);
        if (cached && cached.promise) return cached.promise;
        var promise = api(path).then(function (payload) {
            responseCache[path] = { time: Date.now(), payload: payload };
            return payload;
        }).catch(function (error) {
            delete responseCache[path];
            throw error;
        });
        responseCache[path] = { time: 0, promise: promise };
        return promise;
    }
    function clearCache(path) { if (path) delete responseCache[path]; else responseCache = {}; }
    function queryString(data) { return Object.keys(data).filter(function (key) { return data[key] !== "" && data[key] !== null; }).map(function (key) { return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]); }).join("&"); }

    function setMenuActive(active) {
        document.querySelectorAll(".referral-admin-menu-link").forEach(function (link) {
            link.classList.toggle("active", active);
        });
    }

    function isReferralRoute() {
        return location.hash === "#/referral" || location.pathname === "/referral";
    }

    function open() {
        if (!root || !root.isConnected) {
            root = document.createElement("div");
            root.className = "referral-admin";
            (document.getElementById("page-container") || document.body).appendChild(root);
        }
        var headerTitle = document.querySelector(".v2board-container-title");
        if (headerTitle) {
            if (previousHeaderTitle === null) previousHeaderTitle = headerTitle.textContent;
            headerTitle.textContent = "邀请管理";
        }
        root.hidden = false;
        setMenuActive(true);
        renderShell();
        loadTab();
    }

    function close() {
        if (root) root.hidden = true;
        var headerTitle = document.querySelector(".v2board-container-title");
        if (headerTitle && previousHeaderTitle !== null) headerTitle.textContent = previousHeaderTitle;
        previousHeaderTitle = null;
        setMenuActive(false);
    }

    function renderShell() {
            root.innerHTML = '<div class="p-0 p-lg-4"><div class="mb-0 block border-bottom"><nav class="nav nav-tabs nav-tabs-block">' + [["overview","数据概览"],["setting","奖励规则"],["levels","成长等级"],["relations","邀请关系"]].map(function (item) {
                return '<button data-tab="' + item[0] + '" class="nav-link ' + (tab === item[0] ? "active" : "") + '">' + item[1] + '</button>';
            }).join("") + '</nav><main data-content><div class="block-content referral-loading">加载中…</div></main></div></div>';
        root.querySelectorAll("[data-tab]").forEach(function (button) { button.onclick = function () { switchTab(button.dataset.tab); }; });
    }

    function content(html) { root.querySelector("[data-content]").innerHTML = html; }
    function fail(error) { content('<div class="alert alert-danger">' + esc(error.message) + '</div>'); }
    function switchTab(nextTab) {
        if (tab === nextTab) return;
        tab = nextTab;
        root.querySelectorAll("[data-tab]").forEach(function (button) { button.classList.toggle("active", button.dataset.tab === tab); });
        content('<div class="block block-rounded"><div class="block-content referral-loading">加载中…</div></div>');
        loadTab();
    }
    function loadTab() {
        ({ overview: loadOverview, setting: loadSetting, levels: loadLevels, relations: loadRelations }[tab] || loadOverview)();
    }

    function loadOverview() {
        var requestedTab = tab;
        Promise.all([cachedApi("/dashboard"), api("/funnel?days=30")]).then(function (payloads) {
            if (tab !== requestedTab) return;
            var d = payloads[0].data, funnel = payloads[1].data, s = funnel.summary, trend = funnel.trend || [];
            content('<div class="referral-overview-tools"><button class="btn btn-light" data-refresh><i class="fa fa-sync-alt mr-1"></i>刷新数据</button></div><div class="referral-cards">' + [
                ["邀请注册", d.registered_invites], ["有效邀请", d.effective_invites], ["首购转化率", d.conversion_rate + "%"],
                ["邀请订单收入", "¥" + money(d.referral_revenue)], ["额外奖励支出", "¥" + money(d.reward_total)], ["活跃推广者", d.active_promoters]
            ].map(function (x) { return '<section class="block block-rounded"><div class="block-content"><small>' + x[0] + '</small><strong>' + x[1] + '</strong></div></section>'; }).join("") +
            '</div><div class="alert alert-info">有效邀请以好友完成符合最低金额的首笔有效套餐订单为准。奖励流水使用唯一事件键，重复支付回调不会重复发放。</div>' +
            '<h4 class="mt-4 mb-3">近 30 天转化漏斗</h4><div class="referral-cards">' +
            [["链接访问",s.visits],["邀请注册",s.registrations],["邮箱验证",s.verified===null?"未启用验证":s.verified],["首购订单",s.first_orders],["续费用户",s.renewal_users],["持续续费率",s.renewal_rate+"%"],["待确认奖励",s.pending_rewards],["已撤销奖励",s.reversed_rewards],["奖励投入产出比",s.roi===null?"-":s.roi]].map(function(x){return '<section class="block block-rounded"><div class="block-content"><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div></section>';}).join('') +
            '</div><div class="row mt-3"><div class="col-lg-7"><h5>每日趋势</h5>'+table(['日期','访问','注册','首购','续费'],trend.slice(-30).reverse().map(function(x){return [x.date,x.visits,x.registrations,x.first_orders,x.renewals];}))+'</div><div class="col-lg-5"><h5>渠道转化排行</h5>'+table(['渠道','访问','注册'],(funnel.channels||[]).map(function(x){return [x.channel,x.visits,x.registrations];}))+'<h5 class="mt-4">套餐转化排行</h5>'+table(['套餐 ID','订单','收入'],(funnel.plans||[]).map(function(x){return [x.plan_id,x.orders,'¥'+money(x.revenue)];}))+'</div></div>');
            root.querySelector('[data-refresh]').onclick=function(){delete responseCache['/dashboard'];content('<div class="block-content referral-loading">正在刷新…</div>');api('/dashboard?refresh=1').then(function(fresh){responseCache['/dashboard']={time:Date.now(),payload:fresh};loadOverview();}).catch(fail);};
        }).catch(fail);
    }

    function loadSetting() {
        var requestedTab = tab;
        cachedApi("/dashboard").then(function (payload) { if (tab !== requestedTab) return; var s = payload.data.setting || {};
            var noActivePlanPolicy = s.no_active_plan_reward_policy || "allow_all";
            var noActivePlanRewardsAllowed = noActivePlanPolicy === "allow_all";
            content('<div class="block block-rounded"><div class="block-header block-header-default"><h3 class="block-title">基础奖励规则</h3></div><div class="block-content"><form data-setting class="referral-form"><div class="custom-control custom-switch mb-4"><input class="custom-control-input" id="referral-enabled" name="enabled" type="checkbox" ' + (s.enabled ? "checked" : "") + '><label class="custom-control-label" for="referral-enabled">启用新版邀请计划</label></div>' +
                field("first_order_min", "有效首单最低金额（元）", money(s.first_order_min), "number", "0.01") + field("invitee_reward", "被邀请人首单奖励（元）", money(s.invitee_reward), "number", "0.01") +
                '<div class="form-group"><label>新人首单优惠券模板</label><select class="form-control" name="newcomer_coupon_template_id"><option value="">不发放优惠券</option>'+(payload.data.coupon_templates||[]).map(function(c){return '<option value="'+c.id+'" '+(String(s.newcomer_coupon_template_id||'')===String(c.id)?'selected':'')+'>'+esc(c.name)+'</option>';}).join('')+'</select><small class="form-text text-muted">受邀用户注册后直接发放到“我的优惠券”，有效期以优惠券模板设置为准。</small></div>'+
                '<div class="form-group"><div class="custom-control custom-switch"><input class="custom-control-input" id="no-active-plan-reward-enabled" type="checkbox" '+(noActivePlanRewardsAllowed?'checked':'')+'><label class="custom-control-label" for="no-active-plan-reward-enabled">允许无有效套餐用户获得邀请奖励</label></div><small class="form-text text-muted">奖励资格在被邀请人注册并绑定邀请关系时锁定，后续套餐状态变化不会改变。</small></div>'+
                '<div class="form-group pl-3" data-no-active-plan-policy '+(noActivePlanRewardsAllowed?'style="display:none"':'')+'><label class="d-block">无有效套餐时不发放范围</label>'+
                '<div class="custom-control custom-radio mb-2"><input class="custom-control-input" id="policy-block-inviter" name="no_active_plan_policy_choice" type="radio" value="block_inviter_commission" '+(noActivePlanPolicy==='block_inviter_commission'?'checked':'')+'><label class="custom-control-label" for="policy-block-inviter">邀请人不发放订单返佣</label></div>'+
                '<div class="custom-control custom-radio mb-2"><input class="custom-control-input" id="policy-block-invitee" name="no_active_plan_policy_choice" type="radio" value="block_invitee_rewards" '+(noActivePlanPolicy==='block_invitee_rewards'?'checked':'')+'><label class="custom-control-label" for="policy-block-invitee">被邀请人不发放新人奖励</label></div>'+
                '<div class="custom-control custom-radio"><input class="custom-control-input" id="policy-block-both" name="no_active_plan_policy_choice" type="radio" value="block_both" '+(noActivePlanPolicy==='block_both'||noActivePlanRewardsAllowed?'checked':'')+'><label class="custom-control-label" for="policy-block-both">双方都不发放</label></div></div>'+
                field("base_commission_rate", "基础返佣比例（%）", s.base_commission_rate) + field("freeze_days", "佣金冻结天数", s.freeze_days) +
                field("monthly_reward_limit", "每人每月额外奖励上限（元，留空不限）", s.monthly_reward_limit == null ? "" : money(s.monthly_reward_limit), "number", "0.01") + '<button class="btn btn-primary" type="submit"><i class="fa fa-save mr-1"></i>保存规则</button></form></div></div>');
            var noActivePlanToggle = root.querySelector("#no-active-plan-reward-enabled");
            var noActivePlanOptions = root.querySelector("[data-no-active-plan-policy]");
            noActivePlanToggle.onchange = function () { noActivePlanOptions.style.display = noActivePlanToggle.checked ? "none" : "block"; };
            root.querySelector("[data-setting]").onsubmit = function (event) { event.preventDefault(); var f = new FormData(event.target); var data = Object.fromEntries(f.entries()); data.enabled = event.target.enabled.checked ? 1 : 0; data.no_active_plan_reward_policy=noActivePlanToggle.checked?"allow_all":(data.no_active_plan_policy_choice||"block_both");delete data.no_active_plan_policy_choice; ["first_order_min","invitee_reward"].forEach(function(k){data[k]=Math.round(Number(data[k]||0)*100);}); ["base_commission_rate","freeze_days"].forEach(function(k){data[k]=Number(data[k]||0);}); data.newcomer_coupon_template_id=data.newcomer_coupon_template_id===""?null:Number(data.newcomer_coupon_template_id);data.monthly_reward_limit = data.monthly_reward_limit === "" ? null : Math.round(Number(data.monthly_reward_limit)*100); api("/setting/save", { method:"POST", body:JSON.stringify(data) }).then(function(){ clearCache("/dashboard"); alert("保存成功"); loadSetting(); }).catch(function(e){alert(e.message);}); };
        }).catch(fail);
    }

    function rewardLabel(reward) { if(!reward||!reward.enabled)return '无';return {balance:'余额 ¥'+money(reward.reward_value),commission_balance:'佣金 ¥'+money(reward.reward_value),traffic:'流量 '+reward.reward_value+' GB',duration:'套餐时长 '+reward.reward_value+' 天'}[reward.reward_type]||'无'; }
    function loadLevels() { cachedApi("/levels").then(function (p) { if(tab !== "levels") return; nextLevelSort=(p.data||[]).reduce(function(max,x){return Math.max(max,Number(x.sort||0));},0)+10; renderRuleTable("成长等级（长期权益 + 一次性达标奖励）", p.data, "level", ["等级顺序","名称","升级条件","返佣比例","套餐优惠","达标奖励"], function(x){return [x.sort,x.name,x.required_invites+" 人 + ¥"+money(x.required_revenue),x.commission_rate+"%",x.member_discount?"减免 "+x.member_discount+"%":"无",rewardLabel(x.reward)];}); }).catch(fail); }
    function renderRuleTable(title, rows, kind, heads, values) {
        content('<div class="block block-rounded"><div class="block-header block-header-default"><h3 class="block-title">'+title+'</h3><button class="btn btn-sm btn-primary" data-add><i class="fa fa-plus mr-1"></i>新增</button></div><div class="block-content p-0"><div class="table-responsive"><table class="table table-hover table-vcenter mb-0"><thead><tr>'+heads.map(function(x){return '<th>'+x+'</th>';}).join('')+'<th>状态</th><th>操作</th></tr></thead><tbody>'+rows.map(function(row){return '<tr>'+values(row).map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'<td><span class="badge badge-'+(row.enabled?'success':'secondary')+'">'+(row.enabled?'启用':'停用')+'</span></td><td><button class="btn btn-sm btn-light" data-edit="'+row.id+'">编辑</button><button class="btn btn-sm btn-light text-danger" data-drop="'+row.id+'">删除</button></td></tr>';}).join('')+'</tbody></table></div></div></div>');
        root.querySelector('[data-add]').onclick=function(){ editRule(kind, null); };
        root.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){editRule(kind,rows.find(function(x){return String(x.id)===b.dataset.edit;}));};});
        root.querySelectorAll('[data-drop]').forEach(function(b){b.onclick=function(){if(confirm('确认删除？'))api('/'+kind+'/drop',{method:'POST',body:JSON.stringify({id:Number(b.dataset.drop)})}).then(function(){clearCache('/levels');loadTab();}).catch(function(e){alert(e.message);});};});
    }

    function editRule(kind, row) {
        row=row||{}; var reward=row.reward&&row.reward.enabled?row.reward:{};
        var modal=document.createElement('div');modal.className='referral-modal';
        modal.innerHTML='<div class="referral-modal-dialog"><div class="referral-modal-head"><h3>'+(row.id?'编辑':'新增')+'成长等级</h3><button type="button" data-cancel>×</button></div><form><div class="referral-modal-body">'+
            '<div class="form-group"><label>中文名称</label><input class="form-control" name="name" required maxlength="100" value="'+esc(row.name||'')+'"></div><div class="form-group"><label>英文名称</label><input class="form-control" name="name_en" maxlength="100" value="'+esc(row.name_en||'')+'"></div><div class="form-group"><label>中文描述</label><input class="form-control" name="description" maxlength="255" value="'+esc(row.description||'')+'"></div><div class="form-group"><label>英文描述</label><input class="form-control" name="description_en" maxlength="255" value="'+esc(row.description_en||'')+'"></div>'+field('sort','等级顺序（数值越大等级越高）',row.sort||nextLevelSort)+'<small class="form-text text-muted mb-3">建议按 10、20、30 设置，方便以后在两个等级之间插入新等级。</small>'+field('required_invites','升级所需有效邀请人数',row.required_invites||0)+field('required_revenue','升级所需邀请成交额（元）',money(row.required_revenue||0),'number')+
            field('commission_rate','返佣比例（%）',row.commission_rate||10)+field('member_discount','套餐优惠比例（%，10 表示减免 10%）',row.member_discount||0)+field('valid_days','等级有效期（天，0为永久）',row.valid_days||0)+field('retain_invites','每周期保级邀请数',row.retain_invites||0)+field('retain_revenue','每周期保级成交额（元）',money(row.retain_revenue||0),'number')+
            '<hr><h5>一次性达标奖励</h5><div class="form-group"><label>奖励类型</label><select class="form-control" name="reward_type"><option value="none" '+(!reward.reward_type?'selected':'')+'>不发放</option><option value="balance" '+(reward.reward_type==='balance'?'selected':'')+'>账户余额</option><option value="commission_balance" '+(reward.reward_type==='commission_balance'?'selected':'')+'>推广佣金</option><option value="traffic" '+(reward.reward_type==='traffic'?'selected':'')+'>流量（GB）</option><option value="duration" '+(reward.reward_type==='duration'?'selected':'')+'>套餐时长（天）</option></select><small class="form-text text-muted">用户首次达到本等级时发放一次；跨级升级会补发所有已达标等级奖励。</small></div>'+field('reward_value','奖励数值',reward.reward_type&&['balance','commission_balance'].indexOf(reward.reward_type)>=0?money(reward.reward_value):(reward.reward_value||''))+
            '<div class="custom-control custom-switch"><input class="custom-control-input" id="referral-rule-enabled" name="enabled" type="checkbox" '+(row.enabled===0?'':'checked')+'><label class="custom-control-label" for="referral-rule-enabled">启用规则</label></div></div><div class="referral-modal-foot"><button class="btn btn-light" type="button" data-cancel>取消</button><button class="btn btn-primary" type="submit">保存</button></div></form></div>';
        root.appendChild(modal);modal.querySelectorAll('[data-cancel]').forEach(function(b){b.onclick=function(){modal.remove();};});
        modal.querySelector('form').onsubmit=function(event){event.preventDefault();var form=new FormData(event.target);var data=Object.fromEntries(form.entries());if(row.id)data.id=row.id;data.required_invites=Number(data.required_invites||0);data.enabled=event.target.enabled.checked?1:0;data.sort=Number(data.sort||0);data.required_revenue=Math.round(Number(data.required_revenue||0)*100);data.commission_rate=Number(data.commission_rate||0);data.member_discount=Number(data.member_discount||0);data.valid_days=Number(data.valid_days||0);data.retain_invites=Number(data.retain_invites||0);data.retain_revenue=Math.round(Number(data.retain_revenue||0)*100);data.reward_value=data.reward_type==='none'?0:(['balance','commission_balance'].indexOf(data.reward_type)>=0?Math.round(Number(data.reward_value||0)*100):Number(data.reward_value||0));var submit=event.target.querySelector('[type="submit"]');submit.disabled=true;api('/'+kind+'/save',{method:'POST',body:JSON.stringify(data)}).then(function(){clearCache('/levels');modal.remove();loadTab();}).catch(function(e){submit.disabled=false;alert(e.message);});};
    }

    function relationViewNav(){return '<div class="block-content pb-0"><div class="btn-group" role="group" aria-label="邀请关系数据类型"><button class="btn '+(relationView==='relations'?'btn-primary':'btn-light')+'" data-relation-view="relations">邀请关系</button><button class="btn '+(relationView==='rewards'?'btn-primary':'btn-light')+'" data-relation-view="rewards">奖励流水</button></div></div>';}
    function bindRelationViewNav(){root.querySelectorAll('[data-relation-view]').forEach(function(button){button.onclick=function(){if(relationView===button.dataset.relationView)return;relationView=button.dataset.relationView;content('<div class="block-content referral-loading">加载中…</div>');loadRelations();};});}
    function loadRelations(){if(relationView==='rewards'){loadRewards();return;}var state=listState.relations;api('/relations?'+queryString(state)).then(function(p){if(tab!=='relations'||relationView!=='relations')return;content(relationViewNav()+'<div class="referral-filters"><input class="form-control" name="keyword" placeholder="搜索用户或邀请人邮箱" value="'+esc(state.keyword)+'"><select class="form-control" name="status"><option value="">全部状态</option><option value="effective" '+(state.status==='effective'?'selected':'')+'>有效邀请</option><option value="pending" '+(state.status==='pending'?'selected':'')+'>待首购</option></select><button class="btn btn-primary" data-search>查询</button><button class="btn btn-light" data-reset>重置</button></div>'+table(['受邀用户','邀请人','注册时间','状态','操作'],p.data.map(function(x){return [x.email,x.inviter_email,dateTime(x.created_at),x.effective?'有效邀请':'待首购',''];}))+pagination('relations',p.total));bindRelationViewNav();root.querySelectorAll('tbody tr').forEach(function(tr,index){var row=p.data[index];if(!row)return;var cell=tr.children[3];cell.innerHTML='<span class="badge badge-'+(row.effective?'success':'secondary')+'">'+cell.textContent+'</span>';tr.lastElementChild.innerHTML='<button class="btn btn-sm btn-light" data-detail>查看链路</button>';tr.querySelector('[data-detail]').onclick=function(){relationDetail(row);};});bindListControls('relations');}).catch(fail);}
    function relationDetail(row){api('/relation/detail?user_id='+row.id).then(function(p){var d=p.data,modal=document.createElement('div');modal.className='referral-modal';modal.innerHTML='<div class="referral-modal-dialog referral-modal-lg"><div class="referral-modal-head"><h3>邀请关系完整链路</h3><button type="button" data-cancel>×</button></div><div class="referral-modal-body"><dl class="row"><dt class="col-3">受邀用户</dt><dd class="col-9">'+esc(d.user.email)+'（ID '+d.user.id+'）</dd><dt class="col-3">当前邀请人</dt><dd class="col-9">'+esc(d.inviter?d.inviter.email:'-')+'</dd><dt class="col-3">注册时间</dt><dd class="col-9">'+dateTime(d.user.created_at)+'</dd></dl><h5>订单链路</h5>'+table(['订单号','套餐','金额','状态','时间'],d.orders.map(function(x){return [x.trade_no,x.plan_id,'¥'+money(x.total_amount),x.status,dateTime(x.created_at)];}))+'<h5 class="mt-4">奖励链路</h5>'+table(['类型','奖励','状态','说明','时间'],d.rewards.map(function(x){return [rewardType(x.reward_type),rewardValue(x),rewardStatus(x.status),x.description,dateTime(x.created_at)];}))+'<div class="form-group mt-4"><label>调整邀请人用户 ID（留空为解除关系）</label><input class="form-control" name="inviter_id" type="number" min="1" value="'+(d.user.invite_user_id||'')+'"><small class="form-text text-muted">已产生有效奖励的关系需先撤销相关奖励，避免账务不一致。</small></div></div><div class="referral-modal-foot"><button class="btn btn-light" data-cancel>关闭</button><button class="btn btn-primary" data-save>保存关系</button></div></div>';root.appendChild(modal);modal.querySelectorAll('[data-cancel]').forEach(function(b){b.onclick=function(){modal.remove();};});modal.querySelector('[data-save]').onclick=function(){var value=modal.querySelector('[name="inviter_id"]').value;api('/relation/change',{method:'POST',body:JSON.stringify({user_id:row.id,inviter_id:value===''?null:Number(value)})}).then(function(){modal.remove();loadRelations();}).catch(function(e){alert(e.message);});};}).catch(function(e){alert(e.message);});}
    function loadRewards(){var state=listState.rewards;api('/rewards?'+queryString(state)).then(function(p){if(tab!=='relations'||relationView!=='rewards')return;content(relationViewNav()+'<div class="referral-filters"><input class="form-control" name="keyword" placeholder="搜索用户邮箱" value="'+esc(state.keyword)+'"><select class="form-control" name="type"><option value="">全部类型</option><option value="effective_invite">有效邀请</option><option value="balance">账户余额奖励</option><option value="commission_balance">佣金奖励</option><option value="level">成长等级调整</option></select><select class="form-control" name="status"><option value="">全部状态</option><option value="granted">已发放</option><option value="pending">待发放</option><option value="reversed">已撤销</option><option value="rejected">已拒绝</option></select><input class="form-control" name="from" type="date" value="'+esc(state.from)+'"><input class="form-control" name="to" type="date" value="'+esc(state.to)+'"><button class="btn btn-primary" data-search>查询</button><button class="btn btn-light" data-reset>重置</button></div>'+table(['用户','来源用户','类型','奖励','状态','说明','时间','操作'],p.data.map(function(x){return [x.user_email,x.invited_user_email,rewardType(x.reward_type),rewardValue(x),rewardStatus(x.status),x.description,dateTime(x.created_at),''];}))+pagination('rewards',p.total));bindRelationViewNav();['type','status'].forEach(function(k){var el=root.querySelector('[name="'+k+'"]');if(el)el.value=state[k];});root.querySelectorAll('tbody tr').forEach(function(tr,index){var row=p.data[index];if(!row)return;var statusCell=tr.children[4];statusCell.innerHTML='<span class="badge badge-'+({granted:'success',pending:'warning',reversed:'secondary',rejected:'danger'}[row.status]||'secondary')+'">'+statusCell.textContent+'</span>';var cell=tr.lastElementChild;if(row.status==='granted'&&row.order_id){cell.innerHTML='<button class="btn btn-sm btn-light text-danger" data-reverse>撤销</button>';cell.querySelector('[data-reverse]').onclick=function(){reverseReward(row);};}else cell.textContent='-';});bindListControls('rewards');}).catch(fail);}
    function pagination(kind,total){var state=listState[kind],pages=Math.max(Math.ceil(total/state.pageSize),1);return '<div class="referral-pagination"><span>共 '+total+' 条</span><select class="form-control" data-page-size><option value="10">10 条/页</option><option value="20">20 条/页</option><option value="50">50 条/页</option><option value="100">100 条/页</option></select><button class="btn btn-light" data-page="'+(state.current-1)+'" '+(state.current<=1?'disabled':'')+'>上一页</button><span>'+state.current+' / '+pages+'</span><button class="btn btn-light" data-page="'+(state.current+1)+'" '+(state.current>=pages?'disabled':'')+'>下一页</button></div>';}
    function bindListControls(kind){var state=listState[kind],search=function(){root.querySelectorAll('.referral-filters [name]').forEach(function(el){state[el.name]=el.value.trim();});state.current=1;loadTab();};root.querySelector('[data-search]').onclick=search;root.querySelectorAll('.referral-filters input').forEach(function(input){input.onkeydown=function(event){if(event.key==='Enter')search();};});root.querySelector('[data-reset]').onclick=function(){Object.keys(state).forEach(function(key){if(key!=='current'&&key!=='pageSize')state[key]='';});state.current=1;loadTab();};root.querySelectorAll('[data-page]').forEach(function(button){button.onclick=function(){state.current=Number(button.dataset.page);loadTab();};});var size=root.querySelector('[data-page-size]');size.value=String(state.pageSize);size.onchange=function(){state.pageSize=Number(size.value);state.current=1;loadTab();};}
    function reverseReward(row){var modal=document.createElement('div');modal.className='referral-modal';modal.innerHTML='<div class="referral-modal-dialog"><div class="referral-modal-head"><h3>撤销订单相关奖励</h3><button type="button" data-cancel>×</button></div><form><div class="referral-modal-body"><div class="alert alert-warning">本操作会撤销该订单产生的全部邀请奖励，并扣回已发放余额。余额不足时系统会拒绝操作。</div><div class="form-group"><label>撤销原因</label><textarea class="form-control" name="reason" maxlength="200" rows="3" required placeholder="例如：订单退款"></textarea></div></div><div class="referral-modal-foot"><button class="btn btn-light" type="button" data-cancel>取消</button><button class="btn btn-danger" type="submit">确认撤销</button></div></form></div>';root.appendChild(modal);modal.querySelectorAll('[data-cancel]').forEach(function(b){b.onclick=function(){modal.remove();};});modal.querySelector('form').onsubmit=function(event){event.preventDefault();var submit=event.target.querySelector('[type="submit"]');submit.disabled=true;api('/reward/reverse',{method:'POST',body:JSON.stringify({id:row.id,reason:event.target.reason.value.trim()})}).then(function(){modal.remove();loadRewards();}).catch(function(e){submit.disabled=false;alert(e.message);});};}
    function table(heads,rows){return '<div class="block block-rounded"><div class="block-content p-0"><div class="table-responsive"><table class="table table-hover table-vcenter mb-0"><thead><tr>'+heads.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+(rows.length?rows.map(function(r){return '<tr>'+r.map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'</tr>';}).join(''):'<tr><td class="referral-empty" colspan="'+heads.length+'">暂无数据</td></tr>')+'</tbody></table></div></div></div>';}

    function mountSidebarMenu() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return false;
        var subscriptionMenu = Array.prototype.find.call(nav.querySelectorAll(".nav-main-link-name"), function (name) {
            return name.textContent.trim() === "订阅管理";
        });
        var subscriptionItem = subscriptionMenu && subscriptionMenu.closest(".nav-main-item");
        if (!subscriptionItem) return false;

        var item = nav.querySelector(".referral-admin-menu-item");
        if (!item) {
            item = document.createElement("li");
            item.className = "nav-main-item referral-admin-menu-item";
            item.innerHTML = '<a class="nav-main-link referral-admin-menu-link" href="javascript:void(0);" title="邀请管理">' +
                '<i class="nav-main-link-icon si si-present"></i>' +
                '<span class="nav-main-link-name">邀请管理</span></a>';
            item.querySelector("a").onclick = function (event) {
                event.preventDefault();
                if (!isReferralRoute() && window.g_history) window.g_history.push("/referral");
                setTimeout(open, 0);
            };
        }
        if (item.nextElementSibling !== subscriptionItem) nav.insertBefore(item, subscriptionItem);
        return true;
    }

    function mountHeaderFallback() {
        var host = document.querySelector(".content-header .content-header-section:last-child, .content-header-section:last-child");
        if (!host || host.querySelector(".referral-admin-entry")) return;
        var link=document.createElement("a"); link.className="referral-admin-entry"; link.href="javascript:void(0)"; link.textContent="邀请管理"; link.onclick=open; host.appendChild(link);
    }

    function mount() {
        if (!window.settings || !window.settings.secure_path) return;
        if (mountSidebarMenu()) {
            document.querySelectorAll(".referral-admin-entry").forEach(function (entry) { entry.remove(); });
            if (!dashboardPreloaded) {
                dashboardPreloaded = true;
                cachedApi("/dashboard").catch(function () { dashboardPreloaded = false; });
            }
            return;
        }
        mountHeaderFallback();
    }
    function start(){
        mount();
        if (isReferralRoute()) setTimeout(open, 0);
        if (window.g_history) window.g_history.listen(function (location) {
            if (location.pathname === "/referral") setTimeout(open, 0);
            else close();
        });
        document.addEventListener("click", function (event) {
            var link = event.target.closest && event.target.closest(".nav-main-link");
            if (link && !link.classList.contains("referral-admin-menu-link")) close();
        });
        new MutationObserver(function(){requestAnimationFrame(mount);}).observe(document.getElementById("root")||document.body,{childList:true,subtree:true});
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
