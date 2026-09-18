(function () {
    "use strict";
    var root;
    var tab = "overview";
    var responseCache = {};
    var listState = { relations: { current: 1, pageSize: 20, keyword: "", status: "" }, rewards: { current: 1, pageSize: 20, keyword: "", status: "", type: "", from: "", to: "" } };
    var dashboardPreloaded = false;
    var previousHeaderTitle = null;

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
        return ({ effective_invite: "有效邀请", balance: "账户余额奖励", commission_balance: "佣金奖励", level: "推广等级调整" })[value] || value || "-";
    }
    function rewardValue(row) {
        if (row.reward_type === "effective_invite") return "-";
        return row.reward_type === "level" ? row.reward_value + "%" : "¥" + money(row.reward_value);
    }
    function rewardStatus(value) {
        return ({ pending: "待发放", granted: "已发放", reversed: "已撤销", rejected: "已拒绝" })[value] || value || "-";
    }
    function field(name, label, value, type) { return '<div class="form-group"><label>' + label + '</label><input class="form-control" name="' + name + '" type="' + (type || "number") + '" value="' + esc(value == null ? "" : value) + '"></div>'; }
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
        root.innerHTML = '<div class="p-0 p-lg-4"><div class="mb-0 block border-bottom"><nav class="nav nav-tabs nav-tabs-block">' + [["overview","数据概览"],["setting","奖励规则"],["levels","推广等级"],["milestones","里程碑"],["relations","邀请关系"],["rewards","奖励流水"]].map(function (item) {
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
        ({ overview: loadOverview, setting: loadSetting, levels: loadLevels, milestones: loadMilestones, relations: loadRelations, rewards: loadRewards }[tab] || loadOverview)();
    }

    function loadOverview() {
        var requestedTab = tab;
        cachedApi("/dashboard").then(function (payload) { if (tab !== requestedTab) return; var d = payload.data;
            content('<div class="referral-overview-tools"><button class="btn btn-light" data-refresh><i class="fa fa-sync-alt mr-1"></i>刷新数据</button></div><div class="referral-cards">' + [
                ["邀请注册", d.registered_invites], ["有效邀请", d.effective_invites], ["首购转化率", d.conversion_rate + "%"],
                ["邀请订单收入", "¥" + money(d.referral_revenue)], ["额外奖励支出", "¥" + money(d.reward_total)], ["活跃推广者", d.active_promoters]
            ].map(function (x) { return '<section class="block block-rounded"><div class="block-content"><small>' + x[0] + '</small><strong>' + x[1] + '</strong></div></section>'; }).join("") + '</div><div class="alert alert-info">有效邀请以好友完成符合最低金额的首笔有效套餐订单为准。奖励流水使用唯一事件键，重复支付回调不会重复发放。</div>');
            root.querySelector('[data-refresh]').onclick=function(){delete responseCache['/dashboard'];content('<div class="block-content referral-loading">正在刷新…</div>');api('/dashboard?refresh=1').then(function(fresh){responseCache['/dashboard']={time:Date.now(),payload:fresh};loadOverview();}).catch(fail);};
        }).catch(fail);
    }

    function loadSetting() {
        var requestedTab = tab;
        cachedApi("/dashboard").then(function (payload) { if (tab !== requestedTab) return; var s = payload.data.setting || {};
            content('<div class="block block-rounded"><div class="block-header block-header-default"><h3 class="block-title">基础奖励规则</h3></div><div class="block-content"><form data-setting class="referral-form"><div class="custom-control custom-switch mb-4"><input class="custom-control-input" id="referral-enabled" name="enabled" type="checkbox" ' + (s.enabled ? "checked" : "") + '><label class="custom-control-label" for="referral-enabled">启用新版邀请计划</label></div>' +
                field("first_order_min", "有效首单最低金额（分）", s.first_order_min) + field("invitee_reward", "被邀请人首单奖励（分）", s.invitee_reward) +
                field("base_commission_rate", "基础返佣比例（%）", s.base_commission_rate) + field("freeze_days", "佣金冻结天数", s.freeze_days) +
                field("monthly_reward_limit", "每人每月额外奖励上限（分，留空不限）", s.monthly_reward_limit) + '<button class="btn btn-primary" type="submit"><i class="fa fa-save mr-1"></i>保存规则</button></form></div></div>');
            root.querySelector("[data-setting]").onsubmit = function (event) { event.preventDefault(); var f = new FormData(event.target); var data = Object.fromEntries(f.entries()); data.enabled = event.target.enabled.checked ? 1 : 0; ["first_order_min","invitee_reward","base_commission_rate","freeze_days"].forEach(function(k){data[k]=Number(data[k]||0);}); data.monthly_reward_limit = data.monthly_reward_limit === "" ? null : Number(data.monthly_reward_limit); api("/setting/save", { method:"POST", body:JSON.stringify(data) }).then(function(){ clearCache("/dashboard"); alert("保存成功"); loadSetting(); }).catch(function(e){alert(e.message);}); };
        }).catch(fail);
    }

    function loadLevels() { cachedApi("/levels").then(function (p) { if(tab !== "levels") return; renderRuleTable("推广等级", p.data, "level", ["名称","有效邀请数","返佣比例"], function(x){return [x.name,x.required_invites,x.commission_rate+"%"];}); }).catch(fail); }
    function loadMilestones() { cachedApi("/milestones").then(function (p) { if(tab !== "milestones") return; renderRuleTable("里程碑奖励", p.data, "milestone", ["名称","有效邀请数","奖励"], function(x){return [x.name,x.required_invites,(x.reward_type === "balance" ? "余额 " : "佣金 ")+"¥"+money(x.reward_value)];}); }).catch(fail); }
    function renderRuleTable(title, rows, kind, heads, values) {
        content('<div class="block block-rounded"><div class="block-header block-header-default"><h3 class="block-title">'+title+'</h3><button class="btn btn-sm btn-primary" data-add><i class="fa fa-plus mr-1"></i>新增</button></div><div class="block-content p-0"><div class="table-responsive"><table class="table table-hover table-vcenter mb-0"><thead><tr>'+heads.map(function(x){return '<th>'+x+'</th>';}).join('')+'<th>状态</th><th>操作</th></tr></thead><tbody>'+rows.map(function(row){return '<tr>'+values(row).map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'<td><span class="badge badge-'+(row.enabled?'success':'secondary')+'">'+(row.enabled?'启用':'停用')+'</span></td><td><button class="btn btn-sm btn-light" data-edit="'+row.id+'">编辑</button><button class="btn btn-sm btn-light text-danger" data-drop="'+row.id+'">删除</button></td></tr>';}).join('')+'</tbody></table></div></div></div>');
        root.querySelector('[data-add]').onclick=function(){ editRule(kind, null); };
        root.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){editRule(kind,rows.find(function(x){return String(x.id)===b.dataset.edit;}));};});
        root.querySelectorAll('[data-drop]').forEach(function(b){b.onclick=function(){if(confirm('确认删除？'))api('/'+kind+'/drop',{method:'POST',body:JSON.stringify({id:Number(b.dataset.drop)})}).then(function(){clearCache(kind === 'level' ? '/levels' : '/milestones');loadTab();}).catch(function(e){alert(e.message);});};});
    }

    function editRule(kind, row) {
        row=row||{}; var milestone=kind==='milestone';
        var modal=document.createElement('div');modal.className='referral-modal';
        modal.innerHTML='<div class="referral-modal-dialog"><div class="referral-modal-head"><h3>'+(row.id?'编辑':'新增')+(milestone?'里程碑':'推广等级')+'</h3><button type="button" data-cancel>×</button></div><form><div class="referral-modal-body">'+
            '<div class="form-group"><label>名称</label><input class="form-control" name="name" required maxlength="100" value="'+esc(row.name||'')+'"></div>'+field('required_invites','所需有效邀请人数',row.required_invites||0)+
            (milestone?'<div class="form-group"><label>奖励类型</label><select class="form-control" name="reward_type"><option value="balance" '+(row.reward_type==='balance'?'selected':'')+'>账户余额</option><option value="commission_balance" '+(row.reward_type==='commission_balance'?'selected':'')+'>推广佣金</option></select></div>'+field('reward_value','奖励金额（元）',row.id?money(row.reward_value):'') : field('commission_rate','返佣比例（%）',row.commission_rate||10))+
            '<div class="custom-control custom-switch"><input class="custom-control-input" id="referral-rule-enabled" name="enabled" type="checkbox" '+(row.enabled===0?'':'checked')+'><label class="custom-control-label" for="referral-rule-enabled">启用规则</label></div></div><div class="referral-modal-foot"><button class="btn btn-light" type="button" data-cancel>取消</button><button class="btn btn-primary" type="submit">保存</button></div></form></div>';
        root.appendChild(modal);modal.querySelectorAll('[data-cancel]').forEach(function(b){b.onclick=function(){modal.remove();};});
        modal.querySelector('form').onsubmit=function(event){event.preventDefault();var form=new FormData(event.target);var data=Object.fromEntries(form.entries());if(row.id)data.id=row.id;data.required_invites=Number(data.required_invites||0);data.enabled=event.target.enabled.checked?1:0;if(milestone)data.reward_value=Math.round(Number(data.reward_value||0)*100);else data.commission_rate=Number(data.commission_rate||0);var submit=event.target.querySelector('[type="submit"]');submit.disabled=true;api('/'+kind+'/save',{method:'POST',body:JSON.stringify(data)}).then(function(){clearCache(kind==='level'?'/levels':'/milestones');modal.remove();loadTab();}).catch(function(e){submit.disabled=false;alert(e.message);});};
    }

    function loadRelations(){var state=listState.relations;api('/relations?'+queryString(state)).then(function(p){if(tab!=='relations')return;content('<div class="referral-filters"><input class="form-control" name="keyword" placeholder="搜索用户或邀请人邮箱" value="'+esc(state.keyword)+'"><select class="form-control" name="status"><option value="">全部状态</option><option value="effective" '+(state.status==='effective'?'selected':'')+'>有效邀请</option><option value="pending" '+(state.status==='pending'?'selected':'')+'>待首购</option></select><button class="btn btn-primary" data-search>查询</button><button class="btn btn-light" data-reset>重置</button></div>'+table(['受邀用户','邀请人','注册时间','状态'],p.data.map(function(x){return [x.email,x.inviter_email,dateTime(x.created_at),x.effective?'有效邀请':'待首购'];}))+pagination('relations',p.total));root.querySelectorAll('tbody tr').forEach(function(tr,index){if(!p.data[index])return;var cell=tr.lastElementChild;cell.innerHTML='<span class="badge badge-'+(p.data[index].effective?'success':'secondary')+'">'+cell.textContent+'</span>';});bindListControls('relations');}).catch(fail);}
    function loadRewards(){var state=listState.rewards;api('/rewards?'+queryString(state)).then(function(p){if(tab!=='rewards')return;content('<div class="referral-filters"><input class="form-control" name="keyword" placeholder="搜索用户邮箱" value="'+esc(state.keyword)+'"><select class="form-control" name="type"><option value="">全部类型</option><option value="effective_invite">有效邀请</option><option value="balance">账户余额奖励</option><option value="commission_balance">佣金奖励</option><option value="level">推广等级调整</option></select><select class="form-control" name="status"><option value="">全部状态</option><option value="granted">已发放</option><option value="pending">待发放</option><option value="reversed">已撤销</option><option value="rejected">已拒绝</option></select><input class="form-control" name="from" type="date" value="'+esc(state.from)+'"><input class="form-control" name="to" type="date" value="'+esc(state.to)+'"><button class="btn btn-primary" data-search>查询</button><button class="btn btn-light" data-reset>重置</button></div>'+table(['用户','来源用户','类型','奖励','状态','说明','时间','操作'],p.data.map(function(x){return [x.user_email,x.invited_user_email,rewardType(x.reward_type),rewardValue(x),rewardStatus(x.status),x.description,dateTime(x.created_at),''];}))+pagination('rewards',p.total));['type','status'].forEach(function(k){var el=root.querySelector('[name="'+k+'"]');if(el)el.value=state[k];});root.querySelectorAll('tbody tr').forEach(function(tr,index){var row=p.data[index];if(!row)return;var statusCell=tr.children[4];statusCell.innerHTML='<span class="badge badge-'+({granted:'success',pending:'warning',reversed:'secondary',rejected:'danger'}[row.status]||'secondary')+'">'+statusCell.textContent+'</span>';var cell=tr.lastElementChild;if(row.status==='granted'&&row.order_id){cell.innerHTML='<button class="btn btn-sm btn-light text-danger" data-reverse>撤销</button>';cell.querySelector('[data-reverse]').onclick=function(){reverseReward(row);};}else cell.textContent='-';});bindListControls('rewards');}).catch(fail);}
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
            item.querySelector("a").onclick = function (event) { event.preventDefault(); open(); };
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
        document.addEventListener("click", function (event) {
            var link = event.target.closest && event.target.closest(".nav-main-link");
            if (link && !link.classList.contains("referral-admin-menu-link")) close();
        });
        new MutationObserver(function(){requestAnimationFrame(mount);}).observe(document.getElementById("root")||document.body,{childList:true,subtree:true});
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
