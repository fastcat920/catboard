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
            $router->get ('/referral/campaigns', 'V1\\Admin\\ReferralController@campaigns');
            $router->post('/referral/campaign/save', 'V1\\Admin\\ReferralController@saveCampaign');
            $router->post('/referral/campaign/drop', 'V1\\Admin\\ReferralController@dropCampaign');
            $router->get ('/referral/leaderboard', 'V1\\Admin\\ReferralController@leaderboard');
            $router->post('/referral/leaderboard/setting', 'V1\\Admin\\ReferralController@saveLeaderboardSetting');
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
            // Node security
            $router->get ('/security/dashboard', 'V1\\Admin\\NodeSecurityController@dashboard');
            $router->get ('/security/events', 'V1\\Admin\\NodeSecurityController@events');
            $router->get ('/security/event/detail', 'V1\\Admin\\NodeSecurityController@eventDetail');
            $router->post('/security/event/save', 'V1\\Admin\\NodeSecurityController@saveEvent');
            $router->post('/security/event/update', 'V1\\Admin\\NodeSecurityController@updateEvent');
            $router->get ('/security/users', 'V1\\Admin\\NodeSecurityController@users');
            $router->get ('/security/user/detail', 'V1\\Admin\\NodeSecurityController@userDetail');
            $router->post('/security/user/action', 'V1\\Admin\\NodeSecurityController@userAction');
            $router->post('/security/users/batch-ban', 'V1\\Admin\\NodeSecurityController@batchBanUsers');
            $router->get ('/security/groups', 'V1\\Admin\\NodeSecurityController@groups');
            $router->post('/security/users/batch-group', 'V1\\Admin\\NodeSecurityController@batchGroupUsers');
            $router->get ('/security/access-logs', 'V1\\Admin\\NodeSecurityController@accessLogs');
            $router->get ('/security/snapshots', 'V1\\Admin\\NodeSecurityController@snapshots');
            $router->get ('/security/snapshot-analysis/catalog', 'V1\\Admin\\NodeSecurityController@snapshotAnalysisCatalog');
            $router->get ('/security/snapshot-analysis/compare', 'V1\\Admin\\NodeSecurityController@snapshotComparison');
            $router->get ('/security/snapshot-analysis/user', 'V1\\Admin\\NodeSecurityController@userSnapshotTrajectory');
            $router->get ('/security/experiments', 'V1\\Admin\\NodeSecurityController@experiments');
            $router->post('/security/experiment/create', 'V1\\Admin\\NodeSecurityController@createExperiment');
            $router->post('/security/experiment/split', 'V1\\Admin\\NodeSecurityController@splitExperiment');
            $router->post('/security/experiment/update', 'V1\\Admin\\NodeSecurityController@updateExperiment');
            $router->get ('/security/settings', 'V1\\Admin\\NodeSecurityController@settings');
            $router->post('/security/settings', 'V1\\Admin\\NodeSecurityController@saveSettings');
            $router->get ('/security/alerts', 'V1\\Admin\\NodeSecurityController@alerts');
            $router->post('/security/alert/read', 'V1\\Admin\\NodeSecurityController@readAlert');
            $router->post('/security/alerts/read-all', 'V1\\Admin\\NodeSecurityController@readAllAlerts');
            $router->get ('/security/probes', 'V1\\Admin\\NodeSecurityController@probes');
            $router->post('/security/probe/create', 'V1\\Admin\\NodeSecurityController@createProbe');
            $router->post('/security/probe/edit', 'V1\\Admin\\NodeSecurityController@editProbe');
            $router->post('/security/probe/update', 'V1\\Admin\\NodeSecurityController@updateProbe');
            $router->post('/security/probe/delete', 'V1\\Admin\\NodeSecurityController@deleteProbe');
            $router->get ('/security/node-states', 'V1\\Admin\\NodeSecurityController@nodeStates');
            $router->get ('/security/probe-targets/candidates', 'V1\\Admin\\NodeSecurityController@probeTargetCandidates');
            $router->post('/security/probe-targets/batch', 'V1\\Admin\\NodeSecurityController@batchProbeTargets');
            $router->get ('/security/probe-results', 'V1\\Admin\\NodeSecurityController@probeResults');
            $router->get ('/security/entry-pools', 'V1\\Admin\\NodeSecurityController@entryPools');
            $router->post('/security/entry-setting/save', 'V1\\Admin\\NodeSecurityController@saveEntrySetting');
            $router->post('/security/entry/save', 'V1\\Admin\\NodeSecurityController@saveEntry');
            $router->post('/security/entry/delete', 'V1\\Admin\\NodeSecurityController@deleteEntry');
            $router->post('/security/entry-client-policy/save', 'V1\\Admin\\NodeSecurityController@saveEntryClientPolicy');
            $router->post('/security/entry-client-policy/delete', 'V1\\Admin\\NodeSecurityController@deleteEntryClientPolicy');
        });
    }
}
