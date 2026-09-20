(function () {
    "use strict";
    var root,
        tab = "overview",
        cache = {},
        taskTimer;
    function api(path, opt) {
        opt = opt || {};
        var h = {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            a = localStorage.getItem("authorization");
        if (a) h.authorization = a;
        return fetch(
            "/api/v1/" + window.settings.secure_path + "/coupon" + path,
            Object.assign({ credentials: "include", headers: h }, opt),
        ).then(function (r) {
            return r.json().then(function (p) {
                if (!r.ok)
                    throw new Error(
                        path + "：" + (p.message || "请求失败（HTTP " + r.status + "）"),
                    );
                return p;
            }).catch(function (error) {
                if (error.message && error.message.indexOf(path + "：") === 0)
                    throw error;
                throw new Error(path + "：服务器返回了无法解析的响应（HTTP " + r.status + "）");
            });
        });
    }
    function esc(v) {
        var d = document.createElement("div");
        d.textContent = v == null ? "" : v;
        return d.innerHTML;
    }
    function money(v) {
        return (Number(v || 0) / 100).toFixed(2);
    }
    function dt(v) {
        return v
            ? new Date(Number(v) * 1000).toLocaleString("zh-CN", {
                  hour12: false,
              })
            : "-";
    }
    function sourceLabel(source) {
        return (
            {
                manual: "后台手动发放 / Manual issuance",
                newcomer: "新人邀请奖励 / Newcomer referral reward",
                referral_newcomer:
                    "新人邀请奖励 / Newcomer referral reward",
                distribution_task:
                    "平台批量发放 / Platform bulk distribution",
            }[source] || source
        );
    }
    function notificationLabel(status) {
        return (
            {
                pending: "等待投递",
                sending: "发送中",
                sent: "已发送",
                failed: "发送失败",
                disabled: "未启用",
            }[status] || status || "-"
        );
    }
    function field(n, l, v, t) {
        return (
            '<div class="form-group"><label>' +
            l +
            '</label><input class="form-control" name="' +
            n +
            '" type="' +
            (t || "number") +
            '" value="' +
            esc(v == null ? "" : v) +
            '"></div>'
        );
    }
    function table(h, r) {
        return (
            '<div class="table-responsive"><table class="table table-hover table-vcenter"><thead><tr>' +
            h
                .map(function (x) {
                    return "<th>" + x + "</th>";
                })
                .join("") +
            "</tr></thead><tbody>" +
            (r.length
                ? r
                      .map(function (x) {
                          return (
                              "<tr>" +
                              x
                                  .map(function (y) {
                                      return "<td>" + esc(y) + "</td>";
                                  })
                                  .join("") +
                              "</tr>"
                          );
                      })
                      .join("")
                : '<tr><td colspan="' +
                  h.length +
                  '" class="text-center p-4">暂无数据</td></tr>') +
            "</tbody></table></div>"
        );
    }
    function open() {
        if (!root || !root.isConnected) {
            root = document.createElement("div");
            root.className = "coupon-center-admin";
            // page-container is owned by React and may be reconciled when the
            // legacy coupon page finishes loading. Mount beside it so React
            // cannot remove the coupon center after it has opened.
            document.body.appendChild(root);
        }
        root.hidden = false;
        render();
        load();
    }
    function close() {
        if (taskTimer) {
            clearTimeout(taskTimer);
            taskTimer = null;
        }
        if (root) root.hidden = true;
    }
    function isCouponRoute() {
        return !!(
            window.g_history &&
            window.g_history.location &&
            window.g_history.location.pathname === "/coupon"
        );
    }
    function render() {
        root.innerHTML =
            '<div class="p-0 p-lg-4"><div class="block"><nav class="nav nav-tabs nav-tabs-block">' +
            [
                ["overview", "数据概览"],
                ["templates", "优惠券模板"],
                ["distribution", "发放任务"],
                ["wallet", "用户优惠券"],
            ]
                .map(function (x) {
                    return (
                        '<button class="nav-link ' +
                        (tab === x[0] ? "active" : "") +
                        '" data-tab="' +
                        x[0] +
                        '">' +
                        x[1] +
                        "</button>"
                    );
                })
                .join("") +
            '</nav><main data-content class="p-3">加载中…</main></div></div>';
        root.querySelectorAll("[data-tab]").forEach(function (b) {
            b.onclick = function () {
                tab = b.dataset.tab;
                render();
                load();
            };
        });
    }
    function content(h) {
        root.querySelector("[data-content]").innerHTML = h;
    }
    function fail(e) {
        content('<div class="alert alert-danger">' + esc(e.message) + "</div>");
    }
    function load() {
        (
            ({
                overview: overview,
                templates: templates,
                distribution: distribution,
                wallet: wallet,
            })[tab] || overview
        )();
    }
    function overview() {
        api("/dashboard")
            .then(function (p) {
                var d = p.data;
                content(
                    '<div class="coupon-stat-grid">' +
                        [
                            ["模板", d.templates],
                            ["累计发放", d.issued],
                            ["当前可用", d.available],
                            ["已使用", d.used],
                            ["已过期", d.expired],
                            ["优惠金额", "¥" + money(d.discount_total)],
                            ["优惠订单收入", "¥" + money(d.revenue)],
                        ]
                            .map(function (x) {
                                return (
                                    '<div class="block block-rounded"><div class="block-content"><small>' +
                                    x[0] +
                                    "</small><strong>" +
                                    x[1] +
                                    "</strong></div></div>"
                                );
                            })
                            .join("") +
                        "</div>",
                );
            })
            .catch(fail);
    }
    function templates() {
        api("/templates")
            .then(function (p) {
                cache.templates = p.data;
                cache.plans = p.plans;
                content(
                    '<div class="block-header"><h3 class="block-title">优惠券模板</h3><button class="btn btn-primary btn-sm" data-add>新增模板</button></div>' +
                        table(
                            [
                                "名称",
                                "优惠",
                                "门槛",
                                "有效期",
                                "已发放/已使用",
                                "到账邮件",
                                "状态",
                                "操作",
                            ],
                            p.data.map(function (x) {
                                return [
                                    x.name,
                                    x.discount_type === "fixed"
                                        ? "¥" + money(x.discount_value)
                                        : x.discount_value + "%",
                                    "¥" + money(x.minimum_amount),
                                    x.valid_days
                                        ? x.valid_days + " 天"
                                        : dt(x.ends_at),
                                    x.issued_count + " / " + x.used_count,
                                    x.email_notify_enabled ? "发送" : "不发送",
                                    x.enabled ? "启用" : "停用",
                                    "",
                                ];
                            }),
                        ),
                );
                root.querySelector("[data-add]").onclick = function () {
                    editTemplate({}, p.plans);
                };
                root.querySelectorAll("tbody tr").forEach(function (tr, i) {
                    var x = p.data[i];
                    if (!x) return;
                    tr.lastElementChild.innerHTML =
                        '<button class="btn btn-sm btn-light" data-edit>编辑</button><button class="btn btn-sm btn-light" data-copy>复制</button><button class="btn btn-sm btn-light text-danger" data-drop>删除</button>';
                    tr.querySelector("[data-edit]").onclick = function () {
                        editTemplate(x, p.plans);
                    };
                    tr.querySelector("[data-copy]").onclick = function () {
                        api("/template/copy", {
                            method: "POST",
                            body: JSON.stringify({ id: x.id }),
                        })
                            .then(templates)
                            .catch(function (e) {
                                alert(e.message);
                            });
                    };
                    tr.querySelector("[data-drop]").onclick = function () {
                        if (confirm("确认删除？"))
                            api("/template/drop", {
                                method: "POST",
                                body: JSON.stringify({ id: x.id }),
                            })
                                .then(templates)
                                .catch(function (e) {
                                    alert(e.message);
                                });
                    };
                });
            })
            .catch(fail);
    }
    function editTemplate(x, plans) {
        var m = document.createElement("div");
        m.className = "coupon-modal";
        m.innerHTML =
            '<div class="coupon-dialog"><div class="coupon-head"><h3>' +
            (x.id ? "编辑" : "新增") +
            '优惠券模板</h3><button data-close>×</button></div><form><div class="coupon-body"><div class="row"><div class="col-md-6">' +
            field("name", "中文名称", x.name || "", "text") +
            '</div><div class="col-md-6">' +
            field("name_en", "英文名称", x.name_en || "", "text") +
            '</div></div><div class="row"><div class="col-md-6"><div class="form-group"><label>中文描述</label><textarea class="form-control" name="description" rows="2">' +
            esc(x.description || "") +
            '</textarea></div></div><div class="col-md-6"><div class="form-group"><label>英文描述</label><textarea class="form-control" name="description_en" rows="2">' +
            esc(x.description_en || "") +
            '</textarea></div></div></div><div class="row"><div class="col-md-6"><div class="form-group"><label>优惠类型</label><select class="form-control" name="discount_type"><option value="fixed">固定金额</option><option value="percent">百分比</option></select></div></div><div class="col-md-6">' +
            field(
                "discount_value",
                "优惠值（金额填分，比例填整数）",
                x.discount_value || "",
            ) +
            '</div></div><div class="row"><div class="col-md-6">' +
            field(
                "minimum_amount",
                "最低订单金额（分）",
                x.minimum_amount || 0,
            ) +
            '</div><div class="col-md-6">' +
            field(
                "maximum_discount",
                "最高优惠金额（分）",
                x.maximum_discount || "",
            ) +
            '</div></div><div class="form-group"><label>适用套餐（不选为全部）</label>' +
            plans
                .map(function (p) {
                    return (
                        '<label class="mr-3"><input type="checkbox" name="plan_ids" value="' +
                        p.id +
                        '" ' +
                        ((x.plan_ids || []).map(String).indexOf(String(p.id)) >=
                        0
                            ? "checked"
                            : "") +
                        "> " +
                        esc(p.name) +
                        "</label>"
                    );
                })
                .join("") +
            '</div><div class="form-group"><label>适用周期</label>' +
            [
                "month_price",
                "quarter_price",
                "half_year_price",
                "year_price",
                "two_year_price",
                "three_year_price",
                "onetime_price",
                "reset_price",
            ]
                .map(function (v) {
                    return (
                        '<label class="mr-3"><input type="checkbox" name="periods" value="' +
                        v +
                        '" ' +
                        ((x.periods || []).indexOf(v) >= 0 ? "checked" : "") +
                        "> " +
                        v +
                        "</label>"
                    );
                })
                .join("") +
            '</div><div class="row"><div class="col-md-4">' +
            field("per_user_limit", "每人领取上限", x.per_user_limit || 1) +
            '</div><div class="col-md-4">' +
            field("total_limit", "总发放量", x.total_limit || "") +
            '</div><div class="col-md-4">' +
            field("daily_limit", "每日发放量", x.daily_limit || "") +
            '</div></div><div class="row"><div class="col-md-4">' +
            field("valid_days", "领取后有效天数", x.valid_days || "") +
            '</div><div class="col-md-4">' +
            field("starts_at", "固定开始时间戳", x.starts_at || "") +
            '</div><div class="col-md-4">' +
            field("ends_at", "固定结束时间戳", x.ends_at || "") +
            "</div></div>" +
            [
                ["first_order_only", "仅限首单"],
                ["new_user_only", "仅限新用户"],
                ["allow_renewal", "允许续费"],
                ["stackable", "允许叠加会员折扣"],
                ["email_notify_enabled", "优惠券到账后发送邮件"],
                ["enabled", "启用"],
            ]
                .map(function (v) {
                    return (
                        '<label class="mr-4"><input type="checkbox" name="' +
                        v[0] +
                        '" ' +
                        (x[v[0]] ||
                        (!x.id &&
                            ["allow_renewal", "email_notify_enabled", "enabled"].indexOf(v[0]) >= 0)
                            ? "checked"
                            : "") +
                        "> " +
                        v[1] +
                        "</label>"
                    );
                })
                .join("") +
            '</div><div class="coupon-foot"><button type="button" class="btn btn-light" data-close>取消</button><button class="btn btn-primary">保存</button></div></form></div>';
        root.appendChild(m);
        m.querySelector("[name=discount_type]").value =
            x.discount_type || "fixed";
        m.querySelectorAll("[data-close]").forEach(function (b) {
            b.onclick = function () {
                m.remove();
            };
        });
        m.querySelector("form").onsubmit = function (e) {
            e.preventDefault();
            var f = e.target,
                n = function (k) {
                    return f[k].value === "" ? null : Number(f[k].value);
                },
                data = {
                    name: f.name.value,
                    name_en: f.name_en.value,
                    description: f.description.value || null,
                    description_en: f.description_en.value || null,
                    discount_type: f.discount_type.value,
                    discount_value: Number(f.discount_value.value),
                    minimum_amount: Number(f.minimum_amount.value || 0),
                    maximum_discount: n("maximum_discount"),
                    plan_ids: Array.from(
                        f.querySelectorAll("[name=plan_ids]:checked"),
                    ).map(function (i) {
                        return Number(i.value);
                    }),
                    periods: Array.from(
                        f.querySelectorAll("[name=periods]:checked"),
                    ).map(function (i) {
                        return i.value;
                    }),
                    first_order_only: f.first_order_only.checked ? 1 : 0,
                    new_user_only: f.new_user_only.checked ? 1 : 0,
                    allow_renewal: f.allow_renewal.checked ? 1 : 0,
                    stackable: f.stackable.checked ? 1 : 0,
                    email_notify_enabled: f.email_notify_enabled.checked ? 1 : 0,
                    per_user_limit: Number(f.per_user_limit.value || 1),
                    total_limit: n("total_limit"),
                    daily_limit: n("daily_limit"),
                    valid_days: n("valid_days"),
                    starts_at: n("starts_at"),
                    ends_at: n("ends_at"),
                    enabled: f.enabled.checked ? 1 : 0,
                };
            if (x.id) data.id = x.id;
            api("/template/save", {
                method: "POST",
                body: JSON.stringify(data),
            })
                .then(function () {
                    m.remove();
                    templates();
                })
                .catch(function (er) {
                    alert(er.message);
                });
        };
    }
    function taskTableHtml(rows) {
        var statusLabels = {
            pending: "等待队列",
            running: "执行中",
            completed: "已完成",
            partial: "部分失败",
            failed: "执行失败",
            cancelled: "已取消",
        };
        return (
            '<div data-task-list>' +
            table(
                [
                    "任务",
                    "状态",
                    "进度",
                    "成功/跳过/失败",
                    "批次",
                    "最后更新",
                    "操作",
                ],
                rows.map(function (x) {
                    return [
                        x.name,
                        (statusLabels[x.status] || x.status) +
                            (x.worker_warning ? "（队列可能未运行）" : ""),
                        (x.processed_count || 0) +
                            " / " +
                            x.estimated_count +
                            "（" +
                            Number(x.progress || 0).toFixed(1) +
                            "%）",
                        x.success_count +
                            " / " +
                            x.skipped_count +
                            " / " +
                            x.failed_count,
                        (x.completed_batches || 0) +
                            " / " +
                            (x.total_batches || 0),
                        dt(x.heartbeat_at || x.updated_at),
                        "",
                    ];
                }),
            ) +
            "</div>"
        );
    }
    function bindTaskActions(rows) {
        root.querySelectorAll("[data-task-list] tbody tr").forEach(function (tr, i) {
            var task = rows[i];
            if (!task) return;
            var actions = [];
            if (task.status === "pending" || task.status === "running")
                actions.push(
                    '<button class="btn btn-sm btn-light text-danger" data-cancel>取消</button>',
                );
            if (
                task.status === "failed" ||
                (task.failed_count > 0 && task.failed_user_ids)
            )
                actions.push(
                    '<button class="btn btn-sm btn-light" data-retry>' +
                        (task.status === "failed" ? "继续任务" : "重试失败用户") +
                        "</button>",
                );
            if (task.last_error)
                actions.push(
                    '<button class="btn btn-sm btn-light" data-error>错误详情</button>',
                );
            tr.lastElementChild.innerHTML = actions.join(" ") || "-";
            var cancel = tr.querySelector("[data-cancel]");
            if (cancel)
                cancel.onclick = function () {
                    if (!confirm("确认取消该发放任务？")) return;
                    api("/distribution/cancel", {
                        method: "POST",
                        body: JSON.stringify({ id: task.id }),
                    }).then(refreshTasks);
                };
            var retry = tr.querySelector("[data-retry]");
            if (retry)
                retry.onclick = function () {
                    if (!confirm(task.status === "failed" ? "从中断位置继续该任务？" : "仅重新发放本任务中的失败用户？")) return;
                    api("/distribution/retry", {
                        method: "POST",
                        body: JSON.stringify({ id: task.id }),
                    })
                        .then(refreshTasks)
                        .catch(function (e) {
                            alert(e.message);
                        });
                };
            var error = tr.querySelector("[data-error]");
            if (error)
                error.onclick = function () {
                    alert(task.last_error);
                };
        });
    }
    function refreshTasks() {
        if (tab !== "distribution") return;
        if (taskTimer) clearTimeout(taskTimer);
        api("/distribution/tasks")
            .then(function (result) {
                var host = root.querySelector("[data-task-list]");
                if (!host) return;
                var replacement = document.createElement("div");
                replacement.innerHTML = taskTableHtml(result.data);
                host.replaceWith(replacement.firstElementChild);
                bindTaskActions(result.data);
                if (
                    result.data.some(function (x) {
                        return x.status === "pending" || x.status === "running";
                    })
                )
                    taskTimer = setTimeout(refreshTasks, 3000);
            })
            .catch(function () {
                taskTimer = setTimeout(refreshTasks, 5000);
            });
    }
    function distribution() {
        if (taskTimer) {
            clearTimeout(taskTimer);
            taskTimer = null;
        }
        Promise.all([api("/templates"), api("/distribution/tasks")])
            .then(function (all) {
                cache.templates = all[0].data;
                content(
                    '<div class="row"><div class="col-lg-5"><div class="block"><div class="block-header"><h3 class="block-title">创建发放任务</h3></div><div class="block-content"><form data-task><div class="form-group"><label>模板</label><select class="form-control" name="template_id">' +
                        cache.templates
                            .map(function (x) {
                                return (
                                    '<option value="' +
                                    x.id +
                                    '">' +
                                    esc(x.name) +
                                    "</option>"
                                );
                            })
                            .join("") +
                        "</select></div>" +
                        field("name", "任务名称", "", "text") +
                        field(
                            "user_ids",
                            "指定用户 ID（逗号分隔）",
                            "",
                            "text",
                        ) +
                        field("emails", "指定邮箱（逗号分隔）", "", "text") +
                        field(
                            "plan_ids",
                            "指定套餐 ID（逗号分隔）",
                            "",
                            "text",
                        ) +
                        '<div class="form-group"><label>订阅状态</label><select class="form-control" name="subscription_status"><option value="">不限</option><option value="active">有效</option><option value="expired">已过期</option></select></div><label><input type="checkbox" name="never_purchased"> 从未购买</label><div class="mt-3"><button type="button" class="btn btn-light" data-estimate>预估人数</button> <button class="btn btn-primary">创建并执行</button></div><div data-estimate-result class="mt-2"></div></form></div></div></div><div class="col-lg-7">' +
                        taskTableHtml(all[1].data) +
                        "</div></div>",
                );
                bindTaskActions(all[1].data);
                var form = root.querySelector("[data-task]"),
                    filters = function () {
                        var split = function (v) {
                            return v
                                .split(",")
                                .map(function (x) {
                                    return x.trim();
                                })
                                .filter(Boolean);
                        };
                        return {
                            user_ids: split(form.user_ids.value),
                            emails: split(form.emails.value),
                            plan_ids: split(form.plan_ids.value),
                            subscription_status: form.subscription_status.value,
                            never_purchased: form.never_purchased.checked,
                        };
                    };
                root.querySelector("[data-estimate]").onclick = function () {
                    api("/distribution/estimate", {
                        method: "POST",
                        body: JSON.stringify({ filters: filters() }),
                    }).then(function (p) {
                        root.querySelector(
                            "[data-estimate-result]",
                        ).textContent = "预计发放 " + p.data.count + " 人";
                    });
                };
                form.onsubmit = function (e) {
                    e.preventDefault();
                    api("/distribution/create", {
                        method: "POST",
                        body: JSON.stringify({
                            template_id: Number(form.template_id.value),
                            name: form.name.value,
                            filters: filters(),
                        }),
                    })
                        .then(distribution)
                        .catch(function (er) {
                            alert(er.message);
                        });
                };
                if (all[1].data.some(function (x) { return x.status === "pending" || x.status === "running"; })) taskTimer = setTimeout(refreshTasks, 3000);
            })
            .catch(fail);
    }
    function wallet() {
        api("/user-coupons?pageSize=100")
            .then(function (p) {
                content(
                    '<div class="block-header"><h3 class="block-title">用户优惠券</h3></div>' +
                        table(
                            [
                                "用户",
                                "优惠券",
                                "来源",
                                "状态",
                                "生效",
                                "过期",
                                "邮件通知",
                                "订单",
                                "操作",
                            ],
                            p.data.map(function (x) {
                                return [
                                    x.user_email,
                                    x.template && x.template.name,
                                    sourceLabel(x.source),
                                    x.status,
                                    dt(x.starts_at),
                                    dt(x.expires_at),
                                    notificationLabel(x.notification_status),
                                    x.order_id || "-",
                                    "",
                                ];
                            }),
                        ),
                );
                root.querySelectorAll("tbody tr").forEach(function (tr, i) {
                    var x = p.data[i];
                    if (!x) return;
                    tr.lastElementChild.innerHTML =
                        '<button class="btn btn-sm btn-light" data-extend>延期</button><button class="btn btn-sm btn-light text-danger" data-revoke>撤销</button>' +
                        (x.notification_status === "failed"
                            ? '<button class="btn btn-sm btn-light" data-retry-mail>重发邮件</button>'
                            : "");
                    tr.querySelector("[data-extend]").onclick = function () {
                        var days = prompt("延长多少天？", "30");
                        if (days)
                            api("/user-coupon/extend", {
                                method: "POST",
                                body: JSON.stringify({
                                    id: x.id,
                                    days: Number(days),
                                }),
                            })
                                .then(wallet)
                                .catch(function (e) {
                                    alert(e.message);
                                });
                    };
                    tr.querySelector("[data-revoke]").onclick = function () {
                        var reason = prompt("撤销原因");
                        if (reason)
                            api("/user-coupon/revoke", {
                                method: "POST",
                                body: JSON.stringify({
                                    id: x.id,
                                    reason: reason,
                                }),
                            })
                                .then(wallet)
                                .catch(function (e) {
                                    alert(e.message);
                                });
                    };
                    var retryMail = tr.querySelector("[data-retry-mail]");
                    if (retryMail)
                        retryMail.onclick = function () {
                            api("/user-coupon/retry-notification", {
                                method: "POST",
                                body: JSON.stringify({ id: x.id }),
                            })
                                .then(wallet)
                                .catch(function (e) {
                                    alert(e.message);
                                });
                        };
                });
            })
            .catch(fail);
    }
    function mount() {
        var nav = document.querySelector("#sidebar ul.nav-main");
        if (!nav) return;
        var name = Array.prototype.find.call(
            nav.querySelectorAll(".nav-main-link-name"),
            function (n) {
                return n.textContent.trim() === "优惠券管理";
            },
        );
        if (!name) return;
        var link = name.closest("a");
        if (link && !link.dataset.couponCenter) {
            link.dataset.couponCenter = "1";
            link.addEventListener(
                "click",
                function (e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (!isCouponRoute() && window.g_history)
                        window.g_history.push("/coupon");
                    setTimeout(open, 0);
                },
                true,
            );
        }
    }
    function start() {
        mount();
        if (isCouponRoute()) setTimeout(open, 0);
        if (window.g_history)
            window.g_history.listen(function (location) {
                if (location.pathname === "/coupon") setTimeout(open, 0);
                else close();
            });
        document.addEventListener("click", function (e) {
            var a = e.target.closest && e.target.closest(".nav-main-link");
            if (a && !a.dataset.couponCenter) close();
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
