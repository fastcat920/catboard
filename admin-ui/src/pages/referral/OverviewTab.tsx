import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Row, Table, Typography, type TableColumnsType } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { fetchReferralDashboard, fetchReferralFunnel, type ReferralDashboard, type ReferralFunnel, type ReferralTrend } from '@/api/services/referral'
import { unwrap } from '@/api/request'

const money = (value: number) => `¥${(Number(value || 0) / 100).toFixed(2)}`

function StatCard({ label, value }: { label: string; value: string | number }) {
  return <Col xs={12} md={8} xl={4}><Card size="small"><Typography.Text type="secondary">{label}</Typography.Text><div className="catboard-stat-value">{value}</div></Card></Col>
}

const trendColumns: TableColumnsType<ReferralTrend> = [
  { title: '日期', dataIndex: 'date', width: 120 },
  { title: '访问', dataIndex: 'visits', align: 'right' },
  { title: '注册', dataIndex: 'registrations', align: 'right' },
  { title: '真实首购', dataIndex: 'first_orders', align: 'right' },
  { title: '再次新购', dataIndex: 'repeat_purchases', align: 'right' },
  { title: '续费', dataIndex: 'renewals', align: 'right' },
  { title: '更换套餐', dataIndex: 'plan_changes', align: 'right' },
]

export function OverviewTab() {
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null)
  const [funnel, setFunnel] = useState<ReferralFunnel | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const [dashboardData, funnelData] = await Promise.all([
        unwrap(fetchReferralDashboard(refresh)),
        unwrap(fetchReferralFunnel(30)),
      ])
      setDashboard(dashboardData)
      setFunnel(funnelData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const summary = funnel?.summary
  return (
    <div>
      <div className="d-flex justify-content-end mb-3"><Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load(true)}>刷新数据</Button></div>
      <Row gutter={[12, 12]}>
        <StatCard label="邀请注册" value={dashboard?.registered_invites ?? '--'} />
        <StatCard label="有效邀请" value={dashboard?.effective_invites ?? '--'} />
        <StatCard label="有效邀请转化率" value={dashboard ? `${dashboard.conversion_rate}%` : '--'} />
        <StatCard label="邀请订单收入" value={dashboard ? money(dashboard.referral_revenue) : '--'} />
        <StatCard label="额外奖励支出" value={dashboard ? money(dashboard.reward_total) : '--'} />
        <StatCard label="活跃推广者" value={dashboard?.active_promoters ?? '--'} />
      </Row>
      <Alert className="my-3" type="info" showIcon message="有效邀请以好友完成符合最低金额的首笔有效套餐订单为准。奖励流水使用唯一事件键，重复支付回调不会重复发放。" />
      <Typography.Title level={4}>近 30 天邀请注册转化漏斗</Typography.Title>
      <Row gutter={[12, 12]}>
        <StatCard label="链接访问" value={summary?.visits ?? '--'} />
        <StatCard label="邀请注册" value={summary?.registrations ?? '--'} />
        <StatCard label="邮箱验证" value={summary ? (summary.verified === null ? '未启用验证' : summary.verified) : '--'} />
        <StatCard label="真实首购用户" value={summary?.first_purchase_users ?? '--'} />
        <StatCard label="后续续费用户" value={summary?.renewal_users ?? '--'} />
        <StatCard label="注册首购转化率" value={summary ? `${summary.registration_to_first_rate}%` : '--'} />
        <StatCard label="首购续费转化率" value={summary ? `${summary.renewal_rate}%` : '--'} />
        <StatCard label="待确认奖励" value={summary?.pending_rewards ?? '--'} />
        <StatCard label="已撤销奖励" value={summary?.reversed_rewards ?? '--'} />
        <StatCard label="奖励投入产出比" value={summary ? (summary.roi === null ? '--' : summary.roi) : '--'} />
      </Row>
      <Row gutter={[16, 16]} className="mt-3">
        <Col xs={24} xl={16}>
          <Card title="每日订单趋势">
            <Typography.Paragraph type="secondary">按行为发生日期统计，因此当天没有新注册，也可能有此前注册的用户完成购买。</Typography.Paragraph>
            <Table rowKey="date" loading={loading} size="small" columns={trendColumns} dataSource={(funnel?.trend ?? []).toReversed()} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 760 }} />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="渠道转化排行" className="mb-3">
            <Table rowKey={(row) => row.channel || '未知'} size="small" dataSource={funnel?.channels ?? []} pagination={false} columns={[{ title: '渠道', dataIndex: 'channel', render: (value) => value || '未知' }, { title: '访问', dataIndex: 'visits', align: 'right' }, { title: '注册', dataIndex: 'registrations', align: 'right' }]} />
          </Card>
          <Card title="套餐转化排行">
            <Table rowKey="plan_id" size="small" dataSource={funnel?.plans ?? []} pagination={false} columns={[{ title: '套餐 ID', dataIndex: 'plan_id' }, { title: '订单', dataIndex: 'orders', align: 'right' }, { title: '收入', dataIndex: 'revenue', align: 'right', render: money }]} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
