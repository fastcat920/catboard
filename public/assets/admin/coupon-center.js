(function () {
    "use strict";
    var root,
        tab = "overview",
        cache = {},
        taskTimer,
        planPickerOutsideHandler;
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
                manual: "后台手动发放",
                newcomer: "新人邀请奖励",
                referral_newcomer: "新人邀请奖励",
                distribution_task: "平台批量发放",
                campaign: "邀请活动奖励",
            }[source] || source
        );
    }
    function couponStatusLabel(status) {
        return (
            {
                pending: "待生效",
                available: "可使用",
                locked: "已锁定",
                used: "已使用",
                expired: "已过期",
                revoked: "已撤销",
            }[status] || status || "-"
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
        clearPlanPickerOutsideHandler();
        if (root) root.hidden = true;
    }
    function clearPlanPickerOutsideHandler() {
        if (!planPickerOutsideHandler) return;
        document.removeEventListener("pointerdown", planPickerOutsideHandler, true);
        planPickerOutsideHandler = null;
    }
    function isCouponRoute() {
        return !!(
            window.g_history &&
            window.g_history.location &&
            window.g_history.location.pathname === "/coupon"
        );
    }
    function render() {
        clearPlanPickerOutsideHandler();
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
        var isPercent = x.discount_type === "percent";
        var discountValue =
            x.discount_value == null || x.discount_value === ""
                ? ""
                : isPercent
                  ? x.discount_value
                  : money(x.discount_value);
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
                isPercent ? "优惠比例（%）" : "优惠金额（元）",
                discountValue,
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
                ["month_price", "月付"],
                ["quarter_price", "季付"],
                ["half_year_price", "半年付"],
                ["year_price", "年付"],
                ["two_year_price", "两年付"],
                ["three_year_price", "三年付"],
                ["onetime_price", "一次性"],
                ["reset_price", "流量重置包"],
            ]
                .map(function (period) {
                    return (
                        '<label class="mr-3"><input type="checkbox" name="periods" value="' +
                        period[0] +
                        '" ' +
                        ((x.periods || []).indexOf(period[0]) >= 0
                            ? "checked"
                            : "") +
                        "> " +
                        period[1] +
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
                            ["email_notify_enabled", "enabled"].indexOf(v[0]) >= 0)
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
        var discountType = m.querySelector("[name=discount_type]");
        var discountInput = m.querySelector("[name=discount_value]");
        var discountLabel = discountInput.closest(".form-group").querySelector("label");
        var syncDiscountField = function (resetValue) {
            var percent = discountType.value === "percent";
            discountLabel.textContent = percent ? "优惠比例（%）" : "优惠金额（元）";
            discountInput.step = percent ? "1" : "0.01";
            discountInput.min = percent ? "1" : "0.01";
            if (percent) discountInput.max = "100";
            else discountInput.removeAttribute("max");
            if (resetValue) discountInput.value = "";
        };
        discountType.onchange = function () { syncDiscountField(true); };
        syncDiscountField(false);
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
                    discount_value:
                        f.discount_type.value === "percent"
                            ? Math.round(Number(f.discount_value.value))
                            : Math.round(Number(f.discount_value.value) * 100),
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
    function openTaskDetail(task) {
        var statusLabels = {
            pending: "等待队列",
            running: "执行中",
            completed: "已完成",
            partial: "部分失败",
            failed: "执行失败",
            cancelled: "已取消",
        };
        var filters = task.filters || {};
        var planNames = (filters.plan_ids || []).map(function (id) {
            var plan = (cache.plans || []).find(function (item) {
                return String(item.id) === String(id);
            });
            return plan ? plan.name : "ID " + id;
        });
        var scope = [];
        if ((filters.user_ids || []).length)
            scope.push("指定用户 " + filters.user_ids.length + " 人");
        if ((filters.emails || []).length)
            scope.push("指定邮箱 " + filters.emails.length + " 个");
        if (planNames.length) scope.push("指定订阅：" + planNames.join("、"));
        if (filters.subscription_status)
            scope.push(
                "订阅状态：" +
                    (filters.subscription_status === "active" ? "有效" : "已过期"),
            );
        if (filters.never_purchased) scope.push("从未购买用户");
        var modal = document.createElement("div");
        modal.className = "coupon-modal";
        modal.innerHTML =
            '<div class="coupon-dialog coupon-task-dialog"><div class="coupon-head"><h3>发放任务详情</h3><button type="button" data-close>×</button></div><div class="coupon-body"><dl class="coupon-task-detail">' +
            "<div><dt>任务名称</dt><dd>" + esc(task.name) + "</dd></div>" +
            "<div><dt>状态</dt><dd>" + esc(statusLabels[task.status] || task.status) + "</dd></div>" +
            "<div><dt>执行进度</dt><dd>" + Number(task.processed_count || 0) + " / " + Number(task.estimated_count || 0) + "</dd></div>" +
            "<div><dt>成功 / 跳过 / 失败</dt><dd>" + Number(task.success_count || 0) + " / " + Number(task.skipped_count || 0) + " / " + Number(task.failed_count || 0) + "</dd></div>" +
            "<div><dt>发放范围</dt><dd>" + esc(scope.join("；") || "全部符合条件的用户") + "</dd></div>" +
            "<div><dt>创建时间</dt><dd>" + esc(dt(task.created_at)) + "</dd></div>" +
            "<div><dt>最后更新</dt><dd>" + esc(dt(task.heartbeat_at || task.updated_at)) + "</dd></div>" +
            (task.last_error ? "<div><dt>错误信息</dt><dd class=\"text-danger\">" + esc(task.last_error) + "</dd></div>" : "") +
            '</dl></div><div class="coupon-foot"><button type="button" class="btn btn-primary" data-close>关闭</button></div></div>';
        root.appendChild(modal);
        var closeModal = function () { modal.remove(); };
        modal.querySelectorAll("[data-close]").forEach(function (button) {
            button.onclick = closeModal;
        });
        modal.onclick = function (event) {
            if (event.target === modal) closeModal();
        };
    }
    function bindTaskActions(rows) {
        root.querySelectorAll("[data-task-list] tbody tr").forEach(function (tr, i) {
            var task = rows[i];
            if (!task) return;
            var actions = [
                '<button class="btn btn-sm btn-light" data-detail>查看</button>',
            ];
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
            tr.querySelector("[data-detail]").onclick = function () {
                openTaskDetail(task);
            };
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
                cache.plans = all[0].plans || [];
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
                        '<div class="form-group"><label>指定订阅</label><details class="coupon-plan-picker"><summary data-plan-summary>不限订阅</summary><div class="coupon-plan-options">' +
                        cache.plans.map(function (plan) {
                            return '<label><input type="checkbox" name="plan_ids" value="' + plan.id + '"> <span>' + esc(plan.name) + '</span></label>';
                        }).join("") +
                        (cache.plans.length ? "" : '<div class="text-muted p-2">暂无可选订阅</div>') +
                        '</div></details><small class="form-text text-muted">可多选；不选择代表不限订阅。</small></div>' +
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
                            plan_ids: Array.from(form.querySelectorAll('[name="plan_ids"]:checked')).map(function (item) { return Number(item.value); }),
                            subscription_status: form.subscription_status.value,
                            never_purchased: form.never_purchased.checked,
                        };
                    };
                var updatePlanSummary = function () {
                    var checked = Array.from(form.querySelectorAll('[name="plan_ids"]:checked'));
                    var summary = form.querySelector('[data-plan-summary]');
                    if (!checked.length) summary.textContent = "不限订阅";
                    else if (checked.length <= 2) summary.textContent = checked.map(function (item) { return item.nextElementSibling.textContent; }).join("、");
                    else summary.textContent = "已选择 " + checked.length + " 个订阅";
                };
                form.querySelectorAll('[name="plan_ids"]').forEach(function (item) { item.onchange = updatePlanSummary; });
                var planPicker = form.querySelector(".coupon-plan-picker");
                clearPlanPickerOutsideHandler();
                planPickerOutsideHandler = function (event) {
                    if (
                        planPicker &&
                        planPicker.open &&
                        !planPicker.contains(event.target)
                    )
                        planPicker.removeAttribute("open");
                };
                document.addEventListener(
                    "pointerdown",
                    planPickerOutsideHandler,
                    true,
                );
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
                                    couponStatusLabel(x.status),
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
                        '<button class="btn btn-sm btn-light" data-extend>延期</button>' +
                        (x.status === "pending" || x.status === "available" ? '<button class="btn btn-sm btn-light text-danger" data-revoke>撤销</button>' : "") +
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
                    var revoke = tr.querySelector("[data-revoke]");
                    if (revoke) revoke.onclick = function () {
                        if (!confirm("确认撤销该用户的优惠券？撤销后将无法继续使用。")) return;
                        api("/user-coupon/revoke", {
                            method: "POST",
                            body: JSON.stringify({ id: x.id }),
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
