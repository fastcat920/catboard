import { Tabs } from 'antd'
import { useSearchParams } from 'react-router'
import { AdminLayout } from '@/layouts/AdminLayout'
import { LevelsTab } from './LevelsTab'
import { OverviewTab } from './OverviewTab'
import { RelationsTab } from './RelationsTab'
import { SettingsTab } from './SettingsTab'

const TAB_KEYS = ['overview', 'setting', 'levels', 'relations'] as const
type TabKey = (typeof TAB_KEYS)[number]

export default function ReferralPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') as TabKey | null
  const active = requested && TAB_KEYS.includes(requested) ? requested : 'overview'
  const change = (key: string) => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })

  return (
    <AdminLayout title="邀请管理">
      <div className="catboard-page">
        <div className="catboard-page-heading"><div><h2>邀请管理</h2><p>管理邀请增长、成长等级、奖励规则与邀请关系</p></div></div>
        <Tabs
          activeKey={active}
          onChange={change}
          destroyOnHidden
          items={[
            { key: 'overview', label: '数据概览', children: <OverviewTab /> },
            { key: 'setting', label: '奖励规则', children: <SettingsTab /> },
            { key: 'levels', label: '成长等级', children: <LevelsTab /> },
            { key: 'relations', label: '邀请关系', children: <RelationsTab /> },
          ]}
        />
      </div>
    </AdminLayout>
  )
}
