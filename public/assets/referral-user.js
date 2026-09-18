(function () {
    "use strict";
    var loading = false;
    function isInvitePage() { return /#\/invite(?:\?|$)/.test(location.hash); }
    function text(zh, en) { return localStorage.getItem("umi_locale") === "en-US" ? en : zh; }
    function load() {
        if (!isInvitePage() || loading || document.querySelector(".referral-progress-card")) return;
        var blocks = Array.prototype.slice.call(document.querySelectorAll(".block-title"));
        var anchor = blocks.find(function (node) { return /邀请|Invite/i.test(node.textContent); });
        if (!anchor) return;
        loading = true;
        var headers = { Accept: "application/json" }, auth = localStorage.getItem("authorization");
        if (auth) headers.authorization = auth;
        fetch("/api/v1/user/invite/fetch", { credentials: "include", headers: headers }).then(function (r) { return r.json(); }).then(function (payload) {
            var p = payload.data && payload.data.program;
            if (!p) return;
            var count = Number(p.effective_invites || 0), next = p.next_milestone, level = p.level;
            var card = document.createElement("div");
            card.className = "row mb-3 mb-md-0 referral-progress-card";
            var progress = next ? Math.min(100, Math.round(count * 100 / Number(next.required_invites))) : 100;
            card.innerHTML = '<div class="col-md-12"><div class="block block-rounded"><div class="block-header block-header-default"><h3 class="block-title">' + text("邀请成长计划", "Referral growth program") + '</h3></div><div class="block-content pb-3"><div class="referral-user-summary"><div><small>' + text("当前等级", "Current level") + '</small><strong>' + (level ? level.name : text("普通用户", "Member")) + '</strong></div><div><small>' + text("有效邀请", "Qualified referrals") + '</small><strong>' + count + '</strong></div><div><small>' + text("当前返佣", "Commission rate") + '</small><strong>' + (level ? level.commission_rate : p.setting.base_commission_rate) + '%</strong></div></div>' + (next ? '<div class="referral-user-next"><div><span>' + text("下一奖励：", "Next reward: ") + next.name + '</span><b>' + count + '/' + next.required_invites + '</b></div><div class="referral-user-bar"><i style="width:' + progress + '%"></i></div><small>' + text("再邀请 ", "Invite ") + Math.max(0, next.required_invites-count) + text(" 位完成首购的好友即可获得奖励", " more friends who complete their first purchase") + '</small></div>' : '<div class="referral-user-next">' + text("你已完成全部邀请里程碑", "You have completed every referral milestone") + '</div>') + '</div></div></div>';
            var target = anchor.closest(".row");
            if (target && target.parentNode) target.parentNode.insertBefore(card, target);
        }).catch(function () {}).finally(function () { loading = false; });
    }
    function start(){load();window.addEventListener("hashchange",function(){setTimeout(load,300);});new MutationObserver(function(){requestAnimationFrame(load);}).observe(document.getElementById("root")||document.body,{childList:true,subtree:true});}
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
