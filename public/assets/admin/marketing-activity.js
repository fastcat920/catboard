(function () {
    "use strict";
    var root,
        filters = { type: "", status: "", keyword: "" };
    function esc(v) {
        var d = document.createElement("div");
        d.textContent = v == null ? "" : v;
        return d.innerHTML;
    }
    function money(v) {
        return (Number(v || 0) / 100).toFixed(2);
    }
    function dt(v) {
        if (!v) return "-";
        return new Date(Number(v) * 1000).toLocaleString("zh-CN", {
            hour12: false,
        });
    }
    function inputDt(v) {
        if (!v) return "";
        var d = new Date(Number(v) * 1000),
            p = function (n) {
                return String(n).padStart(2, "0");
            };
        return (
            d.getFullYear() +
            "-" +
            p(d.getMonth() + 1) +
            "-" +
            p(d.getDate()) +
            "T" +
            p(d.getHours()) +
            ":" +
            p(d.getMinutes())
        );
    }
    function api(path, options) {
        options = options || {};
        var h = {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            a = localStorage.getItem("authorization");
        if (a) h.authorization = a;
        return fetch(
            "/api/v1/" + window.settings.secure_path + "/marketing" + path,
            Object.assign({ credentials: "include", headers: h }, options)
        ).then(function (r) {
            return r.json().then(function (p) {
                if (!r.ok)
                    throw new Error(
                        p.message ||
                            (p.errors && p.errors[Object.keys(p.errors)[0]]) ||
                            "请求失败"
                    );
                return p;
            });
        });
    }
    function status(v) {
        return (
            {
                active: "进行中",
                scheduled: "待开始",
                ended: "已结束",
                disabled: "已停用",
            }[v] || v
        );
    }
    function type(v) {
        return (
            { flash_sale: "限时特价", coupon: "优惠券", newcomer: "新人奖励" }[
                v
            ] || v
        );
    }
    function isMarketingRoute() {
        return (
            location.hash === "#/marketing" ||
            location.pathname === "/marketing"
        );
    }
    function open() {
        closeOthers();
        if (!root || !root.isConnected) {
            root = document.createElement("div");
            root.className = "marketing-admin";
            (
                document.getElementById("page-container") || document.body
            ).appendChild(root);
        }
        root.hidden = false;
        document
            .querySelectorAll(".marketing-admin-menu-link")
            .forEach(function (x) {
                x.classList.add("active");
            });
        render();
    }
    function close() {
        if (root) root.hidden = true;
        document
            .querySelectorAll(".marketing-admin-menu-link")
            .forEach(function (x) {
                x.classList.remove("active");
            });
    }
    function closeOthers() {
        document
            .querySelectorAll(".referral-admin,.coupon-center-admin")
            .forEach(function (x) {
                x.hidden = true;
            });
    }
    function render() {
        root.innerHTML =
            '<div class="p-0 p-lg-4"><div class="block mb-0"><div class="block-header block-header-default"><div><h3 class="block-title">营销活动</h3><small class="text-muted">统一查看新人奖励、优惠券与限时特价</small></div><button class="btn btn-primary" data-add>新建限时特价</button></div><div class="block-content"><div class="marketing-filters"><input class="form-control" data-keyword placeholder="搜索活动名称"><select class="form-control" data-type><option value="">全部类型</option><option value="flash_sale">限时特价</option><option value="newcomer">新人奖励</option><option value="coupon">优惠券</option></select><select class="form-control" data-status><option value="">全部状态</option><option value="active">进行中</option><option value="scheduled">待开始</option><option value="ended">已结束</option><option value="disabled">已停用</option></select><button class="btn btn-light" data-search>搜索</button></div><div data-content>加载中…</div></div></div></div>';
        root.querySelector("[data-add]").onclick = function () {
            loadEditor();
        };
        root.querySelector("[data-keyword]").value = filters.keyword;
        root.querySelector("[data-type]").value = filters.type;
        root.querySelector("[data-status]").value = filters.status;
        root.querySelector("[data-search]").onclick = function () {
            filters.keyword = root.querySelector("[data-keyword]").value.trim();
            filters.type = root.querySelector("[data-type]").value;
            filters.status = root.querySelector("[data-status]").value;
            load();
        };
        load();
    }
    function load() {
        var q = Object.keys(filters)
            .filter(function (k) {
                return filters[k];
            })
            .map(function (k) {
                return k + "=" + encodeURIComponent(filters[k]);
            })
            .join("&");
        api("/activities" + (q ? "?" + q : ""))
            .then(function (p) {
                var s = p.summary,
                    rows = p.data;
                root.querySelector("[data-content]").innerHTML =
                    '<div class="marketing-stats"><div><small>全部活动</small><strong>' +
                    s.total +
                    "</strong></div><div><small>进行中</small><strong>" +
                    s.active +
                    "</strong></div><div><small>待开始</small><strong>" +
                    s.scheduled +
                    "</strong></div><div><small>已结束</small><strong>" +
                    s.ended +
                    '</strong></div></div><div class="table-responsive"><table class="table table-hover table-vcenter"><thead><tr><th>活动名称</th><th>类型</th><th>活动时间</th><th>适用范围</th><th>参与/使用</th><th>收入</th><th>优惠成本</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
                    (rows.length
                        ? rows
                              .map(function (x) {
                                  return (
                                      "<tr><td><b>" +
                                      esc(x.name) +
                                      "</b><small>" +
                                      esc(x.name_en || "") +
                                      "</small></td><td>" +
                                      type(x.type) +
                                      "</td><td>" +
                                      dt(x.starts_at) +
                                      "<br>" +
                                      dt(x.ends_at) +
                                      "</td><td>" +
                                      esc(
                                          {
                                              all: "全部用户",
                                              new: "新用户",
                                              existing: "老用户",
                                          }[x.scope] || x.scope
                                      ) +
                                      "</td><td>" +
                                      x.orders +
                                      "</td><td>¥" +
                                      money(x.revenue) +
                                      "</td><td>¥" +
                                      money(x.discount_total) +
                                      '</td><td><span class="marketing-status ' +
                                      x.status +
                                      '">' +
                                      status(x.status) +
                                      "</span></td><td>" +
                                      (x.type === "flash_sale"
                                          ? '<button class="btn btn-sm btn-light" data-edit="' +
                                            x.source_id +
                                            '">编辑</button>'
                                          : '<button class="btn btn-sm btn-light" data-open="' +
                                            x.type +
                                            '">进入管理</button>') +
                                      "</td></tr>"
                                  );
                              })
                              .join("")
                        : '<tr><td colspan="9" class="text-center text-muted p-4">暂无活动</td></tr>') +
                    "</tbody></table></div>";
                root.querySelectorAll("[data-edit]").forEach(function (b) {
                    b.onclick = function () {
                        loadEditor(Number(b.dataset.edit));
                    };
                });
                root.querySelectorAll("[data-open]").forEach(function (b) {
                    b.onclick = function () {
                        var selector =
                            b.dataset.open === "coupon"
                                ? ".nav-main-link-name"
                                : ".referral-admin-menu-link";
                        if (b.dataset.open === "coupon") {
                            var n = Array.prototype.find.call(
                                document.querySelectorAll(selector),
                                function (x) {
                                    return (
                                        x.textContent.trim() === "优惠券管理"
                                    );
                                }
                            );
                            if (n) n.closest("a").click();
                        } else {
                            var a = document.querySelector(selector);
                            if (a) a.click();
                        }
                        close();
                    };
                });
            })
            .catch(function (e) {
                root.querySelector("[data-content]").innerHTML =
                    '<div class="alert alert-danger">' +
                    esc(e.message) +
                    "</div>";
            });
    }
    function loadEditor(id) {
        api("/flash-sales")
            .then(function (p) {
                var row = id
                        ? p.data.find(function (x) {
                              return Number(x.id) === id;
                          })
                        : {},
                    modal = document.createElement("div");
                row = row || {};
                var periods = [
                    ["month_price", "月付"],
                    ["quarter_price", "季付"],
                    ["half_year_price", "半年付"],
                    ["year_price", "年付"],
                    ["two_year_price", "两年付"],
                    ["three_year_price", "三年付"],
                    ["onetime_price", "一次性"],
                ];
                modal.className = "marketing-modal";
                modal.innerHTML =
                    '<div class="marketing-dialog"><div class="marketing-head"><h3>' +
                    (id ? "编辑" : "新建") +
                    '限时特价</h3><button type="button" data-close>×</button></div><form><div class="marketing-body"><div class="row"><label class="col-md-6">中文名称<input class="form-control" name="name" required value="' +
                    esc(row.name || "") +
                    '"></label><label class="col-md-6">英文名称<input class="form-control" name="name_en" value="' +
                    esc(row.name_en || "") +
                    '"></label></div><div class="row"><label class="col-md-6">中文说明<textarea class="form-control" name="description">' +
                    esc(row.description || "") +
                    '</textarea></label><label class="col-md-6">英文说明<textarea class="form-control" name="description_en">' +
                    esc(row.description_en || "") +
                    '</textarea></label></div><div class="row"><label class="col-md-6">开始时间<input class="form-control" type="datetime-local" name="starts_at" required value="' +
                    inputDt(row.starts_at) +
                    '"></label><label class="col-md-6">结束时间<input class="form-control" type="datetime-local" name="ends_at" required value="' +
                    inputDt(row.ends_at) +
                    '"></label></div><div class="row"><label class="col-md-4">参与用户<select class="form-control" name="audience"><option value="all">全部用户</option><option value="new">仅新购用户</option><option value="existing">仅已有用户</option></select></label><label class="col-md-4">优惠方式<select class="form-control" name="discount_type"><option value="fixed_price">固定活动价</option><option value="percent_off">优惠百分比</option><option value="amount_off">立减金额</option></select></label><label class="col-md-4">优惠值<input class="form-control" type="number" min="0.01" step="0.01" name="discount_value" value="' +
                    (row.discount_type === "percent_off"
                        ? row.discount_value || 10
                        : money(row.discount_value || 0)) +
                    '"></label></div><div class="row"><label class="col-md-4">最低订单金额（元）<input class="form-control" type="number" min="0" step="0.01" name="minimum_amount" value="' +
                    money(row.minimum_amount || 0) +
                    '"></label><label class="col-md-4">每用户限购次数<input class="form-control" type="number" min="1" name="per_user_limit" value="' +
                    (row.per_user_limit || "") +
                    '"></label><label class="col-md-4">活动总名额<input class="form-control" type="number" min="1" name="total_limit" value="' +
                    (row.total_limit || "") +
                    '"></label></div><div class="row"><label class="col-md-3">优先级<input class="form-control" type="number" min="0" name="priority" value="' +
                    (row.priority || 0) +
                    '"></label><label class="col-md-3 check"><input type="checkbox" name="allow_coupon" ' +
                    (row.allow_coupon !== false && row.allow_coupon !== 0
                        ? "checked"
                        : "") +
                    '> 可叠加优惠券</label><label class="col-md-3 check"><input type="checkbox" name="allow_member_discount" ' +
                    (row.allow_member_discount !== false &&
                    row.allow_member_discount !== 0
                        ? "checked"
                        : "") +
                    '> 可叠加会员等级折扣</label><label class="col-md-3 check"><input type="checkbox" name="enabled" ' +
                    (row.enabled !== false && row.enabled !== 0
                        ? "checked"
                        : "") +
                    '> 启用活动</label></div><div class="form-group"><b>指定套餐</b><small>不选择代表全部套餐</small><div>' +
                    p.plans
                        .map(function (x) {
                            return (
                                '<label class="choice"><input type="checkbox" name="plan_ids" value="' +
                                x.id +
                                '" ' +
                                ((row.plan_ids || [])
                                    .map(String)
                                    .indexOf(String(x.id)) >= 0
                                    ? "checked"
                                    : "") +
                                "> " +
                                esc(x.name) +
                                "</label>"
                            );
                        })
                        .join("") +
                    '</div></div><div class="form-group"><b>购买周期</b><small>不选择代表全部周期</small><div>' +
                    periods
                        .map(function (x) {
                            return (
                                '<label class="choice"><input type="checkbox" name="periods" value="' +
                                x[0] +
                                '" ' +
                                ((row.periods || []).indexOf(x[0]) >= 0
                                    ? "checked"
                                    : "") +
                                "> " +
                                x[1] +
                                "</label>"
                            );
                        })
                        .join("") +
                    '</div></div></div><div class="marketing-foot">' +
                    (id
                        ? '<button type="button" class="btn btn-light text-danger" data-drop>删除</button>'
                        : "") +
                    '<button type="button" class="btn btn-light" data-close>取消</button><button type="submit" class="btn btn-primary">保存</button></div></form></div>';
                document.body.appendChild(modal);
                modal.querySelector("[name=audience]").value =
                    row.audience || "all";
                modal.querySelector("[name=discount_type]").value =
                    row.discount_type || "fixed_price";
                modal.querySelectorAll("[data-close]").forEach(function (x) {
                    x.onclick = function () {
                        modal.remove();
                    };
                });
                var drop = modal.querySelector("[data-drop]");
                if (drop)
                    drop.onclick = function () {
                        if (confirm("确认删除该活动？"))
                            api("/flash-sale/drop", {
                                method: "POST",
                                body: JSON.stringify({ id: id }),
                            })
                                .then(function () {
                                    modal.remove();
                                    load();
                                })
                                .catch(function (e) {
                                    alert(e.message);
                                });
                    };
                modal.querySelector("form").onsubmit = function (e) {
                    e.preventDefault();
                    var f = e.target,
                        t = f.discount_type.value,
                        v =
                            t === "percent_off"
                                ? Number(f.discount_value.value)
                                : Math.round(
                                      Number(f.discount_value.value) * 100
                                  ),
                        data = {
                            id: id || undefined,
                            name: f.name.value.trim(),
                            name_en: f.name_en.value.trim(),
                            description: f.description.value.trim(),
                            description_en: f.description_en.value.trim(),
                            starts_at: Math.floor(
                                new Date(f.starts_at.value).getTime() / 1000
                            ),
                            ends_at: Math.floor(
                                new Date(f.ends_at.value).getTime() / 1000
                            ),
                            audience: f.audience.value,
                            discount_type: t,
                            discount_value: v,
                            minimum_amount: Math.round(
                                Number(f.minimum_amount.value || 0) * 100
                            ),
                            per_user_limit: f.per_user_limit.value
                                ? Number(f.per_user_limit.value)
                                : null,
                            total_limit: f.total_limit.value
                                ? Number(f.total_limit.value)
                                : null,
                            priority: Number(f.priority.value || 0),
                            allow_coupon: f.allow_coupon.checked ? 1 : 0,
                            allow_member_discount: f.allow_member_discount
                                .checked
                                ? 1
                                : 0,
                            enabled: f.enabled.checked ? 1 : 0,
                            plan_ids: Array.from(
                                f.querySelectorAll("[name=plan_ids]:checked")
                            ).map(function (x) {
                                return Number(x.value);
                            }),
                            periods: Array.from(
                                f.querySelectorAll("[name=periods]:checked")
                            ).map(function (x) {
                                return x.value;
                            }),
                        };
                    var submit = f.querySelector("[type=submit]");
                    submit.disabled = true;
                    api("/flash-sale/save", {
                        method: "POST",
                        body: JSON.stringify(data),
                    })
                        .then(function () {
                            modal.remove();
                            load();
                        })
                        .catch(function (e) {
                            submit.disabled = false;
                            alert(e.message);
                        });
                };
            })
            .catch(function (e) {
                alert(e.message);
            });
    }
    function mount() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return;
        var invite = nav.querySelector(".referral-admin-menu-item"),
            item = nav.querySelector(".marketing-admin-menu-item");
        if (!item) {
            item = document.createElement("li");
            item.className = "nav-main-item marketing-admin-menu-item";
            item.innerHTML =
                '<a class="nav-main-link marketing-admin-menu-link" href="javascript:void(0)"><i class="nav-main-link-icon si si-rocket"></i><span class="nav-main-link-name">营销活动</span></a>';
            item.querySelector("a").onclick = function (e) {
                e.preventDefault();
                if (!isMarketingRoute() && window.g_history)
                    window.g_history.push("/marketing");
                setTimeout(open, 0);
            };
        }
        if (invite && item.nextElementSibling !== invite)
            nav.insertBefore(item, invite);
        else if (!invite && !item.isConnected) nav.appendChild(item);
    }
    function start() {
        mount();
        if (isMarketingRoute()) setTimeout(open, 0);
        if (window.g_history)
            window.g_history.listen(function (location) {
                if (location.pathname === "/marketing") setTimeout(open, 0);
                else close();
            });
        document.addEventListener("click", function (e) {
            var a = e.target.closest && e.target.closest(".nav-main-link");
            if (a && !a.classList.contains("marketing-admin-menu-link"))
                close();
        });
        new MutationObserver(function () {
            requestAnimationFrame(mount);
        }).observe(document.getElementById("root") || document.body, {
            childList: true,
            subtree: true,
        });
    }
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", start);
    else start();
})();
