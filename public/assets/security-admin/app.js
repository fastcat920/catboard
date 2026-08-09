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
        filters: { events: {}, users: {}, logs: {}, snapshot_analysis: {} },
        snapshotSelection: [],
        snapshotResult: null,
        refreshTimer: null,
        modalParent: null,
    };
    var labels = {
        dashboard: "安全总览",
        events: "泄露事件",
        users: "风险用户",
        logs: "访问记录",
        snapshot_analysis: "快照分析",
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
                healthy: "TCP双向正常",
                suspected_domestic_blocked: "疑似国内方向被封锁",
                suspected_overseas_blocked: "疑似海外方向被封锁",
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
    function eventTypeLabel(type) {
        return (
            {
                blocked: "节点封锁",
                outage: "节点故障",
                carrier: "运营商线路异常",
                excluded: "已排除事件",
            }[type] ||
            type ||
            "未知类型"
        );
    }
    function eventStatusLabel(status) {
        return (
            {
                suspected: "待确认",
                confirmed: "已确认",
                excluded: "已排除",
                resolved: "已恢复",
            }[status] ||
            status ||
            "未知状态"
        );
    }
    function accessEndpointMeta(endpoint) {
        return (
            {
                "user.server.fetch": {
                    label: "用户节点列表",
                    client: "登录客户端",
                },
                "client.app.config": {
                    label: "客户端配置",
                    client: "订阅客户端",
                },
                "client.subscribe": {
                    label: "订阅内容",
                    client: "订阅客户端",
                },
            }[endpoint] || {
                label: endpoint || "未知接口",
                client: "其他客户端",
            }
        );
    }
    function uaTrustLabel(userAgent) {
        return userAgent ? "低可信（客户端声明）" : "无 UA（不可识别）";
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
        if (state.page === "snapshot_analysis") return snapshotAnalysis(d);
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
    function entryHealthLabel(status) {
        return ({ healthy: "双向正常", domestic_blocked: "国内方向异常", overseas_blocked: "海外方向异常", unreachable: "全部不可达", insufficient_probes: "探测点不足", waiting: "等待探测" })[status] || status || "等待探测";
    }
    function entryPools(payload) {
        var page = payload || {}, rows = page.data || [];
        if (!rows.length) return '<div class="panel empty">暂无可配置节点；执行入口池迁移后刷新。</div>';
        return '<section class="panel table-wrap"><table><thead><tr><th>节点 ID</th><th>节点</th><th>原始地址</th><th>下发模式</th><th>入口数量</th><th>健康入口</th><th>操作</th></tr></thead><tbody>' + rows.map(function (x, index) {
            var mode = { primary_only: "仅主入口", manual_backup: "主入口＋备用入口", auto_fallback: "自动故障转移" }[x.delivery_mode] || x.delivery_mode;
            var healthy = (x.entries || []).filter(function (e) { return e.health_status === "healthy"; }).length;
            return '<tr><td><b>' + x.server_id + '</b></td><td><b>' + esc(x.server_name) + '</b><br><span class="muted">' + esc(x.server_type) + '</span></td><td>' + esc(x.original_address) + '</td><td>' + badge(mode, x.delivery_mode === "auto_fallback" ? "ok" : "") + '</td><td>' + (x.entries || []).length + '</td><td>' + healthy + '</td><td><button class="btn" data-manage-entry="' + index + '">管理入口</button></td></tr>';
        }).join("") + '</tbody></table>' + pager(page) + '</section>';
    }
    function entryPoolModal(node) {
        var list = node.entries || [];
        modal("管理节点入口 · " + node.server_name,
            '<form id="entry-setting-form" class="form-grid" data-type="' + esc(node.server_type) + '" data-id="' + node.server_id + '"><label>下发模式<select name="delivery_mode"><option value="primary_only"' + selected(node.delivery_mode, "primary_only") + '>仅主入口</option><option value="manual_backup"' + selected(node.delivery_mode, "manual_backup") + '>主入口＋备用入口</option><option value="auto_fallback"' + selected(node.delivery_mode, "auto_fallback") + '>自动故障转移</option></select></label><label>客户端检测间隔（秒）<input name="check_interval" type="number" min="30" value="' + esc(node.check_interval || 60) + '"></label><label class="span2">客户端检测 URL<input name="check_url" type="url" required value="' + esc(node.check_url) + '"></label><div class="span2"><button class="btn primary" type="submit">保存下发设置</button></div></form><h3>入口列表</h3><div class="table-wrap"><table><thead><tr><th>名称</th><th>地址</th><th>优先级</th><th>角色</th><th>探测状态</th><th>操作</th></tr></thead><tbody>' + (list.length ? list.map(function (e) { return '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.host) + ':' + e.port + '</td><td>' + e.priority + '</td><td>' + (e.is_primary ? '主入口' : '备用') + (e.enabled ? '' : ' · 已停用') + '</td><td>' + entryHealthLabel(e.health_status) + '<br><span class="muted">' + time(e.last_checked_at) + '</span></td><td><button class="btn" data-edit-entry="' + e.id + '">编辑</button> <button class="btn danger" data-delete-entry="' + e.id + '">删除</button></td></tr>'; }).join("") : '<tr><td colspan="6" class="empty">尚未添加入口，旧节点地址仍会正常下发</td></tr>') + '</tbody></table></div><h3>添加入口</h3>' + entryFormHtml(node, null), { boxClass: "modal-profile-wide" });
    }
    function entryFormHtml(node, entry) {
        entry = entry || {};
        return '<form class="form-grid entry-form" data-entry-id="' + (entry.id || '') + '" data-type="' + esc(node.server_type) + '" data-server-id="' + node.server_id + '"><label>入口名称<input name="name" required value="' + esc(entry.name || '') + '" placeholder="例如：备用入口1"></label><label>优先级<input name="priority" type="number" min="1" value="' + esc(entry.priority || 100) + '"></label><label>地址 / 域名<input name="host" required value="' + esc(entry.host || '') + '"></label><label>端口<input name="port" type="number" min="1" max="65535" required value="' + esc(entry.port || '') + '"></label><label class="check"><input name="is_primary" type="checkbox" ' + (entry.is_primary ? 'checked' : '') + '> 设为主入口</label><label class="check"><input name="enabled" type="checkbox" ' + (entry.id && !entry.enabled ? '' : 'checked') + '> 启用并参与下发/探测</label><div class="span2"><button class="btn primary" type="submit">' + (entry.id ? '保存入口' : '添加入口') + '</button></div></form>';
    }
    function refreshEntryPoolModal(type, id) {
        return api("entry-pools?page=" + state.pageNo).then(function (payload) {
            state.data = payload;
            var rows = payload.data || [];
            var node = rows.find(function (item) { return item.server_type === type && Number(item.server_id) === Number(id); });
            if (node) entryPoolModal(node);
            else { state.modal = null; render(); }
        });
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
                        esc(eventTypeLabel(x.event_type)) +
                        "</td><td>" +
                        badge(eventStatusLabel(x.status), x.status) +
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
            '>事件命中</option><option value="watermark_hits"' +
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
            "<table><thead><tr><th>用户</th><th>风险</th><th>事件命中</th><th>水印</th><th>IP / 设备</th>" +
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
                        x.watermark_hits +
                        "</td><td>" +
                        x.unique_ips +
                        " / " +
                        x.unique_devices +
                        "</td>" +
                        (action
                            ? '<td><button class="btn" data-user="' +
                              x.user_id +
                              '">详情</button> <button class="btn" data-user-snapshots="' + x.user_id + '">快照轨迹</button></td>'
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
        var mode = f.view || "details";
        var result = mode === "users" ? logUserTable(p.data || []) : mode === "clients" ? clientProfileTable(p.data || []) : logTable(p.data || []);
        var sortOptions = mode === "details"
            ? '<option value="requested_at"' + selected(f.sort_by || "requested_at", "requested_at") + '>访问时间</option><option value="duration_ms"' + selected(f.sort_by, "duration_ms") + '>耗时</option><option value="response_bytes"' + selected(f.sort_by, "response_bytes") + '>响应大小</option><option value="response_status"' + selected(f.sort_by, "response_status") + '>状态码</option><option value="user_id"' + selected(f.sort_by, "user_id") + '>用户 ID</option>'
            : '<option value="access_count"' + selected(f.sort_by || "access_count", "access_count") + '>访问次数</option><option value="last_access_at"' + selected(f.sort_by, "last_access_at") + '>最近访问时间</option>';
        return (
            '<section class="filter-panel"><div class="filter-grid"><label>显示方式<select id="log-view"><option value="details"' + selected(mode, "details") + '>访问明细</option><option value="users"' + selected(mode, "users") + '>关联用户</option><option value="clients"' + selected(mode, "clients") + '>客户端分类</option></select></label><label>用户 ID<input id="log-user" type="number" placeholder="用户 ID" value="' +
            esc(f.user_id || "") +
            '"></label><label>邮箱<input id="log-search" placeholder="搜索邮箱" value="' +
            esc(f.search || "") +
            '"></label><label>访问 IP<input id="log-ip" placeholder="精确 IP" value="' +
            esc(f.ip || "") +
            '"></label><label>原始 UA<input id="log-ua" placeholder="输入完整或部分 UA" value="' + esc(f.ua || "") + '"></label><label>UA 匹配<select id="log-ua-match"><option value="contains"' + selected(f.ua_match || "contains", "contains") + '>包含</option><option value="exact"' + selected(f.ua_match, "exact") + '>完全一致</option><option value="exclude"' + selected(f.ua_match, "exclude") + '>不包含</option></select></label><label>客户端<select id="log-family"><option value="">全部客户端</option>' + ["FastCat", "FlClash", "Digilink", "Clash Verge", "Clash Meta / Mihomo", "Shadowrocket", "Stash", "Surge", "v2rayN", "v2rayNG", "sing-box", "浏览器", "脚本 / HTTP 工具", "其他 / 未识别", "未提供"].map(function (x) { return '<option value="' + esc(x) + '"' + selected(f.client_family, x) + '>' + esc(x) + '</option>'; }).join("") + '</select></label><label>版本<input id="log-version" placeholder="例如 3.1.0" value="' + esc(f.client_version || "") + '"></label><label>平台<select id="log-platform"><option value="">全部平台</option>' + ["Windows", "macOS", "Android", "iOS", "Linux", "未知"].map(function (x) { return '<option value="' + esc(x) + '"' + selected(f.client_platform, x) + '>' + esc(x) + '</option>'; }).join("") + '</select></label><label>接口<select id="log-endpoint"><option value="">全部接口</option><option value="user.server.fetch"' +
            selected(f.endpoint, "user.server.fetch") +
            '>用户节点列表</option><option value="client.app.config"' +
            selected(f.endpoint, "client.app.config") +
            '>客户端配置</option><option value="client.subscribe"' +
            selected(f.endpoint, "client.subscribe") +
            '>订阅内容</option></select></label><label>响应状态<input id="log-status" type="number" placeholder="例如 200" value="' +
            esc(f.response_status || "") +
            '"></label><label>开始时间<input id="log-from" type="datetime-local" value="' +
            esc(f.date_from_text || "") +
            '"></label><label>结束时间<input id="log-to" type="datetime-local" value="' +
            esc(f.date_to_text || "") +
            '"></label><label>排序字段<select id="log-sort">' + sortOptions + '</select></label><label>顺序<select id="log-order"><option value="desc"' +
            selected(f.sort_order || "desc", "desc") +
            '>从新到旧 / 从高到低</option><option value="asc"' +
            selected(f.sort_order, "asc") +
            '>从旧到新 / 从低到高</option></select></label></div><div class="access-log-notice"><b>访问记录说明</b><span>记录表示用户请求过自己的节点列表，不代表获取了所有节点；是否获得特定节点以事件快照命中为准。</span></div><div class="filter-actions"><button class="btn primary" data-filter-logs>应用筛选</button><button class="btn" data-reset-logs>重置</button><span class="muted">共 ' +
            esc(p.total || 0) +
            (mode === "users" ? ' 名关联用户' : mode === "clients" ? ' 个客户端分类' : ' 条记录') + '</span></div></section><section class="panel table-wrap">' +
            result +
            pager(p) +
            "</section>"
        );
    }
    function logUserTable(rows) {
        if (!rows.length) return '<div class="empty">没有找到使用该 UA 的用户</div>';
        return '<table><thead><tr><th>用户</th><th>访问次数</th><th>客户端 / 平台</th><th>IP / 设备</th><th>首次访问</th><th>最近访问</th><th>操作</th></tr></thead><tbody>' + rows.map(function (x) {
            return '<tr><td>' + esc(x.email) + '<br><span class="muted">ID ' + x.user_id + '</span></td><td>' + x.access_count + '</td><td>' + esc(x.client_families || "未分类") + '<br><span class="muted">' + esc(x.client_platforms || "未知") + '</span></td><td>' + x.unique_ips + ' / ' + x.unique_devices + '</td><td>' + time(x.first_access_at) + '</td><td>' + time(x.last_access_at) + '</td><td><button class="btn" data-user="' + x.user_id + '">风险档案</button> <button class="btn" data-user-snapshots="' + x.user_id + '">快照轨迹</button></td></tr>';
        }).join("") + '</tbody></table>';
    }
    function snapshotPager(page, kind) {
        if (!page || !page.last_page || page.last_page < 2) return "";
        return '<div class="pagination"><button class="btn" data-snapshot-page="' + kind + '" data-page-no="' + (page.current_page - 1) + '"' + (page.current_page <= 1 ? ' disabled' : '') + '>上一页</button><span>第 ' + page.current_page + ' / ' + page.last_page + ' 页，共 ' + page.total + ' 条</span><button class="btn" data-snapshot-page="' + kind + '" data-page-no="' + (page.current_page + 1) + '"' + (page.current_page >= page.last_page ? ' disabled' : '') + '>下一页</button></div>';
    }
    function snapshotAnalysis(d) {
        var catalog = (d || {}).catalog || { data: [] };
        var filters = state.filters.snapshot_analysis || {};
        var mode = filters.mode || "compare";
        var selectedIds = state.snapshotSelection || [];
        var result = state.snapshotResult;
        var catalogRows = (catalog.data || []).map(function (snapshot) {
            var checked = selectedIds.indexOf(Number(snapshot.id)) !== -1;
            return '<tr><td><input type="checkbox" data-snapshot-select value="' + snapshot.id + '"' + (checked ? ' checked' : '') + '></td><td><b>#' + snapshot.id + '</b><br><span class="muted">' + esc(String(snapshot.version || "").slice(0, 12)) + '</span></td><td>' + esc(snapshot.server_name || "未命名") + '<br><span class="muted">' + esc(snapshot.server_type) + ' #' + snapshot.server_id + '</span></td><td>' + time(snapshot.published_at) + '</td><td>' + Number(snapshot.user_count || 0) + ' / ' + Number(snapshot.access_count || 0) + '</td></tr>';
        }).join("");
        var compareResult = "";
        if (result && result.type === "compare") {
            var comparison = result.data || {}, snapshots = comparison.snapshots || [], usersPage = comparison.users || {}, summary = comparison.summary || {};
            var userRows = (usersPage.data || []).map(function (user) {
                var hits = user.snapshot_hits || {};
                return '<tr><td>' + esc(user.email) + '<br><span class="muted">ID ' + user.user_id + ' · ' + esc(user.group_name || "未分组") + '</span></td><td><b>' + user.access_count + '</b> 次<br><span class="muted">命中 ' + user.snapshot_count + ' / ' + snapshots.length + ' 个快照</span></td>' + snapshots.map(function (snapshot) { var hit = hits[snapshot.id] || hits[String(snapshot.id)]; return '<td>' + (hit ? '<b>' + hit.access_count + '</b> 次<br><span class="muted">' + time(hit.last_access_at) + '</span>' : '<span class="muted">未访问</span>') + '</td>'; }).join("") + '<td>' + badge(user.banned ? "已封禁" : "正常", user.banned ? "critical" : "ok") + '<br><button class="btn snapshot-mini" data-user-snapshots="' + user.user_id + '">查看轨迹</button></td></tr>';
            }).join("");
            compareResult = '<section class="panel snapshot-result"><div class="settings-section-head"><div><h2>对比结果</h2><p>' + time(summary.from) + ' ～ ' + time(summary.to) + '</p></div></div><div class="cards snapshot-cards"><div class="card"><div class="muted">任意访问</div><div class="value">' + Number(summary.any_users || 0) + '</div></div><div class="card"><div class="muted">共同用户</div><div class="value">' + Number(summary.common_users || 0) + '</div></div><div class="card"><div class="muted">存在差异</div><div class="value">' + Number(summary.different_users || 0) + '</div></div></div><div class="table-wrap"><table><thead><tr><th>用户</th><th>总访问</th>' + snapshots.map(function (snapshot) { return '<th>#' + snapshot.id + '<br><span class="muted">' + esc(snapshot.server_name || snapshot.server_type) + '</span></th>'; }).join("") + '<th>状态</th></tr></thead><tbody>' + (userRows || '<tr><td colspan="' + (snapshots.length + 3) + '" class="empty">当前条件没有用户</td></tr>') + '</tbody></table></div>' + snapshotPager(usersPage, "compare") + '</section>';
        }
        var trajectoryResult = "";
        if (result && result.type === "user") {
            var trajectory = result.data || {}, trajectoryPage = trajectory.snapshots || {}, user = trajectory.user || {}, summaryUser = trajectory.summary || {};
            var trajectoryRows = (trajectoryPage.data || []).map(function (row) {
                return '<tr><td><b>#' + row.snapshot_id + '</b><br><span class="muted">' + esc(String(row.version || "").slice(0, 12)) + '</span></td><td>' + esc(row.server_name || "未命名") + '<br><span class="muted">' + esc(row.server_type) + ' #' + row.server_id + '</span></td><td><b>' + row.access_count + '</b> 次</td><td>' + row.unique_ips + ' / ' + row.unique_devices + '</td><td>' + esc(row.endpoints || "-") + '</td><td>' + time(row.first_access_at) + '<br><span class="muted">最近 ' + time(row.last_access_at) + '</span></td></tr>';
            }).join("");
            trajectoryResult = '<section class="panel snapshot-result"><div class="settings-section-head"><div><h2>' + esc(user.email) + ' · 快照轨迹</h2><p>ID ' + user.id + ' · ' + esc(user.group_name || "未分组") + ' · ' + (user.banned ? "已封禁" : "正常") + ' · 按最近访问时间从新到旧排序</p></div></div><div class="cards snapshot-cards"><div class="card"><div class="muted">访问次数</div><div class="value">' + Number(summaryUser.access_count || 0) + '</div></div><div class="card"><div class="muted">不同快照</div><div class="value">' + Number(summaryUser.snapshot_count || 0) + '</div></div><div class="card"><div class="muted">最近访问</div><div class="snapshot-time">' + time(summaryUser.last_access_at) + '</div></div></div><div class="table-wrap"><table><thead><tr><th>快照</th><th>节点</th><th>访问</th><th>IP / 设备</th><th>接口</th><th>时间</th></tr></thead><tbody>' + (trajectoryRows || '<tr><td colspan="6" class="empty">该时间范围内没有快照访问记录</td></tr>') + '</tbody></table></div>' + snapshotPager(trajectoryPage, "user") + '</section>';
        }
        return '<div class="snapshot-tabs"><button class="btn' + (mode === "compare" ? ' primary' : '') + '" data-snapshot-mode="compare">快照对比</button><button class="btn' + (mode === "user" ? ' primary' : '') + '" data-snapshot-mode="user">用户快照轨迹</button></div>' +
            (mode === "compare" ? '<section class="filter-panel"><div class="settings-section-head"><div><h2>选择 2～10 个快照</h2><p>已选择 ' + selectedIds.length + ' 个；跨页搜索时选择会保留。</p></div></div><div class="filter-grid"><label>快照 / 节点名称<input id="snapshot-search" value="' + esc(filters.search || "") + '" placeholder="快照 ID 或节点名称"></label><label>节点类型<input id="snapshot-type" value="' + esc(filters.server_type || "") + '" placeholder="例如 vmess"></label><label>节点 ID<input id="snapshot-server-id" type="number" value="' + esc(filters.server_id || "") + '"></label></div><div class="filter-actions"><button class="btn" data-filter-snapshots>搜索快照</button><button class="btn" data-clear-snapshot-selection>清空选择</button></div><div class="table-wrap snapshot-picker"><table><thead><tr><th></th><th>快照</th><th>节点</th><th>发布时间</th><th>用户 / 访问</th></tr></thead><tbody>' + (catalogRows || '<tr><td colspan="5" class="empty">没有找到快照</td></tr>') + '</tbody></table></div>' + snapshotPager(catalog, "catalog") + '<div class="filter-grid snapshot-run"><label>开始时间<input id="snapshot-from" type="datetime-local" value="' + esc(filters.date_from_text || "") + '"></label><label>结束时间<input id="snapshot-to" type="datetime-local" value="' + esc(filters.date_to_text || "") + '"></label><label>用户范围<select id="snapshot-scope"><option value="all"' + selected(filters.scope || "all", "all") + '>全部命中用户</option><option value="common"' + selected(filters.scope, "common") + '>所有快照共同用户</option><option value="differences"' + selected(filters.scope, "differences") + '>存在快照差异的用户</option>' + selectedIds.map(function (id, index) { var label = selectedIds.length === 2 ? (index === 0 ? "旧快照独有" : "新快照新增") : "仅此快照"; return '<option value="only:' + id + '"' + selected(filters.scope, "only:" + id) + '>' + label + ' #' + id + '</option>'; }).join("") + '</select></label></div><div class="filter-actions"><button class="btn primary" data-run-snapshot-compare' + (selectedIds.length < 2 ? ' disabled' : '') + '>开始对比（' + selectedIds.length + '）</button><span class="muted">默认分析最近 30 天；可留空使用默认范围。</span></div></section>' + compareResult : '<section class="filter-panel"><div class="settings-section-head"><div><h2>查询用户访问过的快照</h2><p>使用用户 ID 或完整邮箱精确查找。</p></div></div><div class="filter-grid"><label>用户 ID / 邮箱<input id="trajectory-user" value="' + esc(filters.trajectory_user || "") + '" placeholder="44567 或 user@example.com"></label><label>快照 ID（可选）<input id="trajectory-snapshot" type="number" value="' + esc(filters.trajectory_snapshot || "") + '"></label><label>开始时间<input id="trajectory-from" type="datetime-local" value="' + esc(filters.trajectory_from_text || "") + '"></label><label>结束时间<input id="trajectory-to" type="datetime-local" value="' + esc(filters.trajectory_to_text || "") + '"></label></div><div class="filter-actions"><button class="btn primary" data-run-user-trajectory>查询轨迹</button><span class="muted">默认查询最近 30 天。</span></div></section>' + trajectoryResult);
    }
    function clientProfileTable(rows) {
        if (!rows.length) return '<div class="empty">暂无客户端分类数据，请先执行历史 UA 回填</div>';
        return '<table><thead><tr><th>客户端</th><th>版本</th><th>平台</th><th>用户数</th><th>访问次数</th><th>首次访问</th><th>最近访问</th></tr></thead><tbody>' + rows.map(function (x) {
            return '<tr><td>' + esc(x.client_family || "未分类") + '</td><td>' + esc(x.client_version || "-") + '</td><td>' + esc(x.client_platform || "未知") + '</td><td>' + x.user_count + '</td><td>' + x.access_count + '</td><td>' + time(x.first_access_at) + '</td><td>' + time(x.last_access_at) + '</td></tr>';
        }).join("") + '</tbody></table>';
    }
    function logTable(rows, options) {
        options = options || {};
        var showUaTrust = options.showUaTrust !== false;
        if (!rows.length) return '<div class="empty">暂无访问记录</div>';
        return (
            "<table><thead><tr><th>时间</th><th>用户</th><th>接口类型</th><th>访问方式</th><th>IP</th><th>原始 UA</th>" +
            (showUaTrust ? "<th>UA 可信度</th>" : "") +
            "<th>会话/设备</th><th>状态</th><th>大小</th><th>耗时</th></tr></thead><tbody>" +
            rows
                .map(function (x) {
                    var endpoint = accessEndpointMeta(x.endpoint);
                    return (
                        "<tr><td>" +
                        time(x.requested_at) +
                        "</td><td>" +
                        esc(x.email || x.user_id) +
                        "</td><td>" +
                        esc(endpoint.label) +
                        '<br><span class="muted">' +
                        esc(x.endpoint) +
                        "</span></td><td>" +
                        badge(
                            endpoint.client,
                            endpoint.client === "订阅客户端" ? "medium" : "ok",
                        ) +
                        "</td><td>" +
                        esc(x.request_ip) +
                        '</td><td><span class="ua-text" title="' +
                        esc(x.user_agent || "客户端未提供 UA") +
                        '">' +
                        esc(x.user_agent || "客户端未提供 UA") +
                        "</span><br>" + (x.user_agent ? '<button class="btn compact" data-same-ua="' + esc(x.user_agent) + '">查找相同 UA 用户</button>' : '') + '<br><span class="muted">' + esc((x.client_family || "未分类") + (x.client_version ? " " + x.client_version : "") + " · " + (x.client_platform || "未知")) + "</span></td>" +
                        (showUaTrust
                            ? "<td>" +
                              badge(
                                  uaTrustLabel(x.user_agent),
                                  x.user_agent ? "medium" : "",
                              ) +
                              "</td>"
                            : "") +
                        "<td>" +
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
                ? '<div class="batch-toolbar"><label class="check"><input type="checkbox" data-select-targets> 全选</label><span data-target-selected>已选择 0 个</span><button class="btn" data-target-batch="pause" disabled>批量暂停</button><button class="btn" data-target-batch="resume" disabled>批量恢复</button><button class="btn danger" data-target-batch="remove" disabled>批量移除</button></div><div class="table-wrap"><table><thead><tr><th></th><th>节点</th><th>名称</th><th>地址 / 端口</th><th>监控状态</th><th>判断</th><th>国内成功/失败</th><th>海外成功/失败</th><th>首次监控正常</th><th>连续异常</th><th>最后探测 / 分析</th><th>操作</th></tr></thead><tbody>' +
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
                                      : x.status === "suspected_blocked" ||
                                          x.status === "suspected_domestic_blocked" ||
                                          x.status === "suspected_overseas_blocked"
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
                              (x.first_healthy_at
                                  ? time(x.first_healthy_at)
                                  : '<span class="muted">未建立基线<br>不自动创建事件</span>') +
                              "</td><td>" +
                              x.consecutive_failures +
                              "</td><td>" +
                              time(x.last_checked_at) +
                              '<br><span class="muted">分析 ' +
                              time(x.last_analyzed_at) +
                              "</span>" +
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
            '<div class="toolbar"><button class="btn primary" data-read-all-alerts>全部标为已读</button><span class="muted">一次性将所有未读安全告警设为已读</span></div><section class="panel">' +
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
                "probe_domestic_min_success",
                "国内最少成功探测点",
                "number",
                "达到此数量并同时满足国内成功比例，国内方向才算正常",
            ],
            [
                "probe_overseas_min_success",
                "海外最少成功探测点",
                "number",
                "达到此数量并同时满足海外成功比例，海外方向才算正常",
            ],
            [
                "probe_domestic_success_ratio",
                "国内成功比例（%）",
                "number",
                "国内成功数 ÷ 国内有效探测点数，范围 1～100",
            ],
            [
                "probe_overseas_success_ratio",
                "海外成功比例（%）",
                "number",
                "海外成功数 ÷ 海外有效探测点数，范围 1～100",
            ],
            [
                "probe_recovery_success_rounds",
                "恢复正常轮数",
                "number",
                "连续满足国内和海外正常条件后恢复；设置 1 表示立即恢复",
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
        var groups = [
            {
                title: "节点正常判定",
                description: "控制国内、海外探测结果达到什么条件时判定正常，以及异常和恢复需要持续多少轮。",
                keys: [
                    "probe_domestic_min_success",
                    "probe_overseas_min_success",
                    "probe_domestic_success_ratio",
                    "probe_overseas_success_ratio",
                    "probe_recovery_success_rounds",
                    "probe_failures_to_event",
                ],
            },
            {
                title: "私有探测调度",
                description: "控制探测频率、结果有效期、分析周期和管理页面刷新频率。",
                keys: [
                    "probe_interval_seconds",
                    "health_timeout_seconds",
                    "probe_result_window_seconds",
                    "security_analysis_interval_minutes",
                    "probe_page_refresh_seconds",
                ],
            },
            {
                title: "访问取证与风险关联",
                description: "控制访问记录保留、封锁事件关联窗口和多账号特征识别。",
                keys: [
                    "retention_days",
                    "risk_window_seconds",
                    "multi_account_ip_threshold",
                ],
            },
            {
                title: "自动处置与告警",
                description: "控制原有水印探测告警、自动停止节点下发以及外部通知。",
                keys: [
                    "health_failures_to_alert",
                    "auto_suspend_score",
                    "alert_webhook_url",
                ],
            },
        ];
        function renderSettingField(f) {
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
        }
        return (
            '<form id="settings-form"><section class="panel settings-switch-panel"><div class="settings-section-head"><div><h2>功能开关</h2><p>集中控制安全审计、自动探测和疑似事件登记。</p></div></div><div class="setting-toggles">' +
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
            '</div></section><div class="settings-groups">' +
            groups
                .map(function (group) {
                    return (
                        '<section class="panel settings-group"><div class="settings-section-head"><div><h2>' +
                        group.title +
                        "</h2><p>" +
                        group.description +
                        '</p></div><span class="settings-count">' +
                        group.keys.length +
                        ' 项</span></div><div class="settings-grid">' +
                        group.keys
                            .map(function (key) {
                                return renderSettingField(
                                    fields.find(function (f) {
                                        return f[0] === key;
                                    }),
                                );
                            })
                            .join("") +
                        "</div></section>"
                    );
                })
                .join("") +
            '</div><div class="settings-savebar"><div><b data-settings-status>设置尚未修改</b><span>保存后立即生效，无需重新加载页面。自动事件只进入待确认队列。</span></div><button class="btn primary settings-save-button" data-settings-submit type="submit"><span class="save-spinner" aria-hidden="true"></span><span data-settings-button-text>保存全部设置</span></button></div></form>'
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
    function modal(title, body, options) {
        options = options || {};
        state.modalParent = options.parent || null;
        state.modal =
            '<div class="modal"><div class="modal-box ' +
            esc(options.boxClass || "") +
            '"><div class="modal-header"><h2>' +
            title +
            '</h2><button class="btn modal-close" data-close aria-label="关闭弹窗">关闭</button></div><div class="modal-body">' +
            body +
            "</div></div></div>";
        render();
    }
    function eventDetailModal(d) {
        var e = d.event || {},
            s = d.summary || {},
            snapshot = d.snapshot || {},
            evidence = d.evidence || {},
            candidates = d.candidates || [],
            logs = d.access_logs || [];
        var candidateRows = candidates.length
            ? candidates
                  .map(function (x) {
                      return (
                          '<tr><td><input type="checkbox" data-candidate-user value="' +
                          x.user_id +
                          '"></td><td><b>' +
                          esc(x.email) +
                          '</b><br><span class="muted">ID ' +
                          x.user_id +
                          "</span><br>" +
                          badge(x.banned ? "已封禁" : "正常", x.banned ? "critical" : "ok") +
                          "</td><td><b>" +
                          x.access_count +
                          "</b> 次</td><td>" +
                          x.unique_ips +
                          " / " +
                          x.unique_devices +
                          '</td><td><span class="delta">封锁前 ' +
                          x.closest_seconds +
                          ' 秒</span></td><td><button class="btn" data-user="' +
                          x.user_id +
                          '">查看用户</button> <button class="btn" data-user-snapshots="' + x.user_id + '">快照轨迹</button></td></tr>'
                      );
                  })
                  .join("")
            : '<tr><td colspan="6" class="empty">' +
              (evidence.snapshot_linked
                  ? "关联窗口内没有用户命中该节点快照"
                  : "事件未关联节点快照，不展示候选用户") +
              "</td></tr>";
        var logRows = logs.length
            ? logs
                  .map(function (l) {
                      var endpoint = accessEndpointMeta(l.endpoint);
                      var search = [
                          l.email,
                          l.user_id,
                          l.request_ip,
                          l.endpoint,
                          endpoint.label,
                          endpoint.client,
                          l.user_agent,
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
                          esc(endpoint.label) +
                          '<br><span class="muted">' +
                          esc(l.endpoint) +
                          " · " +
                          esc(endpoint.client) +
                          "</span>" +
                          "</td><td>" +
                          esc(l.request_ip) +
                          '</td><td><span class="ua-text" title="' +
                          esc(l.user_agent || "客户端未提供 UA") +
                          '">' +
                          esc(l.user_agent || "客户端未提供 UA") +
                          '</span><br><span class="muted">' +
                          esc(uaTrustLabel(l.user_agent)) +
                          " · 设备 " +
                          esc((l.device_hash || "-").slice(0, 12)) +
                          "</span>" +
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
                '</span></div><div class="muted">首次监控正常：' +
                time(e.monitoring_first_healthy_at) +
                " · 首次失败：" +
                time(e.first_failed_at) +
                (e.detected_at ? " · 达到阈值：" + time(e.detected_at) : "") +
                " · 快照：" +
                esc(snapshot.version || e.snapshot_id || "未关联") +
                "</div><div class=\"muted\">候选范围：" +
                time(s.window_start_at) +
                " ～ " +
                time(s.window_end_at) +
                " · 后台窗口：" +
                esc(s.configured_window_seconds || 0) +
                " 秒 · 本次有效窗口：" +
                esc(s.window_seconds || 0) +
                " 秒</div></div><div>" +
                badge(eventTypeLabel(e.event_type), e.event_type) +
                " " +
                badge(eventStatusLabel(e.status), e.status) +
                '</div></div><div class="event-evidence ' +
                (evidence.snapshot_linked ? "verified" : "missing") +
                '"><b>' +
                (evidence.snapshot_linked ? "精确快照证据" : "仅有网络异常证据") +
                "</b><span>" +
                esc(evidence.message || "暂无证据说明") +
                '</span></div><div class="event-summary"><div><b>' +
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
                '">标记已恢复</button></div><section class="timeline-section"><div class="timeline-heading"><h3>候选用户（按访问次数排序）</h3><div class="timeline-tools"><label class="check"><input type="checkbox" data-candidate-user-all> 全选</label><button class="btn danger" data-candidate-batch="ban" data-event-id="' +
                e.id +
                '" disabled>批量封禁</button><button class="btn primary" data-candidate-group data-event-id="' +
                e.id +
                '" disabled>分配权限组</button><button class="btn" data-candidate-batch="unban" data-event-id="' +
                e.id +
                '" disabled>批量解封</button></div></div><div class="table-wrap"><table><thead><tr><th></th><th>用户</th><th>访问</th><th>IP / 设备</th><th>最近访问</th><th>操作</th></tr></thead><tbody>' +
                candidateRows +
                '</tbody></table></div></section><section class="timeline-section"><div class="timeline-heading"><h3>完整访问时间线</h3><div class="timeline-tools"><input id="timeline-search" placeholder="搜索邮箱、ID、IP、接口"><label class="check"><input id="timeline-near" type="checkbox"> 仅看封锁前 60 秒</label></div></div><div class="table-wrap timeline-table"><table><thead><tr><th>访问时间</th><th>用户</th><th>接口</th><th>IP</th><th>客户端 / 设备</th><th>响应</th></tr></thead><tbody>' +
                logRows +
                "</tbody></table></div></section>",
        );
        var box = root.querySelector(".modal-box");
        if (box) box.classList.add("modal-wide");
    }
    function candidateGroupModal(groups, userIds, eventId, parentModal) {
        modal(
            "分配候选用户权限组",
            '<form id="candidate-group-form" data-users="' +
                esc(userIds.join(",")) +
                '" data-event-id="' +
                eventId +
                '"><div class="form-grid"><div class="span2 edit-note">已选择 <b>' +
                userIds.length +
                '</b> 名候选用户。此操作只修改权限组，不修改套餐、流量和到期时间。</div><label class="span2">目标权限组<select name="group_id" required><option value="">请选择权限组</option>' +
                groups.map(function (group) {
                    return '<option value="' + group.id + '">' + esc(group.name) + "（ID " + group.id + "）</option>";
                }).join("") +
                '</select></label><div class="span2 modal-actions"><button type="button" class="btn" data-close>取消</button><button type="submit" class="btn primary">确认分配</button></div></div></form>',
            { parent: parentModal },
        );
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
        if (state.page === "snapshot_analysis") {
            var snapshotFilters = state.filters.snapshot_analysis || {};
            api("snapshot-analysis/catalog?page=" + state.pageNo + queryString({
                search: snapshotFilters.search || "",
                server_type: snapshotFilters.server_type || "",
                server_id: snapshotFilters.server_id || "",
            }))
                .then(function (catalog) {
                    state.data = { catalog: catalog };
                    state.loading = false;
                    render();
                })
                .catch(function (e) { state.error = e.message; state.loading = false; render(); });
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
                state.modal = state.modalParent;
                state.modalParent = null;
                render();
            };
        });
        root.querySelectorAll("[data-goto]").forEach(function (x) {
            x.onclick = function () {
                state.pageNo = Number(x.dataset.goto);
                load();
            };
        });
        root.querySelectorAll("[data-snapshot-mode]").forEach(function (button) {
            button.onclick = function () {
                state.filters.snapshot_analysis.mode = button.dataset.snapshotMode;
                state.snapshotResult = null;
                render();
            };
        });
        root.querySelectorAll("[data-snapshot-select]").forEach(function (input) {
            input.onchange = function () {
                var id = Number(input.value);
                if (input.checked && state.snapshotSelection.length >= 10 && state.snapshotSelection.indexOf(id) === -1) {
                    input.checked = false;
                    alert("最多同时选择 10 个快照");
                    return;
                }
                if (input.checked && state.snapshotSelection.indexOf(id) === -1) state.snapshotSelection.push(id);
                if (!input.checked) state.snapshotSelection = state.snapshotSelection.filter(function (selectedId) { return selectedId !== id; });
                render();
            };
        });
        var filterSnapshots = root.querySelector("[data-filter-snapshots]");
        if (filterSnapshots) filterSnapshots.onclick = function () {
            state.filters.snapshot_analysis.search = root.querySelector("#snapshot-search").value.trim();
            state.filters.snapshot_analysis.server_type = root.querySelector("#snapshot-type").value.trim();
            state.filters.snapshot_analysis.server_id = root.querySelector("#snapshot-server-id").value;
            state.pageNo = 1;
            load();
        };
        var clearSnapshotSelection = root.querySelector("[data-clear-snapshot-selection]");
        if (clearSnapshotSelection) clearSnapshotSelection.onclick = function () { state.snapshotSelection = []; state.snapshotResult = null; render(); };
        function comparisonPath(page) {
            var filters = state.filters.snapshot_analysis;
            return "snapshot-analysis/compare?page=" + (page || 1) + "&snapshot_ids=" + encodeURIComponent(state.snapshotSelection.join(",")) + queryString({
                scope: filters.scope || "all", date_from: filters.date_from || "", date_to: filters.date_to || "",
            });
        }
        function runSnapshotComparison(page) {
            state.loading = true; render();
            api(comparisonPath(page)).then(function (data) { state.snapshotResult = { type: "compare", data: data }; state.loading = false; render(); })
                .catch(function (error) { state.error = error.message; state.loading = false; render(); });
        }
        var runComparison = root.querySelector("[data-run-snapshot-compare]");
        if (runComparison) runComparison.onclick = function () {
            var filters = state.filters.snapshot_analysis;
            filters.date_from_text = root.querySelector("#snapshot-from").value;
            filters.date_to_text = root.querySelector("#snapshot-to").value;
            filters.date_from = filters.date_from_text ? Math.floor(new Date(filters.date_from_text).getTime() / 1000) : "";
            filters.date_to = filters.date_to_text ? Math.floor(new Date(filters.date_to_text).getTime() / 1000) : "";
            filters.scope = root.querySelector("#snapshot-scope").value;
            runSnapshotComparison(1);
        };
        function trajectoryPath(page) {
            var filters = state.filters.snapshot_analysis;
            return "snapshot-analysis/user?page=" + (page || 1) + queryString({ identity: filters.trajectory_user || "", snapshot_id: filters.trajectory_snapshot || "", date_from: filters.trajectory_from || "", date_to: filters.trajectory_to || "" });
        }
        function runUserTrajectory(page) {
            state.loading = true; state.error = ""; render();
            api(trajectoryPath(page)).then(function (data) {
                if (data && data.lookup_error) { state.error = data.lookup_error; state.snapshotResult = null; }
                else { state.error = ""; state.snapshotResult = { type: "user", data: data }; }
                state.loading = false; render();
            })
                .catch(function (error) { state.error = error.message; state.loading = false; render(); });
        }
        var runTrajectory = root.querySelector("[data-run-user-trajectory]");
        if (runTrajectory) runTrajectory.onclick = function () {
            var filters = state.filters.snapshot_analysis;
            filters.trajectory_user = root.querySelector("#trajectory-user").value.trim();
            filters.trajectory_snapshot = root.querySelector("#trajectory-snapshot").value;
            filters.trajectory_from_text = root.querySelector("#trajectory-from").value;
            filters.trajectory_to_text = root.querySelector("#trajectory-to").value;
            filters.trajectory_from = filters.trajectory_from_text ? Math.floor(new Date(filters.trajectory_from_text).getTime() / 1000) : "";
            filters.trajectory_to = filters.trajectory_to_text ? Math.floor(new Date(filters.trajectory_to_text).getTime() / 1000) : "";
            if (!filters.trajectory_user) { state.error = "请输入用户 ID 或完整邮箱"; render(); return; }
            runUserTrajectory(1);
        };
        root.querySelectorAll("[data-snapshot-page]").forEach(function (button) {
            button.onclick = function () {
                var page = Number(button.dataset.pageNo);
                if (button.dataset.snapshotPage === "catalog") { state.pageNo = page; load(); }
                else if (button.dataset.snapshotPage === "compare") runSnapshotComparison(page);
                else runUserTrajectory(page);
            };
        });
        root.querySelectorAll("[data-user-snapshots]").forEach(function (button) {
            button.onclick = function () {
                state.page = "snapshot_analysis";
                state.pageNo = 1;
                state.filters.snapshot_analysis.mode = "user";
                state.filters.snapshot_analysis.trajectory_user = button.dataset.userSnapshots;
                state.snapshotResult = null;
                state.modal = null;
                state.modalParent = null;
                history.replaceState(null, "", cfg.adminUrl + "/security/snapshot_analysis");
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
        function selectedCandidateUsers() {
            return Array.from(root.querySelectorAll("[data-candidate-user]:checked")).map(function (input) {
                return Number(input.value);
            });
        }
        function updateCandidateBatchButtons() {
            var count = selectedCandidateUsers().length;
            root.querySelectorAll("[data-candidate-batch]").forEach(function (button) {
                button.disabled = count === 0;
                button.textContent = (button.dataset.candidateBatch === "ban" ? "批量封禁" : "批量解封") + (count ? "（" + count + "）" : "");
            });
            var groupButton = root.querySelector("[data-candidate-group]");
            if (groupButton) {
                groupButton.disabled = count === 0;
                groupButton.textContent = "分配权限组" + (count ? "（" + count + "）" : "");
            }
            var all = root.querySelector("[data-candidate-user-all]");
            var boxes = Array.from(root.querySelectorAll("[data-candidate-user]"));
            if (all) {
                all.checked = boxes.length > 0 && boxes.every(function (input) { return input.checked; });
                all.indeterminate = boxes.some(function (input) { return input.checked; }) && !all.checked;
            }
        }
        root.querySelectorAll("[data-candidate-user]").forEach(function (input) {
            input.onchange = updateCandidateBatchButtons;
        });
        var candidateAll = root.querySelector("[data-candidate-user-all]");
        if (candidateAll) candidateAll.onchange = function () {
            root.querySelectorAll("[data-candidate-user]").forEach(function (input) { input.checked = candidateAll.checked; });
            updateCandidateBatchButtons();
        };
        root.querySelectorAll("[data-candidate-batch]").forEach(function (button) {
            button.onclick = function () {
                var ids = selectedCandidateUsers();
                if (!ids.length) return;
                var action = button.dataset.candidateBatch;
                var label = action === "ban" ? "封禁" : "解封";
                if (!confirm("确认批量" + label + "选中的 " + ids.length + " 名候选用户？")) return;
                button.disabled = true;
                button.textContent = "正在" + label + "……";
                api("users/batch-ban", { method: "POST", body: { user_ids: ids, action: action } })
                    .then(function (result) {
                        alert(label + "完成：匹配 " + result.matched + " 人，实际修改 " + result.affected + " 人。");
                        return api("event/detail?id=" + button.dataset.eventId);
                    })
                    .then(eventDetailModal)
                    .catch(function (error) {
                        state.error = error.message;
                        render();
                    });
            };
        });
        var candidateGroup = root.querySelector("[data-candidate-group]");
        if (candidateGroup) candidateGroup.onclick = function () {
            var ids = selectedCandidateUsers();
            if (!ids.length) return;
            var parentModal = state.modal;
            candidateGroup.disabled = true;
            candidateGroup.textContent = "正在加载……";
            api("groups")
                .then(function (groups) { candidateGroupModal(groups || [], ids, candidateGroup.dataset.eventId, parentModal); })
                .catch(function (error) { state.error = error.message; render(); });
        };
        var candidateGroupForm = root.querySelector("#candidate-group-form");
        if (candidateGroupForm) candidateGroupForm.onsubmit = function (event) {
            event.preventDefault();
            var groupId = Number(candidateGroupForm.elements.group_id.value);
            var ids = candidateGroupForm.dataset.users.split(",").filter(Boolean).map(Number);
            if (!groupId || !ids.length) return;
            var submit = candidateGroupForm.querySelector('[type="submit"]');
            submit.disabled = true;
            submit.textContent = "正在分配……";
            api("users/batch-group", { method: "POST", body: { user_ids: ids, group_id: groupId } })
                .then(function (result) {
                    alert("权限组分配完成：匹配 " + result.matched + " 人，实际修改 " + result.affected + " 人，目标权限组：" + result.group_name + "。");
                    return api("event/detail?id=" + candidateGroupForm.dataset.eventId);
                })
                .then(eventDetailModal)
                .catch(function (error) {
                    submit.disabled = false;
                    submit.textContent = "确认分配";
                    state.error = error.message;
                    render();
                });
        };
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
                var parentModal = state.modal;
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
                            '</p><div class="toolbar"><button class="btn" data-user-action="watch">观察</button><button class="btn" data-user-action="trust">可信</button><button class="btn danger" data-user-action="clear_sessions">清除会话</button><button class="btn danger" data-user-action="ban">封禁</button></div><h3 class="profile-section-title">最近访问与客户端 UA</h3>' +
                            logTable(d.logs || [], { showUaTrust: false }),
                        {
                            boxClass: "modal-profile-wide",
                            parent: parentModal,
                        },
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
        root.querySelectorAll("[data-manage-entry]").forEach(function (x) {
            x.onclick = function () { entryPoolModal(((state.data || {}).data || [])[Number(x.dataset.manageEntry)]); };
        });
        var entrySettingForm = root.querySelector("#entry-setting-form");
        if (entrySettingForm) entrySettingForm.onsubmit = function (event) {
            event.preventDefault();
            var data = formData(entrySettingForm);
            data.server_type = entrySettingForm.dataset.type;
            data.server_id = Number(entrySettingForm.dataset.id);
            data.check_interval = Number(data.check_interval);
            api("entry-setting/save", { method: "POST", body: data })
                .then(function () { return refreshEntryPoolModal(data.server_type, data.server_id); })
                .catch(function (error) { state.error = error.message; render(); });
        };
        root.querySelectorAll(".entry-form").forEach(function (form) {
            form.onsubmit = function (event) {
                event.preventDefault();
                var data = formData(form);
                data.id = form.dataset.entryId ? Number(form.dataset.entryId) : null;
                data.server_type = form.dataset.type;
                data.server_id = Number(form.dataset.serverId);
                data.port = Number(data.port);
                data.priority = Number(data.priority);
                api("entry/save", { method: "POST", body: data })
                    .then(function () { return refreshEntryPoolModal(data.server_type, data.server_id); })
                    .catch(function (error) { state.error = error.message; render(); });
            };
        });
        root.querySelectorAll("[data-edit-entry]").forEach(function (button) {
            button.onclick = function () {
                var node = ((state.data || {}).data || []).find(function (item) { return (item.entries || []).some(function (entry) { return Number(entry.id) === Number(button.dataset.editEntry); }); });
                var entry = node && node.entries.find(function (item) { return Number(item.id) === Number(button.dataset.editEntry); });
                if (node && entry) modal("编辑入口 · " + node.server_name, entryFormHtml(node, entry), { parent: state.modal });
            };
        });
        root.querySelectorAll("[data-delete-entry]").forEach(function (button) {
            button.onclick = function () {
                if (!confirm("确认删除这个入口？已下载到客户端的旧配置不会被远程删除。")) return;
                var node = ((state.data || {}).data || []).find(function (item) { return (item.entries || []).some(function (entry) { return Number(entry.id) === Number(button.dataset.deleteEntry); }); });
                api("entry/delete", { method: "POST", body: { id: Number(button.dataset.deleteEntry) } })
                    .then(function () { return node ? refreshEntryPoolModal(node.server_type, node.server_id) : load(); })
                    .catch(function (error) { state.error = error.message; render(); });
            };
        });
        var fl = root.querySelector("[data-filter-logs]");
        if (fl)
            fl.onclick = function () {
                var from = root.querySelector("#log-from").value;
                var to = root.querySelector("#log-to").value;
                state.filters.logs = {
                    view: root.querySelector("#log-view").value,
                    user_id: root.querySelector("#log-user").value,
                    search: root.querySelector("#log-search").value,
                    ip: root.querySelector("#log-ip").value,
                    ua: root.querySelector("#log-ua").value,
                    ua_match: root.querySelector("#log-ua-match").value,
                    client_family: root.querySelector("#log-family").value,
                    client_version: root.querySelector("#log-version").value,
                    client_platform: root.querySelector("#log-platform").value,
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
        root.querySelectorAll("[data-same-ua]").forEach(function (x) {
            x.onclick = function () {
                state.filters.logs = {
                    view: "users",
                    ua: x.dataset.sameUa,
                    ua_match: "exact",
                };
                state.pageNo = 1;
                load();
            };
        });
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
        var readAllAlerts = root.querySelector("[data-read-all-alerts]");
        if (readAllAlerts)
            readAllAlerts.onclick = function () {
                readAllAlerts.disabled = true;
                readAllAlerts.textContent = "正在处理…";
                api("alerts/read-all", { method: "POST", body: {} })
                    .then(function (result) {
                        readAllAlerts.textContent =
                            result.affected > 0
                                ? "已读取 " + result.affected + " 条"
                                : "没有未读告警";
                        setTimeout(load, 700);
                    })
                    .catch(function (error) {
                        readAllAlerts.disabled = false;
                        readAllAlerts.textContent = "重试全部标为已读";
                        state.error = error.message;
                    });
            };
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
        if (sf) {
            sf.querySelectorAll("input, select, textarea").forEach(function (input) {
                input.addEventListener("change", function () {
                    var status = sf.querySelector("[data-settings-status]");
                    if (status && !status.classList.contains("saving")) {
                        status.className = "changed";
                        status.textContent = "● 有未保存的更改";
                    }
                });
            });
            sf.onsubmit = function (e) {
                e.preventDefault();
                var d = formData(sf);
                var button = sf.querySelector("[data-settings-submit]");
                var buttonText = sf.querySelector("[data-settings-button-text]");
                var status = sf.querySelector("[data-settings-status]");
                Object.keys(d).forEach(function (k) {
                    if (sf.elements[k] && sf.elements[k].type === "number")
                        d[k] = Number(d[k]);
                });
                button.disabled = true;
                button.classList.add("saving");
                buttonText.textContent = "正在保存…";
                status.className = "saving";
                status.textContent = "正在保存设置";
                api("settings", { method: "POST", body: d })
                    .then(function (saved) {
                        state.data = saved;
                        sf.dataset.saved = "1";
                        state.error = "";
                        status.className = "success";
                        status.textContent = "✓ 设置已保存并生效";
                        buttonText.textContent = "保存成功";
                        setTimeout(function () {
                            if (!button.isConnected) return;
                            buttonText.textContent = "保存全部设置";
                            status.className = "";
                            status.textContent = "设置已保存";
                        }, 2200);
                    })
                    .catch(function (error) {
                        status.className = "failed";
                        status.textContent = "保存失败：" + error.message;
                        buttonText.textContent = "重新保存";
                    })
                    .finally(function () {
                        if (!button.isConnected) return;
                        button.disabled = false;
                        button.classList.remove("saving");
                    });
            };
        }
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
