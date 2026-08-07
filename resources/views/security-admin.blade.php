<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>节点安全 - {{$title}}</title>
    <script>window.nodeSecurity={securePath:@json($secure_path),adminUrl:@json('/'.$secure_path)};</script>
    <link rel="stylesheet" href="/assets/security-admin/app.css?v={{$version}}">
</head>
<body>
<div id="app"><div class="boot">正在加载节点安全中心…</div></div>
<script src="/assets/security-admin/app.js?v={{$version}}"></script>
</body>
</html>
