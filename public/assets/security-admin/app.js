(function () {
    "use strict";
    var cfg = window.nodeSecurity || {},
        root = document.getElementById("app");
    var state = {
        page: "dashboard",
        data: null,
        error: "",
        loading: false,
        modal: null,
        pageNo: 1,
        filters: { events: {}, users: {}, logs: {} },
        refreshTimer: null,
    };
    var labels = {
        dashboard: "安全总览",
        events: "泄露事件",
        users: "风险用户",
        logs: "访问记录",
        watermarks: "水印实验",
        probes: "探测点",
        alerts: "安全告警",
        settings: "风控设置",
    };
    function esc(v) {
        return String(v == null ? "" : v).replace(/[&<>'"]/g, function (c) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#39;",
                '"': "&quot;",
            }[c];
        });
    }
    function time(v) {
        return v ? new Date(Number(v) * 1000).toLocaleString() : "-";
    }
    function selected(value, expected) {
        return String(value == null ? "" : value) === String(expected)
            ? " selected"
            : "";
    }
    function queryString(values) {
        var params = new URLSearchParams();
        Object.keys(values || {}).forEach(function (key) {
            if (/_text$/.test(key)) return;
            if (values[key] !== "" && values[key] != null)
                params.set(key, values[key]);
        });
        var query = params.toString();
        return query ? "&" + query : "";
    }
    function auth() {
        return localStorage.getItem("authorization") || "";
    }
    function api(path, opts) {
        opts = opts || {};
        var headers = { Accept: "application/json", Authorization: auth() };
        if (opts.body) {
            headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(
            "/api/v1/" + cfg.securePath + "/security/" + path,
            Object.assign({}, opts, { headers: headers }),
        ).then(async function (r) {
            var d;
            try {
                d = await r.json();
            } catch (e) {
                d = { message: r.statusText };
            }
            if (r.status === 403) {
                location.href = cfg.adminUrl;
                throw new Error("管理员登录已过期");
            }
            if (!r.ok)
                throw new Error(
                    d.message || Object.values(d.errors || {})[0] || "请求失败",
                );
            return d.data;
        });
    }
    function badge(text, kind) {
        return (
            '<span class="badge ' + (kind || "") + '">' + esc(text) + "</span>"
        );
    }
    function risk(v) {
        return badge(v, v >= 70 ? "high" : v >= 40 ? "medium" : "ok");
    }
    function nodeStatusLabel(status) {
        return (
            {
                healthy: "正常",
                suspected_blocked: "疑似被封锁",
                suspected_outage: "疑似节点故障",
                carrier_issue: "疑似运营商线路异常",
                insufficient_probes: "探测点不足",
                unknown: "等待判断",
                waiting_first_probe: "等待首次检测",
            }[status] ||
            status ||
            "未知"
        );
    }
    function shell(content) {
        return (
            '<div class="layout"><aside class="side"><div class="brand">节点安全中心<small>泄露追踪 · 水印定位 · 自动风控</small></div><nav class="nav">' +
            Object.keys(labels)
                .map(function (k) {
                    return (
                        '<button data-page="' +
                        k +
                        '" class="' +
                        (state.page === k ? "active" : "") +
                        '">' +
                        labels[k] +
                        "</button>"
                    );
                })
                .join("") +
            '</nav><a class="back" href="' +
            esc(cfg.adminUrl) +
            '">← 返回管理后台</a></aside><main class="main"><header class="top"><div><h1>' +
            labels[state.page] +
            '</h1><div class="muted">所有时间按服务器时间记录，敏感节点地址仅保存加密值</div></div><button class="btn" data-refresh>刷新</button></header>' +
            (state.error
                ? '<div class="error">' + esc(state.error) + "</div>"
                : "") +
            content +
            "</main></div>"
        );
    }
    function render() {
        var content = state.loading
            ? '<div class="panel empty">正在加载…</div>'
            : renderPage();
        root.innerHTML = shell(content) + (state.modal || "");
        bind();
    }
    function renderPage() {
        var d = state.data || {};
        if (state.page === "dashboard") return dashboard(d);
        if (state.page === "events") return events(d);
        if (state.page === "users") return users(d);
        if (state.page === "logs") return logs(d);
        if (state.page === "watermarks") return watermarks(d);
        if (state.page === "probes") return probes(d);
        if (state.page === "alerts") return alerts(d);
        return settings(d);
    }
    function dashboard(d) {
        var s = d.summary || {};
        var cards = [
            ["访问次数", s.requests],
            ["访问用户", s.users],
            ["封锁事件", s.events],
            ["高风险用户", s.high_risk_users],
            ["未读告警", s.unread_alerts],
            ["活动实验", s.active_experiments],
        ];
        var daily = d.daily || [],
            max =
                Math.max.apply(
                    null,
                    daily.map(function (x) {
                        return x.requests;
                    }),
                ) || 1;
        return (
            '<div class="cards">' +
            cards
                .map(function (x) {
                    return (
                        '<div class="card"><div class="muted">' +
                        x[0] +
                        '</div><div class="value">' +
                        esc(x[1] || 0) +
                        "</div></div>"
                    );
                })
                .join("") +
            '</div><div class="grid2"><section class="panel"><h2>近 7 天节点信息访问</h2><div class="chart">' +
            daily
                .map(function (x) {
                    return (
                        '<div style="height:' +
                        Math.max(2, (x.requests / max) * 100) +
                        '%" title="' +
                        x.requests +
                        ' 次"><span>' +
                        esc(x.day.slice(5)) +
                        "</span></div>"
                    );
                })
                .join("") +
            '</div></section><section class="panel"><h2>风险用户 Top 10</h2>' +
            userTable(d.top_users || []) +
            '</section></div><div class="grid2"><section class="panel"><h2>最近事件</h2>' +
            eventTable(d.recent_events || []) +
            '</section><section class="panel"><h2>最近告警</h2>' +
            alertTable(d.alerts || []) +
            "</section></div>"
        );
    }
    function events(d) {
        var p = d || {};
        var f = state.filters.events;
        return (
            '<div class="toolbar"><button class="btn primary" data-new-event>登记封锁事件</button><select id="event-status"><option value="">全部状态</option><option value="suspected"' +
            selected(f.status, "suspected") +
            '>待确认</option><option value="confirmed"' +
            selected(f.status, "confirmed") +
            '>已确认</option><option value="excluded"' +
            selected(f.status, "excluded") +
            '>已排除</option><option value="resolved"' +
            selected(f.status, "resolved") +
            '>已恢复</option></select><button class="btn" data-filter-events>筛选</button></div><section class="panel">' +
            eventTable(p.data || []) +
            pager(p) +
            "</section>"
        );
    }
    function eventTable(rows) {
        if (!rows.length) return '<div class="empty">暂无事件</div>';
        return (
            "<table><thead><tr><th>ID</th><th>节点</th><th>类型</th><th>状态</th><th>首次失败</th><th>操作</th></tr></thead><tbody>" +
            rows
                .map(function (x) {
                    return (
                        "<tr><td>#" +
                        x.id +
                        "</td><td>" +
                        esc(
                            (x.server_name || x.server_type) +
                                " / " +
                                x.server_id,
                        ) +
                        "</td><td>" +
                        esc(x.event_type) +
                        "</td><td>" +
                        badge(x.status, x.status) +
                        "</td><td>" +
                        time(x.first_failed_at) +
                        '</td><td><button class="btn" data-event="' +
                        x.id +
                        '">时间线</button> ' +
                        (x.status === "suspected"
                            ? '<button class="btn primary" data-confirm="' +
                              x.id +
                              '">确认</button>'
                            : "") +
                        "</td></tr>"
                    );
                })
                .join("") +
            "</tbody></table>"
        );
    }
    function users(d) {
        var p = d || {};
        var f = state.filters.users;
        return (
            '<section class="filter-panel"><div class="filter-grid"><label>邮箱<input id="user-search" placeholder="搜索邮箱" value="' +
            esc(f.search || "") +
            '"></label><label>风险分<input id="risk-min" type="number" min="0" max="100" placeholder="最低" value="' +
            esc(f.risk_min || "") +
            '"></label><label>最高风险<input id="risk-max" type="number" min="0" max="100" placeholder="最高" value="' +
            esc(f.risk_max || "") +
            '"></label><label>风控状态<select id="user-status"><option value="">全部状态</option><option value="watching"' +
            selected(f.status, "watching") +
            '>观察中</option><option value="trusted"' +
            selected(f.status, "trusted") +
            '>可信</option><option value="suspended"' +
            selected(f.status, "suspended") +
            '>已暂停</option></select></label><label>事件命中 ≥<input id="event-hits-min" type="number" min="0" value="' +
            esc(f.event_hits_min || "") +
            '"></label><label>水印命中 ≥<input id="watermark-hits-min" type="number" min="0" value="' +
            esc(f.watermark_hits_min || "") +
            '"></label><label>账号状态<select id="user-banned"><option value="">全部账号</option><option value="0"' +
            selected(f.banned, "0") +
            '>正常</option><option value="1"' +
            selected(f.banned, "1") +
            '>已封禁</option></select></label><label>排序字段<select id="user-sort"><option value="risk_score"' +
            selected(f.sort_by || "risk_score", "risk_score") +
            '>风险分</option><option value="event_hits"' +
            selected(f.sort_by, "event_hits") +
            '>事件命中</option><option value="early_access_hits"' +
            selected(f.sort_by, "early_access_hits") +
            '>早期获取</option><option value="watermark_hits"' +
            selected(f.sort_by, "watermark_hits") +
            '>水印命中</option><option value="unique_ips"' +
            selected(f.sort_by, "unique_ips") +
            '>IP 数</option><option value="last_risk_at"' +
            selected(f.sort_by, "last_risk_at") +
            '>最近风险时间</option></select></label><label>顺序<select id="user-order"><option value="desc"' +
            selected(f.sort_order || "desc", "desc") +
            '>从高到低</option><option value="asc"' +
            selected(f.sort_order, "asc") +
            '>从低到高</option></select></label></div><div class="filter-actions"><button class="btn primary" data-filter-users>应用筛选</button><button class="btn" data-reset-users>重置</button><span class="muted">共 ' +
            esc(p.total || 0) +
            ' 名用户</span></div></section><section class="panel table-wrap">' +
            userTable(p.data || [], true) +
            pager(p) +
            "</section>"
        );
    }
    function userTable(rows, action) {
        if (!rows.length)
            return '<div class="empty">暂无风险用户；登记并确认事件后会生成排行</div>';
        return (
            "<table><thead><tr><th>用户</th><th>风险</th><th>事件命中</th><th>早期获取</th><th>水印</th><th>IP / 设备</th>" +
            (action ? "<th>操作</th>" : "") +
            "</tr></thead><tbody>" +
            rows
                .map(function (x) {
                    return (
                        "<tr><td>" +
                        esc(x.email) +
                        '<br><span class="muted">ID ' +
                        x.user_id +
                        "</span></td><td>" +
                        risk(x.risk_score) +
                        "</td><td>" +
                        x.event_hits +
                        "</td><td>" +
                        x.early_access_hits +
                        "</td><td>" +
                        x.watermark_hits +
                        "</td><td>" +
                        x.unique_ips +
                        " / " +
                        x.unique_devices +
                        "</td>" +
                        (action
                            ? '<td><button class="btn" data-user="' +
                              x.user_id +
                              '">详情</button></td>'
                            : "") +
                        "</tr>"
                    );
                })
                .join("") +
            "</tbody></table>"
        );
    }
    function logs(d) {
        var p = d || {};
        var f = state.filters.logs;
        return (
            '<section class="filter-panel"><div class="filter-grid"><label>用户 ID<input id="log-user" type="number" placeholder="用户 ID" value="' +
            esc(f.user_id || "") +
            '"></label><label>邮箱<input id="log-search" placeholder="搜索邮箱" value="' +
            esc(f.search || "") +
            '"></label><label>访问 IP<input id="log-ip" placeholder="精确 IP" value="' +
            esc(f.ip || "") +
            '"></label><label>接口<select id="log-endpoint"><option value="">全部接口</option><option value="user.server.fetch"' +
            selected(f.endpoint, "user.server.fetch") +
            '>用户节点列表</option><option value="client.app.config"' +
            selected(f.endpoint, "client.app.config") +
            '>客户端配置</option></select></label><label>响应状态<input id="log-status" type="number" placeholder="例如 200" value="' +
            esc(f.response_status || "") +
            '"></label><label>开始时间<input id="log-from" type="datetime-local" value="' +
            esc(f.date_from_text || "") +
            '"></label><label>结束时间<input id="log-to" type="datetime-local" value="' +
            esc(f.date_to_text || "") +
            '"></label><label>排序字段<select id="log-sort"><option value="requested_at"' +
            selected(f.sort_by || "requested_at", "requested_at") +
            '>访问时间</option><option value="duration_ms"' +
            selected(f.sort_by, "duration_ms") +
            '>耗时</option><option value="response_bytes"' +
            selected(f.sort_by, "response_bytes") +
            '>响应大小</option><option value="response_status"' +
            selected(f.sort_by, "response_status") +
            '>状态码</option><option value="user_id"' +
            selected(f.sort_by, "user_id") +
            '>用户 ID</option></select></label><label>顺序<select id="log-order"><option value="desc"' +
            selected(f.sort_order || "desc", "desc") +
            '>从新到旧 / 从高到低</option><option value="asc"' +
            selected(f.sort_order, "asc") +
            '>从旧到新 / 从低到高</option></select></label></div><div class="filter-actions"><button class="btn primary" data-filter-logs>应用筛选</button><button class="btn" data-reset-logs>重置</button><span class="muted">共 ' +
            esc(p.total || 0) +
            ' 条记录</span></div></section><section class="panel table-wrap">' +
            logTable(p.data || []) +
            pager(p) +
            "</section>"
        );
    }
    function logTable(rows) {
        if (!rows.length) return '<div class="empty">暂无访问记录</div>';
        return (
            "<table><thead><tr><th>时间</th><th>用户</th><th>接口</th><th>IP</th><th>会话/设备</th><th>状态</th><th>大小</th><th>耗时</th></tr></thead><tbody>" +
            rows
                .map(function (x) {
                    return (
                        "<tr><td>" +
                        time(x.requested_at) +
                        "</td><td>" +
                        esc(x.email || x.user_id) +
                        "</td><td>" +
                        esc(x.endpoint) +
                        "</td><td>" +
                        esc(x.request_ip) +
                        '</td><td title="' +
                        esc(x.user_agent) +
                        '">' +
                        esc((x.session_id || "-").slice(0, 10)) +
                        " / " +
                        esc((x.device_hash || "-").slice(0, 10)) +
                        "</td><td>" +
                        x.response_status +
                        "</td><td>" +
                        (x.response_bytes == null ? "-" : x.response_bytes) +
                        "</td><td>" +
                        x.duration_ms +
                        "ms</td></tr>"
                    );
                })
                .join("") +
            "</tbody></table>"
        );
    }
    function watermarks(rows) {
        rows = rows || [];
        return (
            '<div class="toolbar"><button class="btn primary" data-new-experiment>创建实验</button></div>' +
            (!rows.length
                ? '<div class="panel empty">暂无水印实验</div>'
                : rows
                      .map(function (e) {
                          return (
                              '<section class="panel"><div class="toolbar"><h2 style="margin:0">' +
                              esc(e.name) +
                              " · 第 " +
                              e.round +
                              " 轮</h2>" +
                              badge(e.status, e.status) +
                              '<button class="btn" data-exp-status="' +
                              e.id +
                              '" data-status="' +
                              (e.status === "active" ? "paused" : "active") +
                              '">' +
                              (e.status === "active" ? "暂停" : "启动") +
                              '</button></div><div class="groups">' +
                              (e.groups || [])
                                  .map(function (g) {
                                      return (
                                          '<div class="group"><b>' +
                                          esc(g.name) +
                                          "</b> " +
                                          (g.is_control
                                              ? badge("控制组", "ok")
                                              : "") +
                                          '<div class="muted">' +
                                          esc(
                                              (g.server_type || "-") +
                                                  " / " +
                                                  (g.server_id || "-"),
                                          ) +
                                          " · " +
                                          g.user_count +
                                          " 用户 · 探测 " +
                                          (g.last_check_ok === null
                                              ? "未运行"
                                              : g.last_check_ok
                                                ? "正常"
                                                : "失败 " +
                                                  g.failure_count +
                                                  " 次") +
                                          "</div>" +
                                          (g.user_count > 1
                                              ? '<button class="btn" data-split="' +
                                                g.id +
                                                '">细分此组</button>'
                                              : "") +
                                          "</div>"
                                      );
                                  })
                                  .join("") +
                              "</div></section>"
                          );
                      })
                      .join(""))
        );
    }
    function probes(d) {
        var rows = d.probes || [],
            states = d.states || [],
            refreshSeconds = Number(
                (d.settings || {}).probe_page_refresh_seconds || 0,
            ),
            activeTargets = states.filter(function (x) {
                return x.target_status === "active";
            }).length;
        return (
            '<div class="toolbar"><button class="btn primary" data-new-probe>创建探测点</button><span class="muted">建议至少部署国内两个不同运营商和一个海外探测点</span></div><section class="panel"><h2>探测点</h2>' +
            (rows.length
                ? "<table><thead><tr><th>名称</th><th>地区/运营商</th><th>状态</th><th>最后在线</th><th>版本</th><th>操作</th></tr></thead><tbody>" +
                  rows
                      .map(function (x) {
                          var online =
                              x.last_seen_at &&
                              Date.now() / 1000 - x.last_seen_at < 180;
                          return (
                              "<tr><td>" +
                              esc(x.name) +
                              '<br><span class="muted">ID ' +
                              x.id +
                              "</span></td><td>" +
                              esc(x.region) +
                              " / " +
                              esc(x.carrier) +
                              "</td><td>" +
                              badge(
                                  x.status === "active"
                                      ? online
                                          ? "在线"
                                          : "离线"
                                      : x.status === "paused"
                                        ? "已暂停"
                                        : "已撤销",
                                  online
                                      ? "ok"
                                      : x.status === "active"
                                        ? "warning"
                                        : "",
                              ) +
                              "</td><td>" +
                              time(x.last_seen_at) +
                              "</td><td>" +
                              esc(x.version || "-") +
                              '</td><td><button class="btn" data-probe-toggle="' +
                              x.id +
                              '" data-status="' +
                              (x.status === "active" ? "paused" : "active") +
                              '">' +
                              (x.status === "active" ? "暂停" : "启用") +
                              '</button> <button class="btn" data-edit-probe="' +
                              x.id +
                              '" data-probe-name="' +
                              esc(x.name) +
                              '" data-region="' +
                              esc(x.region) +
                              '" data-carrier="' +
                              esc(x.carrier) +
                              '">编辑</button> <button class="btn danger" data-delete-probe="' +
                              x.id +
                              '" data-probe-name="' +
                              esc(x.name) +
                              '" ' +
                              (x.status !== "paused"
                                  ? 'disabled title="请先暂停探测点"'
                                  : "") +
                              ">删除</button></td></tr>"
                          );
                      })
                      .join("") +
                  "</tbody></table>"
                : '<div class="empty">还没有探测点，创建后在其他服务器运行安装命令</div>') +
            '</section><section class="panel"><div class="monitor-header"><div><h2>节点监控状态</h2><span class="muted">仅检测手动加入监控池的节点，不会自动检测全部节点 · ' +
            (refreshSeconds > 0
                ? "每 " + Math.max(5, refreshSeconds) + " 秒自动刷新"
                : "自动刷新已关闭") +
            '</span></div><div class="toolbar"><span class="monitor-count">监控中 ' +
            activeTargets +
            " / " +
            states.length +
            '</span><button class="btn primary" data-add-target>添加监控节点</button></div></div>' +
            (states.length
                ? '<div class="batch-toolbar"><label class="check"><input type="checkbox" data-select-targets> 全选</label><span data-target-selected>已选择 0 个</span><button class="btn" data-target-batch="pause" disabled>批量暂停</button><button class="btn" data-target-batch="resume" disabled>批量恢复</button><button class="btn danger" data-target-batch="remove" disabled>批量移除</button></div><div class="table-wrap"><table><thead><tr><th></th><th>节点</th><th>名称</th><th>地址 / 端口</th><th>监控状态</th><th>判断</th><th>国内成功/失败</th><th>海外成功/失败</th><th>连续异常</th><th>最后检查</th><th>操作</th></tr></thead><tbody>' +
                  states
                      .map(function (x) {
                          return (
                              '<tr><td><input class="row-check" type="checkbox" data-target-check data-type="' +
                              esc(x.server_type) +
                              '" data-id="' +
                              x.server_id +
                              '"></td><td>' +
                              esc(x.server_type) +
                              " / " +
                              x.server_id +
                              "</td><td>" +
                              esc(x.server_name || "未命名节点") +
                              "</td><td>" +
                              '<code class="server-address">' +
                              esc(x.server_address || "-") +
                              "</code></td><td>" +
                              badge(
                                  x.target_status === "active"
                                      ? "监控中"
                                      : "已暂停",
                                  x.target_status === "active" ? "ok" : "",
                              ) +
                              "</td><td>" +
                              badge(
                                  x.target_status === "active"
                                      ? nodeStatusLabel(x.status)
                                      : "暂停期间不判断",
                                  x.status === "healthy"
                                      ? "ok"
                                      : x.status === "suspected_blocked"
                                        ? "high"
                                        : "warning",
                              ) +
                              "</td><td>" +
                              x.domestic_ok +
                              " / " +
                              x.domestic_failed +
                              "</td><td>" +
                              x.overseas_ok +
                              " / " +
                              x.overseas_failed +
                              "</td><td>" +
                              x.consecutive_failures +
                              "</td><td>" +
                              time(x.last_checked_at) +
                              '</td><td><button class="btn" data-single-target="' +
                              (x.target_status === "active"
                                  ? "pause"
                                  : "resume") +
                              '" data-type="' +
                              esc(x.server_type) +
                              '" data-id="' +
                              x.server_id +
                              '">' +
                              (x.target_status === "active" ? "暂停" : "恢复") +
                              '</button> <button class="btn danger" data-single-target="remove" data-type="' +
                              esc(x.server_type) +
                              '" data-id="' +
                              x.server_id +
                              '">移除</button></td></tr>'
                          );
                      })
                      .join("") +
                  "</tbody></table></div>"
                : '<div class="empty"><b>还没有监控节点</b><br>点击“添加监控节点”，批量选择需要检测的节点。</div>') +
            "</section>"
        );
    }
    function alerts(d) {
        var p = d || {};
        return (
            '<section class="panel">' +
            alertTable(p.data || []) +
            pager(p) +
            "</section>"
        );
    }
    function alertTable(rows) {
        if (!rows.length) return '<div class="empty">暂无告警</div>';
        return (
            "<table><thead><tr><th>时间</th><th>级别</th><th>标题</th><th>状态</th></tr></thead><tbody>" +
            rows
                .map(function (x) {
                    return (
                        "<tr><td>" +
                        time(x.created_at) +
                        "</td><td>" +
                        badge(x.severity, x.severity) +
                        "</td><td>" +
                        esc(x.title) +
                        "</td><td>" +
                        (x.read_at
                            ? "已读"
                            : '<button class="btn" data-read-alert="' +
                              x.id +
                              '">标为已读</button>') +
                        "</td></tr>"
                    );
                })
                .join("") +
            "</tbody></table>"
        );
    }
    function settings(d) {
        var toggles = [
            [
                "enabled",
                "访问审计",
                "记录用户获取节点版本、会话、IP 和设备特征",
            ],
            ["health_enabled", "自动 TCP 探测", "保留原有水印节点本机探测能力"],
            [
                "auto_create_event",
                "自动创建疑似事件",
                "探测达到失败阈值后自动登记待确认事件",
            ],
        ];
        var fields = [
            [
                "retention_days",
                "访问日志保留天数",
                "number",
                "原始访问明细到期后自动清理",
            ],
            [
                "risk_window_seconds",
                "封锁关联窗口（秒）",
                "number",
                "封锁前多长时间内的访问参与风险计算",
            ],
            [
                "early_window_seconds",
                "早期获取窗口（秒）",
                "number",
                "距离封锁越近的访问将获得更高权重",
            ],
            [
                "probe_interval_seconds",
                "私有探测间隔（秒）",
                "number",
                "正常节点建议 300 秒，最小 30 秒",
            ],
            [
                "probe_failures_to_event",
                "异常事件失败轮数",
                "number",
                "连续达到轮数后自动建立待确认事件",
            ],
            [
                "probe_result_window_seconds",
                "探测结果窗口（秒）",
                "number",
                "只使用窗口内各探测点的最新结果",
            ],
            [
                "probe_page_refresh_seconds",
                "探测页面刷新间隔（秒）",
                "number",
                "最小 5 秒；设置为 0 可关闭自动刷新",
            ],
            [
                "security_analysis_interval_minutes",
                "安全分析间隔（分钟）",
                "number",
                "每分钟触发检查，按此间隔更新状态和风险；范围 1～60",
            ],
            [
                "health_timeout_seconds",
                "探测超时（秒）",
                "number",
                "单次 TCP 连接的最长等待时间",
            ],
            [
                "health_failures_to_alert",
                "水印探测失败阈值",
                "number",
                "原有本机水印探测的告警阈值",
            ],
            [
                "auto_suspend_score",
                "自动停止下发分数",
                "number",
                "0 表示关闭；建议完成多轮验证后再启用",
            ],
            [
                "multi_account_ip_threshold",
                "同 IP 多账号阈值",
                "number",
                "24 小时内达到阈值时产生关联账号告警",
            ],
            [
                "alert_webhook_url",
                "告警 Webhook",
                "text",
                "可选，用于向外部系统发送告警",
            ],
        ];
        return (
            '<form id="settings-form"><section class="panel"><h2>功能开关</h2><div class="setting-toggles">' +
            toggles
                .map(function (f) {
                    var v = d[f[0]];
                    return (
                        '<label class="setting-toggle"><span><b>' +
                        f[1] +
                        "</b><small>" +
                        f[2] +
                        '</small></span><span class="switch"><input name="' +
                        f[0] +
                        '" type="checkbox" ' +
                        (v ? "checked" : "") +
                        "><i></i></span></label>"
                    );
                })
                .join("") +
            '</div></section><section class="panel"><h2>检测与保留规则</h2><div class="settings-grid">' +
            fields
                .map(function (f) {
                    var v = d[f[0]];
                    return (
                        '<label class="setting-field"><span><b>' +
                        f[1] +
                        "</b><small>" +
                        f[3] +
                        '</small></span><input name="' +
                        f[0] +
                        '" type="' +
                        f[2] +
                        '" value="' +
                        esc(v) +
                        '"></label>'
                    );
                })
                .join("") +
            '</div><div class="settings-actions"><span class="muted">私有探测自动事件只进入待确认队列，人工确认后才计入风险。</span><button class="btn primary">保存设置</button></div></section></form>'
        );
    }
    function pager(p) {
        if (!p || !p.last_page || p.last_page < 2) return "";
        return (
            '<div class="pagination"><button class="btn" data-goto="' +
            (p.current_page - 1) +
            '" ' +
            (p.current_page <= 1 ? "disabled" : "") +
            ">上一页</button><span>第 " +
            p.current_page +
            " / " +
            p.last_page +
            ' 页</span><button class="btn" data-goto="' +
            (p.current_page + 1) +
            '" ' +
            (p.current_page >= p.last_page ? "disabled" : "") +
            ">下一页</button></div>"
        );
    }
    function modal(title, body) {
        state.modal =
            '<div class="modal"><div class="modal-box"><div class="toolbar"><h2 style="flex:1;margin:0">' +
            title +
            '</h2><button class="btn" data-close>关闭</button></div>' +
            body +
            "</div></div>";
        render();
    }
    function eventDetailModal(d) {
        var e = d.event || {},
            s = d.summary || {},
            snapshot = d.snapshot || {},
            candidates = d.candidates || [],
            logs = d.access_logs || [];
        var candidateRows = candidates.length
            ? candidates
                  .map(function (x) {
                      return (
                          "<tr><td><b>" +
                          esc(x.email) +
                          '</b><br><span class="muted">ID ' +
                          x.user_id +
                          "</span></td><td><b>" +
                          x.access_count +
                          "</b> 次</td><td>" +
                          x.unique_ips +
                          " / " +
                          x.unique_devices +
                          '</td><td><span class="delta">封锁前 ' +
                          x.closest_seconds +
                          ' 秒</span></td><td><button class="btn" data-user="' +
                          x.user_id +
                          '">查看用户</button></td></tr>'
                      );
                  })
                  .join("")
            : '<tr><td colspan="5" class="empty">关联窗口内没有匹配的访问用户</td></tr>';
        var logRows = logs.length
            ? logs
                  .map(function (l) {
                      var search = [
                          l.email,
                          l.user_id,
                          l.request_ip,
                          l.endpoint,
                      ]
                          .join(" ")
                          .toLowerCase();
                      return (
                          '<tr data-timeline-row data-search="' +
                          esc(search) +
                          '" data-seconds="' +
                          l.seconds_before_failure +
                          '"><td>' +
                          time(l.requested_at) +
                          '<br><span class="delta">封锁前 ' +
                          l.seconds_before_failure +
                          " 秒</span></td><td>" +
                          esc(l.email) +
                          '<br><span class="muted">ID ' +
                          l.user_id +
                          "</span></td><td>" +
                          esc(l.endpoint) +
                          "</td><td>" +
                          esc(l.request_ip) +
                          "</td><td>" +
                          esc((l.device_hash || "-").slice(0, 12)) +
                          "</td><td>" +
                          l.response_status +
                          " / " +
                          l.duration_ms +
                          "ms</td></tr>"
                      );
                  })
                  .join("")
            : '<tr><td colspan="6" class="empty">关联窗口内没有访问记录</td></tr>';
        modal(
            "事件 #" + e.id + " 调查时间线",
            '<div class="event-overview"><div><div class="event-title">' +
                esc(snapshot.server_name || e.server_type) +
                ' <span class="muted">#' +
                e.server_id +
                '</span></div><div class="muted">首次失败：' +
                time(e.first_failed_at) +
                (e.detected_at ? " · 达到阈值：" + time(e.detected_at) : "") +
                " · 快照：" +
                esc(snapshot.version || e.snapshot_id || "未关联") +
                "</div></div><div>" +
                badge(e.event_type, e.event_type) +
                " " +
                badge(e.status, e.status) +
                '</div></div><div class="event-summary"><div><b>' +
                esc(s.user_count || 0) +
                "</b><span>候选用户</span></div><div><b>" +
                esc(s.access_count || 0) +
                "</b><span>关联访问</span></div><div><b>" +
                esc(s.unique_ips || 0) +
                "</b><span>独立 IP</span></div><div><b>" +
                esc(s.window_seconds || 0) +
                's</b><span>分析窗口</span></div></div><div class="event-actions"><span class="muted">调查结论会立即重新计算风险用户排行</span><button class="btn primary" data-event-action="confirmed" data-id="' +
                e.id +
                '">确认泄露</button><button class="btn" data-event-action="excluded" data-id="' +
                e.id +
                '">排除误报</button><button class="btn" data-event-action="resolved" data-id="' +
                e.id +
                '">标记已恢复</button></div><section class="timeline-section"><h3>候选用户（按接近失败时间排序）</h3><div class="table-wrap"><table><thead><tr><th>用户</th><th>访问</th><th>IP / 设备</th><th>最近访问</th><th>操作</th></tr></thead><tbody>' +
                candidateRows +
                '</tbody></table></div></section><section class="timeline-section"><div class="timeline-heading"><h3>完整访问时间线</h3><div class="timeline-tools"><input id="timeline-search" placeholder="搜索邮箱、ID、IP、接口"><label class="check"><input id="timeline-near" type="checkbox"> 仅看封锁前 60 秒</label></div></div><div class="table-wrap timeline-table"><table><thead><tr><th>访问时间</th><th>用户</th><th>接口</th><th>IP</th><th>设备摘要</th><th>响应</th></tr></thead><tbody>' +
                logRows +
                "</tbody></table></div></section>",
        );
        var box = root.querySelector(".modal-box");
        if (box) box.classList.add("modal-wide");
    }
    function eventForm() {
        modal(
            "登记封锁事件",
            '<form id="event-form" class="form-grid"><label>节点类型<input name="server_type" required placeholder="vmess"></label><label>节点 ID<input name="server_id" type="number" required></label><label>快照 ID<input name="snapshot_id" type="number"></label><label>水印组 ID（普通节点留空）<input name="watermark_group_id" type="number"></label><label>首次失败时间<input name="failed_time" type="datetime-local" required></label><label>事件类型<select name="event_type"><option value="blocked">疑似封锁</option><option value="outage">服务器故障</option><option value="carrier">运营商故障</option></select></label><label>状态<select name="status"><option value="suspected">待确认</option><option value="confirmed">已确认</option></select></label><label class="span2">备注<textarea name="remark"></textarea></label><div class="span2"><button class="btn primary">保存并计算风险</button></div></form>',
        );
    }
    function experimentForm(groupId) {
        modal(
            groupId ? "细分水印组" : "创建水印实验",
            '<form id="experiment-form" data-group="' +
                (groupId || "") +
                '"><div class="form-grid"><label>实验名称<input name="name" required></label><label>状态<select name="status"><option value="draft">草稿</option><option value="active">立即启动</option></select></label>' +
                (groupId
                    ? ""
                    : '<label class="span2">用户 ID（逗号分隔）<input name="user_ids" required placeholder="12,15,28"></label>') +
                '<label>节点类型<input name="server_type" required placeholder="vmess"></label><label>被替换节点 ID<input name="server_id" type="number" required></label><label>分组数量<input name="group_count" type="number" min="2" max="16" value="4"></label><label>水印地址（每行 host:port）<textarea name="hosts" required placeholder="1.2.3.4:443&#10;1.2.3.5:443"></textarea></label><label class="span2"><input name="control" type="checkbox"> 最后一组作为控制组（不替换节点）</label><div class="span2"><button class="btn primary">创建并稳定分组</button></div></div></form>',
        );
    }
    function probeForm() {
        modal(
            "创建私有探测点",
            '<form id="probe-form" class="form-grid"><label>名称<input name="name" required placeholder="cn-telecom-01"></label><label>地区<select name="region"><option value="CN">中国大陆</option><option value="HK">香港</option><option value="US">美国</option><option value="SG">新加坡</option><option value="JP">日本</option></select></label><label class="span2">运营商<select name="carrier"><option value="telecom">电信</option><option value="unicom">联通</option><option value="mobile">移动</option><option value="overseas">海外</option><option value="unknown">其他</option></select></label><div class="span2"><button class="btn primary">创建并生成安装密钥</button></div></form>',
        );
    }
    function editProbeForm(probe) {
        modal(
            "编辑探测点",
            '<form id="edit-probe-form" data-id="' +
                probe.id +
                '" class="form-grid"><label class="span2">名称<input name="name" required maxlength="96" value="' +
                esc(probe.name) +
                '"></label><label>地区<select name="region"><option value="CN"' +
                selected(probe.region, "CN") +
                '>中国大陆</option><option value="HK"' +
                selected(probe.region, "HK") +
                '>香港</option><option value="US"' +
                selected(probe.region, "US") +
                '>美国</option><option value="SG"' +
                selected(probe.region, "SG") +
                '>新加坡</option><option value="JP"' +
                selected(probe.region, "JP") +
                '>日本</option></select></label><label>运营商<select name="carrier"><option value="telecom"' +
                selected(probe.carrier, "telecom") +
                '>电信</option><option value="unicom"' +
                selected(probe.carrier, "unicom") +
                '>联通</option><option value="mobile"' +
                selected(probe.carrier, "mobile") +
                '>移动</option><option value="overseas"' +
                selected(probe.carrier, "overseas") +
                '>海外</option><option value="unknown"' +
                selected(probe.carrier, "unknown") +
                '>其他</option></select></label><div class="span2 edit-note">修改会从下一次上报开始生效，不会重写历史探测记录。</div><div class="span2 modal-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary" type="submit">保存修改</button></div></form>',
        );
    }
    function targetPicker(rows) {
        rows = rows || [];
        var types = rows
            .map(function (x) {
                return x.server_type;
            })
            .filter(function (x, i, all) {
                return all.indexOf(x) === i;
            });
        modal(
            "添加监控节点",
            '<div class="target-picker-tools"><input id="target-search" placeholder="搜索节点名称或 ID"><select id="target-type"><option value="">全部类型</option>' +
                types
                    .map(function (type) {
                        return (
                            '<option value="' +
                            esc(type) +
                            '">' +
                            esc(type) +
                            "</option>"
                        );
                    })
                    .join("") +
                '</select><label class="check"><input type="checkbox" data-select-candidates> 全选当前结果</label></div><form id="target-picker-form"><div class="picker-summary"><span data-candidate-selected>已选择 0 个节点</span><span class="muted">只显示当前支持 TCP 端口探测且已启用的节点</span></div><div class="table-wrap target-picker-table"><table><thead><tr><th></th><th>名称</th><th>类型 / ID</th><th>端口</th><th>状态</th></tr></thead><tbody>' +
                rows
                    .map(function (x) {
                        var monitored = !!x.monitored_status;
                        return (
                            '<tr data-candidate-row data-search="' +
                            esc(
                                (
                                    x.server_name +
                                    " " +
                                    x.server_id
                                ).toLowerCase(),
                            ) +
                            '" data-type="' +
                            esc(x.server_type) +
                            '"><td><input class="row-check" type="checkbox" data-candidate-check data-type="' +
                            esc(x.server_type) +
                            '" data-id="' +
                            x.server_id +
                            '" ' +
                            (monitored ? "disabled" : "") +
                            "></td><td><b>" +
                            esc(x.server_name) +
                            "</b></td><td>" +
                            esc(x.server_type) +
                            " / " +
                            x.server_id +
                            "</td><td>" +
                            esc(x.port) +
                            "</td><td>" +
                            (monitored
                                ? badge(
                                      x.monitored_status === "active"
                                          ? "已监控"
                                          : "已暂停",
                                      x.monitored_status === "active"
                                          ? "ok"
                                          : "",
                                  )
                                : "可添加") +
                            "</td></tr>"
                        );
                    })
                    .join("") +
                '</tbody></table></div><div class="modal-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary" type="submit" data-add-selected disabled>添加所选节点</button></div></form>',
        );
        var box = root.querySelector(".modal-box");
        if (box) box.classList.add("modal-wide");
    }
    function deleteProbeForm(id, name) {
        modal(
            "删除探测点",
            '<div class="delete-warning"><b>删除后，此探测点的安装密钥将永久失效。</b><p>探测服务器上的程序不会自动卸载，请在服务器上另行停止服务。</p></div><form id="delete-probe-form" data-id="' +
                id +
                '" data-name="' +
                esc(name) +
                '"><div id="delete-probe-error" class="form-error" hidden></div><label class="confirm-name">输入探测点名称 <b>' +
                esc(name) +
                '</b> 进行确认<input name="name" autocomplete="off" required placeholder="请输入完整名称"></label><div class="delete-options"><label><input type="radio" name="delete_results" value="0" checked><span><b>仅删除探测点</b><small>保留历史探测记录，记录将不再关联已删除的探测点</small></span></label><label><input type="radio" name="delete_results" value="1"><span><b>同时删除历史记录</b><small>永久删除该探测点上报的全部历史结果，无法恢复</small></span></label></div><div class="modal-actions"><button type="button" class="btn" data-close>取消</button><button class="btn danger" type="submit">确认删除</button></div></form>',
        );
    }
    function load(extra) {
        if (state.refreshTimer) {
            clearTimeout(state.refreshTimer);
            state.refreshTimer = null;
        }
        state.loading = true;
        state.error = "";
        render();
        if (state.page === "probes") {
            Promise.all([
                api("probes"),
                api("node-states"),
                api("probe-targets/candidates"),
                api("settings"),
            ])
                .then(function (x) {
                    state.data = {
                        probes: x[0],
                        states: x[1],
                        candidates: x[2],
                        settings: x[3],
                    };
                    state.loading = false;
                    render();
                    scheduleProbeRefresh(
                        Number(x[3].probe_page_refresh_seconds || 0),
                    );
                })
                .catch(function (e) {
                    state.error = e.message;
                    state.loading = false;
                    render();
                });
            return;
        }
        var path =
            {
                dashboard: "dashboard?days=7",
                events: "events?page=" + state.pageNo,
                users: "users?page=" + state.pageNo,
                logs: "access-logs?page=" + state.pageNo,
                watermarks: "experiments",
                alerts: "alerts?page=" + state.pageNo,
                settings: "settings",
            }[state.page] +
            (extra != null
                ? extra
                : queryString(state.filters[state.page] || {}));
        api(path)
            .then(function (d) {
                state.data = d;
                state.loading = false;
                render();
            })
            .catch(function (e) {
                state.error = e.message;
                state.loading = false;
                render();
            });
    }
    function scheduleProbeRefresh(seconds) {
        if (state.refreshTimer) clearTimeout(state.refreshTimer);
        if (!seconds || seconds < 0) return;
        seconds = Math.max(5, seconds);
        state.refreshTimer = setTimeout(function () {
            state.refreshTimer = null;
            if (state.page === "probes" && !state.modal) load();
            else if (state.page === "probes") scheduleProbeRefresh(seconds);
        }, seconds * 1000);
    }
    function post(path, body, done) {
        api(path, { method: "POST", body: body })
            .then(function (d) {
                state.modal = null;
                if (!done || done === load) load();
                else done(d);
            })
            .catch(function (e) {
                state.error = e.message;
                render();
            });
    }
    function formData(form) {
        var d = {};
        new FormData(form).forEach(function (v, k) {
            d[k] = v;
        });
        Array.from(form.querySelectorAll("input[type=checkbox]")).forEach(
            function (x) {
                d[x.name] = x.checked;
            },
        );
        return d;
    }
    function bind() {
        root.querySelectorAll("[data-page]").forEach(function (x) {
            x.onclick = function () {
                state.page = x.dataset.page;
                state.pageNo = 1;
                history.replaceState(
                    null,
                    "",
                    cfg.adminUrl + "/security/" + state.page,
                );
                load();
            };
        });
        var r = root.querySelector("[data-refresh]");
        if (r)
            r.onclick = function () {
                load();
            };
        root.querySelectorAll("[data-close]").forEach(function (x) {
            x.onclick = function () {
                state.modal = null;
                render();
            };
        });
        root.querySelectorAll("[data-goto]").forEach(function (x) {
            x.onclick = function () {
                state.pageNo = Number(x.dataset.goto);
                load();
            };
        });
        var n = root.querySelector("[data-new-event]");
        if (n) n.onclick = eventForm;
        var fe = root.querySelector("[data-filter-events]");
        if (fe)
            fe.onclick = function () {
                state.filters.events = {
                    status: root.querySelector("#event-status").value,
                };
                state.pageNo = 1;
                load();
            };
        root.querySelectorAll("[data-confirm]").forEach(function (x) {
            x.onclick = function () {
                post(
                    "event/update",
                    { id: Number(x.dataset.confirm), status: "confirmed" },
                    load,
                );
            };
        });
        root.querySelectorAll("[data-event-action]").forEach(function (x) {
            x.onclick = function () {
                var status = x.dataset.eventAction;
                if (
                    (status === "confirmed" || status === "excluded") &&
                    !confirm(
                        status === "confirmed"
                            ? "确认这是一次节点信息泄露事件？"
                            : "确认将该事件排除为误报？",
                    )
                )
                    return;
                post(
                    "event/update",
                    { id: Number(x.dataset.id), status: status },
                    load,
                );
            };
        });
        function filterTimeline() {
            var input = root.querySelector("#timeline-search");
            var near = root.querySelector("#timeline-near");
            if (!input || !near) return;
            var term = input.value.trim().toLowerCase();
            root.querySelectorAll("[data-timeline-row]").forEach(
                function (row) {
                    var matches =
                        !term || row.dataset.search.indexOf(term) !== -1;
                    var closeEnough =
                        !near.checked || Number(row.dataset.seconds) <= 60;
                    row.hidden = !(matches && closeEnough);
                },
            );
        }
        var timelineSearch = root.querySelector("#timeline-search");
        var timelineNear = root.querySelector("#timeline-near");
        if (timelineSearch) timelineSearch.oninput = filterTimeline;
        if (timelineNear) timelineNear.onchange = filterTimeline;
        root.querySelectorAll("[data-event]").forEach(function (x) {
            x.onclick = function () {
                api("event/detail?id=" + x.dataset.event).then(function (d) {
                    eventDetailModal(d);
                });
            };
        });
        var fu = root.querySelector("[data-filter-users]");
        if (fu)
            fu.onclick = function () {
                state.filters.users = {
                    search: root.querySelector("#user-search").value,
                    risk_min: root.querySelector("#risk-min").value,
                    risk_max: root.querySelector("#risk-max").value,
                    status: root.querySelector("#user-status").value,
                    event_hits_min: root.querySelector("#event-hits-min").value,
                    watermark_hits_min: root.querySelector(
                        "#watermark-hits-min",
                    ).value,
                    banned: root.querySelector("#user-banned").value,
                    sort_by: root.querySelector("#user-sort").value,
                    sort_order: root.querySelector("#user-order").value,
                };
                state.pageNo = 1;
                load();
            };
        var ru = root.querySelector("[data-reset-users]");
        if (ru)
            ru.onclick = function () {
                state.filters.users = {};
                state.pageNo = 1;
                load();
            };
        root.querySelectorAll("[data-user]").forEach(function (x) {
            x.onclick = function () {
                api("user/detail?id=" + x.dataset.user).then(function (d) {
                    modal(
                        "用户风险档案",
                        "<p><b>" +
                            esc(d.user.email) +
                            "</b> · ID " +
                            d.user.id +
                            "</p><p>风险：" +
                            risk((d.score || {}).risk_score || 0) +
                            " · " +
                            esc((d.score || {}).risk_reasons || "暂无原因") +
                            '</p><div class="toolbar"><button class="btn" data-user-action="watch">观察</button><button class="btn" data-user-action="trust">可信</button><button class="btn danger" data-user-action="clear_sessions">清除会话</button><button class="btn danger" data-user-action="ban">封禁</button></div>' +
                            logTable(d.logs || []),
                    );
                    setTimeout(function () {
                        root.querySelectorAll("[data-user-action]").forEach(
                            function (b) {
                                b.onclick = function () {
                                    if (
                                        (b.dataset.userAction === "ban" ||
                                            b.dataset.userAction ===
                                                "clear_sessions") &&
                                        !confirm("确认执行此操作？")
                                    )
                                        return;
                                    post(
                                        "user/action",
                                        {
                                            user_id: d.user.id,
                                            action: b.dataset.userAction,
                                        },
                                        load,
                                    );
                                };
                            },
                        );
                    }, 0);
                });
            };
        });
        var fl = root.querySelector("[data-filter-logs]");
        if (fl)
            fl.onclick = function () {
                var from = root.querySelector("#log-from").value;
                var to = root.querySelector("#log-to").value;
                state.filters.logs = {
                    user_id: root.querySelector("#log-user").value,
                    search: root.querySelector("#log-search").value,
                    ip: root.querySelector("#log-ip").value,
                    endpoint: root.querySelector("#log-endpoint").value,
                    response_status: root.querySelector("#log-status").value,
                    date_from: from
                        ? Math.floor(new Date(from).getTime() / 1000)
                        : "",
                    date_to: to
                        ? Math.floor(new Date(to).getTime() / 1000)
                        : "",
                    date_from_text: from,
                    date_to_text: to,
                    sort_by: root.querySelector("#log-sort").value,
                    sort_order: root.querySelector("#log-order").value,
                };
                state.pageNo = 1;
                load();
            };
        var rl = root.querySelector("[data-reset-logs]");
        if (rl)
            rl.onclick = function () {
                state.filters.logs = {};
                state.pageNo = 1;
                load();
            };
        var ne = root.querySelector("[data-new-experiment]");
        if (ne)
            ne.onclick = function () {
                experimentForm();
            };
        root.querySelectorAll("[data-split]").forEach(function (x) {
            x.onclick = function () {
                experimentForm(Number(x.dataset.split));
            };
        });
        root.querySelectorAll("[data-exp-status]").forEach(function (x) {
            x.onclick = function () {
                post(
                    "experiment/update",
                    {
                        id: Number(x.dataset.expStatus),
                        status: x.dataset.status,
                    },
                    load,
                );
            };
        });
        root.querySelectorAll("[data-read-alert]").forEach(function (x) {
            x.onclick = function () {
                post("alert/read", { id: Number(x.dataset.readAlert) }, load);
            };
        });
        var np = root.querySelector("[data-new-probe]");
        if (np) np.onclick = probeForm;
        var addTarget = root.querySelector("[data-add-target]");
        if (addTarget)
            addTarget.onclick = function () {
                targetPicker((state.data || {}).candidates || []);
            };
        function checkedTargets(selector) {
            return Array.from(root.querySelectorAll(selector + ":checked")).map(
                function (x) {
                    return {
                        server_type: x.dataset.type,
                        server_id: Number(x.dataset.id),
                    };
                },
            );
        }
        function updateTargetSelection() {
            var selected = checkedTargets("[data-target-check]");
            var label = root.querySelector("[data-target-selected]");
            if (label) label.textContent = "已选择 " + selected.length + " 个";
            root.querySelectorAll("[data-target-batch]").forEach(function (x) {
                x.disabled = !selected.length;
            });
        }
        root.querySelectorAll("[data-target-check]").forEach(function (x) {
            x.onchange = updateTargetSelection;
        });
        var selectTargets = root.querySelector("[data-select-targets]");
        if (selectTargets)
            selectTargets.onchange = function () {
                root.querySelectorAll("[data-target-check]").forEach(
                    function (x) {
                        x.checked = selectTargets.checked;
                    },
                );
                updateTargetSelection();
            };
        function submitTargetAction(action, targets) {
            if (!targets.length) return;
            if (
                action === "remove" &&
                !confirm(
                    "确认将所选节点移出监控池？这不会删除面板节点，历史探测记录会保留。",
                )
            )
                return;
            post(
                "probe-targets/batch",
                { action: action, targets: targets },
                load,
            );
        }
        root.querySelectorAll("[data-target-batch]").forEach(function (x) {
            x.onclick = function () {
                submitTargetAction(
                    x.dataset.targetBatch,
                    checkedTargets("[data-target-check]"),
                );
            };
        });
        root.querySelectorAll("[data-single-target]").forEach(function (x) {
            x.onclick = function () {
                submitTargetAction(x.dataset.singleTarget, [
                    {
                        server_type: x.dataset.type,
                        server_id: Number(x.dataset.id),
                    },
                ]);
            };
        });
        function updateCandidateSelection() {
            var selected = checkedTargets("[data-candidate-check]");
            var label = root.querySelector("[data-candidate-selected]");
            var submit = root.querySelector("[data-add-selected]");
            if (label)
                label.textContent = "已选择 " + selected.length + " 个节点";
            if (submit) submit.disabled = !selected.length;
        }
        function filterCandidates() {
            var search =
                (root.querySelector("#target-search") || {}).value || "";
            var type = (root.querySelector("#target-type") || {}).value || "";
            search = search.trim().toLowerCase();
            root.querySelectorAll("[data-candidate-row]").forEach(
                function (row) {
                    row.hidden =
                        (!!search &&
                            row.dataset.search.indexOf(search) === -1) ||
                        (!!type && row.dataset.type !== type);
                },
            );
        }
        root.querySelectorAll("[data-candidate-check]").forEach(function (x) {
            x.onchange = updateCandidateSelection;
        });
        var candidateSearch = root.querySelector("#target-search");
        var candidateType = root.querySelector("#target-type");
        if (candidateSearch) candidateSearch.oninput = filterCandidates;
        if (candidateType) candidateType.onchange = filterCandidates;
        var selectCandidates = root.querySelector("[data-select-candidates]");
        if (selectCandidates)
            selectCandidates.onchange = function () {
                root.querySelectorAll("[data-candidate-row]").forEach(
                    function (row) {
                        var input = row.querySelector("[data-candidate-check]");
                        if (!row.hidden && input && !input.disabled)
                            input.checked = selectCandidates.checked;
                    },
                );
                updateCandidateSelection();
            };
        var targetPickerForm = root.querySelector("#target-picker-form");
        if (targetPickerForm)
            targetPickerForm.onsubmit = function (e) {
                e.preventDefault();
                submitTargetAction(
                    "add",
                    checkedTargets("[data-candidate-check]"),
                );
            };
        root.querySelectorAll("[data-probe-toggle]").forEach(function (x) {
            x.onclick = function () {
                post(
                    "probe/update",
                    {
                        id: Number(x.dataset.probeToggle),
                        status: x.dataset.status,
                    },
                    load,
                );
            };
        });
        root.querySelectorAll("[data-delete-probe]").forEach(function (x) {
            x.onclick = function () {
                if (x.disabled) return;
                deleteProbeForm(
                    Number(x.dataset.deleteProbe),
                    x.dataset.probeName,
                );
            };
        });
        root.querySelectorAll("[data-edit-probe]").forEach(function (x) {
            x.onclick = function () {
                editProbeForm({
                    id: Number(x.dataset.editProbe),
                    name: x.dataset.probeName,
                    region: x.dataset.region,
                    carrier: x.dataset.carrier,
                });
            };
        });
        var epf = root.querySelector("#edit-probe-form");
        if (epf)
            epf.onsubmit = function (e) {
                e.preventDefault();
                var d = formData(epf);
                d.id = Number(epf.dataset.id);
                post("probe/edit", d, load);
            };
        var df = root.querySelector("#delete-probe-form");
        if (df)
            df.onsubmit = function (e) {
                e.preventDefault();
                var d = formData(df);
                if (d.name !== df.dataset.name) {
                    var deleteError = root.querySelector("#delete-probe-error");
                    deleteError.textContent =
                        "探测点名称不匹配，请输入完整名称";
                    deleteError.hidden = false;
                    return;
                }
                if (!confirm("这是最后一次确认：确定永久删除该探测点？"))
                    return;
                post(
                    "probe/delete",
                    {
                        id: Number(df.dataset.id),
                        name: d.name,
                        delete_results: d.delete_results === "1",
                    },
                    load,
                );
            };
        var pf = root.querySelector("#probe-form");
        if (pf)
            pf.onsubmit = function (e) {
                e.preventDefault();
                post("probe/create", formData(pf), function (d) {
                    modal(
                        "探测点创建成功",
                        '<div class="error" style="background:#fef0c7;color:#7a2e0e">密钥仅在这里显示，请立即完成安装。</div><p><b>探测点 ID：</b>' +
                            d.id +
                            '</p><label>一键安装命令<textarea readonly style="min-height:120px">' +
                            esc(d.install_command) +
                            '</textarea></label><p class="muted">在 AMD64 Linux 探测服务器直接执行此命令；它会从你的面板下载二进制并校验 SHA-256。</p>',
                    );
                });
            };
        var sf = root.querySelector("#settings-form");
        if (sf)
            sf.onsubmit = function (e) {
                e.preventDefault();
                var d = formData(sf);
                Object.keys(d).forEach(function (k) {
                    if (sf.elements[k] && sf.elements[k].type === "number")
                        d[k] = Number(d[k]);
                });
                post("settings", d, load);
            };
        var ef = root.querySelector("#event-form");
        if (ef)
            ef.onsubmit = function (e) {
                e.preventDefault();
                var d = formData(ef);
                d.server_id = Number(d.server_id);
                d.snapshot_id = d.snapshot_id ? Number(d.snapshot_id) : null;
                d.watermark_group_id = d.watermark_group_id
                    ? Number(d.watermark_group_id)
                    : null;
                d.first_failed_at = Math.floor(
                    new Date(d.failed_time).getTime() / 1000,
                );
                delete d.failed_time;
                post("event/save", d, load);
            };
        var xf = root.querySelector("#experiment-form");
        if (xf)
            xf.onsubmit = function (e) {
                e.preventDefault();
                var d = formData(xf),
                    lines = d.hosts.split(/\n+/).filter(Boolean),
                    count = Math.min(
                        Number(d.group_count),
                        lines.length + (d.control ? 1 : 0),
                    );
                var groups = [];
                for (var i = 0; i < count; i++) {
                    var hp = (lines[i] || "").trim(),
                        cut = hp.lastIndexOf(":"),
                        control = d.control && i === count - 1;
                    groups.push({
                        name: "Group " + String.fromCharCode(65 + i),
                        server_type: d.server_type,
                        server_id: Number(d.server_id),
                        host: control ? "" : hp.slice(0, cut),
                        port: control ? "" : hp.slice(cut + 1),
                        is_control: control,
                    });
                }
                var body = { name: d.name, status: d.status, groups: groups };
                if (xf.dataset.group) body.group_id = Number(xf.dataset.group);
                else
                    body.user_ids = d.user_ids
                        .split(",")
                        .map(Number)
                        .filter(Boolean);
                post(
                    xf.dataset.group ? "experiment/split" : "experiment/create",
                    body,
                    load,
                );
            };
    }
    var initial = location.pathname.split("/").pop();
    if (labels[initial]) state.page = initial;
    if (!auth()) {
        location.href = cfg.adminUrl;
    } else load();
})();
