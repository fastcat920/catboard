<?php

use App\Services\ThemeService;
use App\Support\ContentLocale;
use Illuminate\Http\Request;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/

Route::get('/', function (Request $request) {
    if (config('v2board.app_url') && config('v2board.safe_mode_enable', 0)) {
        if ($request->server('HTTP_HOST') !== parse_url(config('v2board.app_url'))['host']) {
            abort(403);
        }
    }
    $renderParams = [
        'title' => ContentLocale::value(config('v2board.app_name', 'V2Board'), config('v2board.app_name_en'), $request),
        'title_zh' => config('v2board.app_name', 'V2Board'),
        'title_en' => config('v2board.app_name_en'),
        'theme' => config('v2board.frontend_theme', 'default'),
        'version' => config('app.version'),
        'description' => ContentLocale::value(config('v2board.app_description', 'V2Board is best'), config('v2board.app_description_en'), $request),
        'description_zh' => config('v2board.app_description', 'V2Board is best'),
        'description_en' => config('v2board.app_description_en'),
        'logo' => config('v2board.logo')
    ];

    if (!config("theme.{$renderParams['theme']}")) {
        $themeService = new ThemeService($renderParams['theme']);
        $themeService->init();
    }

    $renderParams['theme_config'] = (new ThemeService($renderParams['theme']))->resolvedConfig();
    return view('theme::' . config('v2board.frontend_theme', 'default') . '.dashboard', $renderParams);
});

$securePath = config('v2board.secure_path', config('v2board.frontend_admin_path', hash('crc32b', config('app.key'))));

// 旧压缩版管理端仅作为应急回退，不再承担正式入口。
Route::get('/' . $securePath . '/legacy/{path?}', function () use ($securePath) {
    return view('admin', [
        'title' => config('v2board.app_name', 'V2Board'),
        'theme_sidebar' => config('v2board.frontend_theme_sidebar', 'light'),
        'theme_header' => config('v2board.frontend_theme_header', 'dark'),
        'theme_color' => config('v2board.frontend_theme_color', 'default'),
        'background_url' => config('v2board.frontend_background_url'),
        'version' => config('app.version'),
        'logo' => config('v2board.logo'),
        'secure_path' => $securePath
    ]);
})->where('path', '.*');

// 兼容迁移阶段使用过的 /v2 地址，统一跳转到正式源码管理端。
Route::get('/' . $securePath . '/v2/{path?}', function ($path = null) use ($securePath) {
    return redirect('/' . $securePath . ($path ? '/' . $path : ''));
})->where('path', '.*');

// Catboard 正式管理端：React 源码与 Laravel 同仓维护，刷新任意子路由均由此入口接管。
Route::get('/' . $securePath . '/{path?}', function () use ($securePath) {
    $manifestPath = public_path('assets/admin-app/.vite/manifest.json');
    if (!is_file($manifestPath)) {
        abort(503, '新管理端尚未构建，请先在 admin-ui 目录执行 pnpm build');
    }

    $manifest = json_decode(file_get_contents($manifestPath), true);
    $entry = $manifest['index.html'] ?? null;
    if (!$entry || empty($entry['file'])) {
        abort(503, '新管理端构建产物不完整');
    }

    // Keep JSON construction out of Blade. Some Laravel 8 Blade compiler
    // versions cannot reliably parse a multiline @json array expression.
    $settings = [
        'title' => config('v2board.app_name', 'V2Board'),
        'host' => '',
        'secure_path' => $securePath,
        'admin_base_path' => '/' . $securePath,
        'theme' => [
            'sidebar' => config('v2board.frontend_theme_sidebar', 'light'),
            'header' => config('v2board.frontend_theme_header', 'dark'),
            'color' => config('v2board.frontend_theme_color', 'default'),
        ],
        'background_url' => config('v2board.frontend_background_url'),
        'logo' => config('v2board.logo'),
    ];

    return view('admin-next', [
        'title' => config('v2board.app_name', 'V2Board'),
        'version' => config('app.version'),
        'settings_json' => json_encode(
            $settings,
            JSON_UNESCAPED_UNICODE
                | JSON_UNESCAPED_SLASHES
                | JSON_HEX_TAG
                | JSON_HEX_AMP
                | JSON_HEX_APOS
                | JSON_HEX_QUOT
        ),
        'admin_entry' => $entry,
    ]);
})->where('path', '.*');

if (!empty(config('v2board.subscribe_path'))) {
    Route::get(config('v2board.subscribe_path'), 'V1\\Client\\ClientController@subscribe')->middleware('client');
}
