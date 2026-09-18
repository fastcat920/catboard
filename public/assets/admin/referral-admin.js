(function () {
    "use strict";
    var root;
    var tab = "overview";

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
    function field(name, label, value, type) { return '<label>' + label + '<input name="' + name + '" type="' + (type || "number") + '" value="' + esc(value == null ? "" : value) + '"></label>'; }

    function setMenuActive(active) {
        document.querySelectorAll(".referral-admin-menu-link").forEach(function (link) {
            link.classList.toggle("active", active);
        });
    }

    function open() {
        if (!root) {
            root = document.createElement("div");
            root.className = "referral-admin";
            document.body.appendChild(root);
        }
        root.hidden = false;
        setMenuActive(true);
        renderShell();
        loadTab();
    }

    function close() { if (root) root.hidden = true; setMenuActive(false); }

    function renderShell() {
        root.innerHTML = '<div class="referral-admin-head"><div><b>邀请管理</b><small>双向奖励、推广等级与增长数据</small></div><button data-close>×</button></div>' +
            '<nav>' + [["overview","数据概览"],["setting","奖励规则"],["levels","推广等级"],["milestones","里程碑"],["relations","邀请关系"],["rewards","奖励流水"]].map(function (item) {
                return '<button data-tab="' + item[0] + '" class="' + (tab === item[0] ? "active" : "") + '">' + item[1] + '</button>';
            }).join("") + '</nav><main data-content><div class="referral-loading">加载中…</div></main>';
        root.querySelector("[data-close]").onclick = close;
        root.querySelectorAll("[data-tab]").forEach(function (button) { button.onclick = function () { tab = button.dataset.tab; renderShell(); loadTab(); }; });
    }

    function content(html) { root.querySelector("[data-content]").innerHTML = html; }
    function fail(error) { content('<div class="referral-error">' + esc(error.message) + '</div>'); }
    function loadTab() {
        ({ overview: loadOverview, setting: loadSetting, levels: loadLevels, milestones: loadMilestones, relations: loadRelations, rewards: loadRewards }[tab] || loadOverview)();
    }

    function loadOverview() {
        api("/dashboard").then(function (payload) { var d = payload.data;
            content('<div class="referral-cards">' + [
                ["邀请注册", d.registered_invites], ["有效邀请", d.effective_invites], ["首购转化率", d.conversion_rate + "%"],
                ["邀请订单收入", "¥" + money(d.referral_revenue)], ["额外奖励支出", "¥" + money(d.reward_total)], ["活跃推广者", d.active_promoters]
            ].map(function (x) { return '<section><small>' + x[0] + '</small><strong>' + x[1] + '</strong></section>'; }).join("") + '</div><div class="referral-note">有效邀请以好友完成符合最低金额的首笔有效套餐订单为准。奖励流水使用唯一事件键，重复支付回调不会重复发放。</div>');
        }).catch(fail);
    }

    function loadSetting() {
        api("/dashboard").then(function (payload) { var s = payload.data.setting || {};
            content('<form data-setting class="referral-form"><h3>基础奖励规则</h3><label class="switch"><input name="enabled" type="checkbox" ' + (s.enabled ? "checked" : "") + '>启用新版邀请计划</label>' +
                field("first_order_min", "有效首单最低金额（分）", s.first_order_min) + field("invitee_reward", "被邀请人首单奖励（分）", s.invitee_reward) +
                field("base_commission_rate", "基础返佣比例（%）", s.base_commission_rate) + field("freeze_days", "佣金冻结天数", s.freeze_days) +
                field("monthly_reward_limit", "每人每月额外奖励上限（分，留空不限）", s.monthly_reward_limit) + '<button type="submit">保存规则</button></form>');
            root.querySelector("[data-setting]").onsubmit = function (event) { event.preventDefault(); var f = new FormData(event.target); var data = Object.fromEntries(f.entries()); data.enabled = event.target.enabled.checked ? 1 : 0; ["first_order_min","invitee_reward","base_commission_rate","freeze_days"].forEach(function(k){data[k]=Number(data[k]||0);}); data.monthly_reward_limit = data.monthly_reward_limit === "" ? null : Number(data.monthly_reward_limit); api("/setting/save", { method:"POST", body:JSON.stringify(data) }).then(function(){ alert("保存成功"); loadSetting(); }).catch(function(e){alert(e.message);}); };
        }).catch(fail);
    }

    function loadLevels() { api("/levels").then(function (p) { renderRuleTable("推广等级", p.data, "level", ["名称","有效邀请数","返佣比例"], function(x){return [x.name,x.required_invites,x.commission_rate+"%"];}); }).catch(fail); }
    function loadMilestones() { api("/milestones").then(function (p) { renderRuleTable("里程碑奖励", p.data, "milestone", ["名称","有效邀请数","奖励"], function(x){return [x.name,x.required_invites,(x.reward_type === "balance" ? "余额 " : "佣金 ")+"¥"+money(x.reward_value)];}); }).catch(fail); }
    function renderRuleTable(title, rows, kind, heads, values) {
        content('<div class="referral-toolbar"><h3>'+title+'</h3><button data-add>新增</button></div><table><thead><tr>'+heads.map(function(x){return '<th>'+x+'</th>';}).join('')+'<th>状态</th><th>操作</th></tr></thead><tbody>'+rows.map(function(row){return '<tr>'+values(row).map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'<td>'+(row.enabled?'启用':'停用')+'</td><td><button data-edit="'+row.id+'">编辑</button><button data-drop="'+row.id+'">删除</button></td></tr>';}).join('')+'</tbody></table>');
        root.querySelector('[data-add]').onclick=function(){ editRule(kind, null); };
        root.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){editRule(kind,rows.find(function(x){return String(x.id)===b.dataset.edit;}));};});
        root.querySelectorAll('[data-drop]').forEach(function(b){b.onclick=function(){if(confirm('确认删除？'))api('/'+kind+'/drop',{method:'POST',body:JSON.stringify({id:Number(b.dataset.drop)})}).then(loadTab).catch(function(e){alert(e.message);});};});
    }

    function editRule(kind, row) {
        row=row||{}; var milestone=kind==='milestone'; var data={id:row.id||undefined,name:prompt('名称',row.name||'')}; if(!data.name)return;
        data.required_invites=Number(prompt('所需有效邀请人数',row.required_invites||0)); data.enabled=confirm('是否启用这条规则？')?1:0;
        if(milestone){data.reward_type=confirm('确定=账户余额，取消=推广佣金')?'balance':'commission_balance';data.reward_value=Math.round(Number(prompt('奖励金额（元）',money(row.reward_value))||0)*100);}else{data.commission_rate=Number(prompt('返佣比例（%）',row.commission_rate||10));}
        api('/'+kind+'/save',{method:'POST',body:JSON.stringify(data)}).then(loadTab).catch(function(e){alert(e.message);});
    }

    function loadRelations(){api('/relations').then(function(p){content(table(['受邀用户','邀请人','注册时间','状态'],p.data.map(function(x){return [x.email,x.inviter_email,new Date(x.created_at*1000).toLocaleString(),x.effective?'有效邀请':'待首购'];})));}).catch(fail);}
    function loadRewards(){api('/rewards').then(function(p){content(table(['用户','来源用户','类型','奖励','说明','时间'],p.data.map(function(x){return [x.user_email,x.invited_user_email,x.reward_type,x.reward_type==='level'?x.reward_value+'%':'¥'+money(x.reward_value),x.description,new Date(x.created_at*1000).toLocaleString()];})));}).catch(fail);}
    function table(heads,rows){return '<table><thead><tr>'+heads.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+r.map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';}

    function mountSidebarMenu() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return false;
        if (nav.querySelector(".referral-admin-menu-item")) return true;

        var item = document.createElement("li");
        item.className = "nav-main-item referral-admin-menu-item";
        item.innerHTML = '<a class="nav-main-link referral-admin-menu-link" href="javascript:void(0);" title="邀请管理">' +
            '<i class="nav-main-link-icon si si-present"></i>' +
            '<span class="nav-main-link-name">邀请管理</span></a>';
        item.querySelector("a").onclick = function (event) { event.preventDefault(); open(); };

        var userMenu = Array.prototype.find.call(nav.querySelectorAll(".nav-main-link-name"), function (name) {
            return name.textContent.trim() === "用户管理";
        });
        var userItem = userMenu && userMenu.closest(".nav-main-item");
        nav.insertBefore(item, userItem || null);
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
            return;
        }
        mountHeaderFallback();
    }
    function start(){mount();new MutationObserver(function(){requestAnimationFrame(mount);}).observe(document.getElementById("root")||document.body,{childList:true,subtree:true});}
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
