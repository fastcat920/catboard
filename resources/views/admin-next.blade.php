<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no">
    <title>{{ $title }}</title>
    <script>
        window.settings = @json([
            'title' => $title,
            'host' => '',
            'secure_path' => $secure_path,
            'admin_base_path' => $admin_base_path,
            'theme' => [
                'sidebar' => $theme_sidebar,
                'header' => $theme_header,
                'color' => $theme_color,
            ],
            'background_url' => $background_url,
            'logo' => $logo,
        ]);
    </script>
    @foreach (($admin_entry['css'] ?? []) as $stylesheet)
        <link rel="stylesheet" href="/assets/admin-app/{{ $stylesheet }}?v={{ $version }}">
    @endforeach
</head>
<body>
<div id="root"></div>
<script type="module" src="/assets/admin-app/{{ $admin_entry['file'] }}?v={{ $version }}"></script>
</body>
</html>
