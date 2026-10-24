<?php
namespace App\Http\Routes\V1;

use Illuminate\Contracts\Routing\Registrar;

class AdminRoute
{
    public function map(Registrar $router)
    {
        $router->group([
            'prefix' => config('v2board.secure_path', config('v2board.frontend_admin_path', hash('crc32b', config('app.key')))),
            'middleware' => ['admin', 'log'],
        ], function ($router) {
            // Config
            $router->get ('/config/fetch', 'V1\\Admin\\ConfigController@fetch');
            $router->post('/config/save', 'V1\\Admin\\ConfigController@save');
            $router->get ('/config/getEmailTemplate', 'V1\\Admin\\ConfigController@getEmailTemplate');
            $router->get ('/config/getThemeTemplate', 'V1\\Admin\\ConfigController@getThemeTemplate');
            $router->post('/config/setTelegramWebhook', 'V1\\Admin\\ConfigController@setTelegramWebhook');
            $router->post('/config/testSendMail', 'V1\\Admin\\ConfigController@testSendMail');
            // Plan
            $router->get ('/plan/fetch', 'V1\\Admin\\PlanController@fetch');
            $router->post('/plan/save', 'V1\\Admin\\PlanController@save');
            $router->post('/plan/drop', 'V1\\Admin\\PlanController@drop');
            $router->post('/plan/update', 'V1\\Admin\\PlanController@update');
            $router->post('/plan/sort', 'V1\\Admin\\PlanController@sort');
            // Server
            $router->get ('/server/group/fetch', 'V1\\Admin\\Server\\GroupController@fetch');
            $router->post('/server/group/save', 'V1\\Admin\\Server\\GroupController@save');
            $router->post('/server/group/drop', 'V1\\Admin\\Server\\GroupController@drop');
            $router->get ('/server/route/fetch', 'V1\\Admin\\Server\\RouteController@fetch');
            $router->post('/server/route/save', 'V1\\Admin\\Server\\RouteController@save');
            $router->post('/server/route/drop', 'V1\\Admin\\Server\\RouteController@drop');
            $router->get ('/server/manage/getNodes', 'V1\\Admin\\Server\\ManageController@getNodes');
            $router->post('/server/manage/sort', 'V1\\Admin\\Server\\ManageController@sort');
            $router->group([
                'prefix' => 'server/trojan'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\TrojanController@save');
                $router->post('drop', 'V1\\Admin\\Server\\TrojanController@drop');
                $router->post('update', 'V1\\Admin\\Server\\TrojanController@update');
                $router->post('copy', 'V1\\Admin\\Server\\TrojanController@copy');
            });
            $router->group([
                'prefix' => 'server/vmess'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\VmessController@save');
                $router->post('drop', 'V1\\Admin\\Server\\VmessController@drop');
                $router->post('update', 'V1\\Admin\\Server\\VmessController@update');
                $router->post('copy', 'V1\\Admin\\Server\\VmessController@copy');
            });
            $router->group([
                'prefix' => 'server/shadowsocks'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\ShadowsocksController@save');
                $router->post('drop', 'V1\\Admin\\Server\\ShadowsocksController@drop');
                $router->post('update', 'V1\\Admin\\Server\\ShadowsocksController@update');
                $router->post('copy', 'V1\\Admin\\Server\\ShadowsocksController@copy');
            });
            $router->group([
                'prefix' => 'server/tuic'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\TuicController@save');
                $router->post('drop', 'V1\\Admin\\Server\\TuicController@drop');
                $router->post('update', 'V1\\Admin\\Server\\TuicController@update');
                $router->post('copy', 'V1\\Admin\\Server\\TuicController@copy');
            });
            $router->group([
                'prefix' => 'server/hysteria'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\HysteriaController@save');
                $router->post('drop', 'V1\\Admin\\Server\\HysteriaController@drop');
                $router->post('update', 'V1\\Admin\\Server\\HysteriaController@update');
                $router->post('copy', 'V1\\Admin\\Server\\HysteriaController@copy');
            });
            $router->group([
                'prefix' => 'server/vless'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\VlessController@save');
                $router->post('drop', 'V1\\Admin\\Server\\VlessController@drop');
                $router->post('update', 'V1\\Admin\\Server\\VlessController@update');
                $router->post('copy', 'V1\\Admin\\Server\\VlessController@copy');
            });
            $router->group([
                'prefix' => 'server/anytls'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\AnyTLSController@save');
                $router->post('drop', 'V1\\Admin\\Server\\AnyTLSController@drop');
                $router->post('update', 'V1\\Admin\\Server\\AnyTLSController@update');
                $router->post('copy', 'V1\\Admin\\Server\\AnyTLSController@copy');
            });
            $router->group([
                'prefix' => 'server/v2node'
            ], function ($router) {
                $router->post('save', 'V1\\Admin\\Server\\V2nodeController@save');
                $router->post('drop', 'V1\\Admin\\Server\\V2nodeController@drop');
                $router->post('update', 'V1\\Admin\\Server\\V2nodeController@update');
                $router->post('copy', 'V1\\Admin\\Server\\V2nodeController@copy');
            });
            // Order
            $router->get ('/order/fetch', 'V1\\Admin\\OrderController@fetch');
            $router->post('/order/update', 'V1\\Admin\\OrderController@update');
            $router->post('/order/assign', 'V1\\Admin\\OrderController@assign');
            $router->post('/order/paid', 'V1\\Admin\\OrderController@paid');
            $router->post('/order/cancel', 'V1\\Admin\\OrderController@cancel');
            $router->post('/order/detail', 'V1\\Admin\\OrderController@detail');
            // User
            $router->get ('/user/fetch', 'V1\\Admin\\UserController@fetch');
            $router->post('/user/update', 'V1\\Admin\\UserController@update');
            $router->get ('/user/getUserInfoById', 'V1\\Admin\\UserController@getUserInfoById');
            $router->post('/user/generate', 'V1\\Admin\\UserController@generate');
            $router->post('/user/dumpCSV', 'V1\\Admin\\UserController@dumpCSV');
            $router->post('/user/sendMail', 'V1\\Admin\\UserController@sendMail');
            $router->post('/user/ban', 'V1\\Admin\\UserController@ban');
            $router->post('/user/resetSecret', 'V1\\Admin\\UserController@resetSecret');
            $router->post('/user/delUser', 'V1\\Admin\\UserController@delUser');
            $router->post('/user/allDel', 'V1\\Admin\\UserController@allDel');
            $router->post('/user/batchGroup', 'V1\\Admin\\UserController@batchGroup');
            $router->post('/user/setInviteUser', 'V1\\Admin\\UserController@setInviteUser');
            // Referral growth program
            $router->get ('/referral/dashboard', 'V1\\Admin\\ReferralController@dashboard');
            $router->post('/referral/setting/save', 'V1\\Admin\\ReferralController@saveSetting');
            $router->get ('/referral/levels', 'V1\\Admin\\ReferralController@levels');
            $router->post('/referral/level/save', 'V1\\Admin\\ReferralController@saveLevel');
            $router->post('/referral/level/drop', 'V1\\Admin\\ReferralController@dropLevel');
            $router->get ('/referral/milestones', 'V1\\Admin\\ReferralController@milestones');
            $router->post('/referral/milestone/save', 'V1\\Admin\\ReferralController@saveMilestone');
            $router->post('/referral/milestone/drop', 'V1\\Admin\\ReferralController@dropMilestone');
            $router->get ('/referral/funnel', 'V1\\Admin\\ReferralController@funnel');
            $router->get ('/referral/rewards', 'V1\\Admin\\ReferralController@rewards');
            $router->post('/referral/reward/reverse', 'V1\\Admin\\ReferralController@reverseReward');
            $router->get ('/referral/relations', 'V1\\Admin\\ReferralController@relations');
            $router->get ('/referral/relation/detail', 'V1\\Admin\\ReferralController@relationDetail');
            $router->post('/referral/relation/change', 'V1\\Admin\\ReferralController@changeRelation');
            // Marketing activity center
            $router->get ('/marketing/activities', 'V1\\Admin\\MarketingActivityController@index');
            $router->get ('/marketing/flash-sales', 'V1\\Admin\\MarketingActivityController@flashSales');
            $router->post('/marketing/flash-sale/save', 'V1\\Admin\\MarketingActivityController@saveFlashSale');
            $router->post('/marketing/flash-sale/drop', 'V1\\Admin\\MarketingActivityController@dropFlashSale');
            // Stat
            $router->get ('/stat/getStat', 'V1\\Admin\\StatController@getStat');
            $router->get ('/stat/getOverride', 'V1\\Admin\\StatController@getOverride');
            $router->get ('/stat/getServerLastRank', 'V1\\Admin\\StatController@getServerLastRank');
            $router->get ('/stat/getServerTodayRank', 'V1\\Admin\\StatController@getServerTodayRank');
            $router->get ('/stat/getUserLastRank', 'V1\\Admin\\StatController@getUserLastRank');
            $router->get ('/stat/getUserTodayRank', 'V1\\Admin\\StatController@getUserTodayRank');
            $router->get ('/stat/getOrder', 'V1\\Admin\\StatController@getOrder');
            $router->get ('/stat/getStatUser', 'V1\\Admin\\StatController@getStatUser');
            $router->get ('/stat/getRanking', 'V1\\Admin\\StatController@getRanking');
            $router->get ('/stat/getStatRecord', 'V1\\Admin\\StatController@getStatRecord');
            // Notice
            $router->get ('/notice/fetch', 'V1\\Admin\\NoticeController@fetch');
            $router->post('/notice/save', 'V1\\Admin\\NoticeController@save');
            $router->post('/notice/update', 'V1\\Admin\\NoticeController@update');
            $router->post('/notice/drop', 'V1\\Admin\\NoticeController@drop');
            $router->post('/notice/show', 'V1\\Admin\\NoticeController@show');
            // Ticket
            $router->get ('/ticket/fetch', 'V1\\Admin\\TicketController@fetch');
            $router->post('/ticket/reply', 'V1\\Admin\\TicketController@reply');
            $router->post('/ticket/close', 'V1\\Admin\\TicketController@close');
            // Coupon
            $router->get ('/coupon/fetch', 'V1\\Admin\\CouponCenterController@legacyFetch');
            $router->get ('/coupon/dashboard', 'V1\\Admin\\CouponCenterController@dashboard');
            $router->get ('/coupon/templates', 'V1\\Admin\\CouponCenterController@templates');
            $router->post('/coupon/template/save', 'V1\\Admin\\CouponCenterController@saveTemplate');
            $router->post('/coupon/template/copy', 'V1\\Admin\\CouponCenterController@copyTemplate');
            $router->post('/coupon/template/drop', 'V1\\Admin\\CouponCenterController@dropTemplate');
            $router->post('/coupon/distribution/estimate', 'V1\\Admin\\CouponCenterController@estimate');
            $router->post('/coupon/distribution/create', 'V1\\Admin\\CouponCenterController@createTask');
            $router->get ('/coupon/distribution/tasks', 'V1\\Admin\\CouponCenterController@tasks');
            $router->post('/coupon/distribution/cancel', 'V1\\Admin\\CouponCenterController@cancelTask');
            $router->post('/coupon/distribution/retry', 'V1\\Admin\\CouponCenterController@retryTask');
            $router->get ('/coupon/user-coupons', 'V1\\Admin\\CouponCenterController@userCoupons');
            $router->post('/coupon/user-coupon/issue', 'V1\\Admin\\CouponCenterController@issueUser');
            $router->post('/coupon/user-coupon/retry-notification', 'V1\\Admin\\CouponCenterController@retryNotification');
            $router->post('/coupon/user-coupon/revoke', 'V1\\Admin\\CouponCenterController@revoke');
            $router->post('/coupon/user-coupon/extend', 'V1\\Admin\\CouponCenterController@extend');
            $router->post('/coupon/user-coupon/restore', 'V1\\Admin\\CouponCenterController@restore');
            $router->post('/coupon/distribution/import', 'V1\\Admin\\CouponCenterController@importTask');
            $router->get ('/coupon/user-coupons/export', 'V1\\Admin\\CouponCenterController@exportUserCoupons');
            // Giftcard
            $router->get ('/giftcard/fetch', 'V1\\Admin\\GiftcardController@fetch');
            $router->get ('/giftcard/redemptions', 'V1\\Admin\\GiftcardController@redemptions');
            $router->post('/giftcard/generate', 'V1\\Admin\\GiftcardController@generate');
            $router->post('/giftcard/drop', 'V1\\Admin\\GiftcardController@drop');
            // Knowledge
            $router->get ('/knowledge/fetch', 'V1\\Admin\\KnowledgeController@fetch');
            $router->get ('/knowledge/getCategory', 'V1\\Admin\\KnowledgeController@getCategory');
            $router->post('/knowledge/save', 'V1\\Admin\\KnowledgeController@save');
            $router->post('/knowledge/show', 'V1\\Admin\\KnowledgeController@show');
            $router->post('/knowledge/drop', 'V1\\Admin\\KnowledgeController@drop');
            $router->post('/knowledge/sort', 'V1\\Admin\\KnowledgeController@sort');
            // Payment
            $router->get ('/payment/fetch', 'V1\\Admin\\PaymentController@fetch');
            $router->get ('/payment/getPaymentMethods', 'V1\\Admin\\PaymentController@getPaymentMethods');
            $router->post('/payment/getPaymentForm', 'V1\\Admin\\PaymentController@getPaymentForm');
            $router->post('/payment/save', 'V1\\Admin\\PaymentController@save');
            $router->post('/payment/drop', 'V1\\Admin\\PaymentController@drop');
            $router->post('/payment/show', 'V1\\Admin\\PaymentController@show');
            $router->post('/payment/sort', 'V1\\Admin\\PaymentController@sort');
            // System
            $router->get ('/system/getSystemStatus', 'V1\\Admin\\SystemController@getSystemStatus');
            $router->get ('/system/getQueueStats', 'V1\\Admin\\SystemController@getQueueStats');
            $router->get ('/system/getQueueWorkload', 'V1\\Admin\\SystemController@getQueueWorkload');
            $router->get ('/system/getQueueMasters', '\\Laravel\\Horizon\\Http\\Controllers\\MasterSupervisorController@index');
            $router->get ('/system/getSystemLog', 'V1\\Admin\\SystemController@getSystemLog');
            // Theme
            $router->get ('/theme/getThemes', 'V1\\Admin\\ThemeController@getThemes');
            $router->post('/theme/saveThemeConfig', 'V1\\Admin\\ThemeController@saveThemeConfig');
            $router->post('/theme/getThemeConfig', 'V1\\Admin\\ThemeController@getThemeConfig');
            // Client remote configuration center
            $router->get ('/client-config/overview', 'V1\\Admin\\ClientRemoteConfigController@overview');
            $router->post('/client-config/draft/save', 'V1\\Admin\\ClientRemoteConfigController@saveDraft');
            $router->post('/client-config/version/clone', 'V1\\Admin\\ClientRemoteConfigController@cloneVersion');
            $router->post('/client-config/version/drop', 'V1\\Admin\\ClientRemoteConfigController@dropVersion');
            $router->post('/client-config/settings/save', 'V1\\Admin\\ClientRemoteConfigController@saveSettings');
            $router->post('/client-config/target/save', 'V1\\Admin\\ClientRemoteConfigController@saveTarget');
            $router->post('/client-config/target/drop', 'V1\\Admin\\ClientRemoteConfigController@dropTarget');
            $router->post('/client-config/target/test', 'V1\\Admin\\ClientRemoteConfigController@testTarget');
            $router->post('/client-config/preview', 'V1\\Admin\\ClientRemoteConfigController@preview');
            $router->post('/client-config/publish', 'V1\\Admin\\ClientRemoteConfigController@publish');
            $router->post('/client-config/publication/retry', 'V1\\Admin\\ClientRemoteConfigController@retryPublication');
            // Alibaba Cloud DNS / GTM 3.0
            $router->get ('/aliyun-dns/overview', 'V1\\Admin\\AliyunDnsController@overview');
            $router->post('/aliyun-dns/account/save', 'V1\\Admin\\AliyunDnsController@saveAccount');
            $router->post('/aliyun-dns/account/drop', 'V1\\Admin\\AliyunDnsController@dropAccount');
            $router->post('/aliyun-dns/account/test', 'V1\\Admin\\AliyunDnsController@testAccount');
            $router->get ('/aliyun-dns/instances', 'V1\\Admin\\AliyunDnsController@instances');
            $router->get ('/aliyun-dns/topology', 'V1\\Admin\\AliyunDnsController@topology');
            $router->get ('/aliyun-dns/resources', 'V1\\Admin\\AliyunDnsController@resources');
            $router->get ('/aliyun-dns/monitor-templates', 'V1\\Admin\\AliyunDnsController@monitorTemplates');
            $router->post('/aliyun-dns/update', 'V1\\Admin\\AliyunDnsController@update');
            $router->post('/aliyun-dns/order/save', 'V1\\Admin\\AliyunDnsController@saveOrder');
            $router->post('/aliyun-dns/pool/save', 'V1\\Admin\\AliyunDnsController@savePool');
            $router->post('/aliyun-dns/pool/attach', 'V1\\Admin\\AliyunDnsController@attachPool');
            $router->post('/aliyun-dns/pool/drop', 'V1\\Admin\\AliyunDnsController@dropPool');
            $router->post('/aliyun-dns/address/save', 'V1\\Admin\\AliyunDnsController@saveAddress');
            $router->post('/aliyun-dns/address/attach', 'V1\\Admin\\AliyunDnsController@attachAddress');
            $router->post('/aliyun-dns/address/drop', 'V1\\Admin\\AliyunDnsController@dropAddress');
            // Cloudflare authoritative DNS
            $router->get ('/cloudflare-dns/overview', 'V1\\Admin\\CloudflareDnsController@overview');
            $router->post('/cloudflare-dns/account/save', 'V1\\Admin\\CloudflareDnsController@saveAccount');
            $router->post('/cloudflare-dns/account/test', 'V1\\Admin\\CloudflareDnsController@testAccount');
            $router->post('/cloudflare-dns/account/drop', 'V1\\Admin\\CloudflareDnsController@dropAccount');
            $router->get ('/cloudflare-dns/zones', 'V1\\Admin\\CloudflareDnsController@zones');
            $router->get ('/cloudflare-dns/records', 'V1\\Admin\\CloudflareDnsController@records');
            $router->post('/cloudflare-dns/record/save', 'V1\\Admin\\CloudflareDnsController@saveRecord');
            $router->post('/cloudflare-dns/record/drop', 'V1\\Admin\\CloudflareDnsController@dropRecord');
            // Multi-cloud account balance and monthly bill overview
            $router->get ('/cloud-account/overview', 'V1\\Admin\\CloudAccountController@overview');
            $router->post('/cloud-account/save', 'V1\\Admin\\CloudAccountController@save');
            $router->post('/cloud-account/refresh', 'V1\\Admin\\CloudAccountController@refresh');
            $router->post('/cloud-account/refresh-all', 'V1\\Admin\\CloudAccountController@refreshAll');
            $router->post('/cloud-account/drop', 'V1\\Admin\\CloudAccountController@drop');
        });
    }
}
