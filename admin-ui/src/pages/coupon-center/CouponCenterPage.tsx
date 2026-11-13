import { Tabs } from 'antd'
import { useSearchParams } from 'react-router'
import { AdminLayout } from '@/layouts/AdminLayout'
import { DistributionTab } from './DistributionTab'
import { OverviewTab } from './OverviewTab'
import { TemplatesTab } from './TemplatesTab'
import { UserCouponsTab } from './UserCouponsTab'

const TAB_KEYS = ['overview', 'templates', 'distribution', 'wallet'] as const
type TabKey = (typeof TAB_KEYS)[number]

export default function CouponCenterPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') as TabKey | null
  const active = requested && TAB_KEYS.includes(requested) ? requested : 'overview'
  const change = (key: string) => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })
  return (
    <AdminLayout title="优惠券管理">
      <div className="catboard-page">
        <div className="catboard-page-heading"><div><h2>优惠券管理</h2><p>创建优惠券、批量发放并追踪用户领取与使用状态</p></div></div>
        <Tabs
          activeKey={active}
          onChange={change}
          destroyOnHidden
          items={[
            { key: 'overview', label: '数据概览', children: <OverviewTab /> },
            { key: 'templates', label: '优惠券模板', children: <TemplatesTab /> },
            { key: 'distribution', label: '发放任务', children: <DistributionTab /> },
            { key: 'wallet', label: '用户优惠券', children: <UserCouponsTab /> },
          ]}
        />
      </div>
    </AdminLayout>
  )
}
