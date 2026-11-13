import { DollarOutlined, PercentageOutlined, ReadOutlined, WalletOutlined } from '@ant-design/icons'
import { Card, Col, Empty, Row, Table, Typography, type TableColumnsType } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { fetchCouponDashboard, type CouponDashboard } from '@/api/services/couponCenter'
import { unwrap } from '@/api/request'

const money = (value: number) => `¥${(Number(value || 0) / 100).toFixed(2)}`

export function OverviewTab() {
  const [data, setData] = useState<CouponDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await unwrap(fetchCouponDashboard())) } finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const columns: TableColumnsType<CouponDashboard['template_ranking'][number]> = [
    { title: '优惠券模板', dataIndex: 'name' },
    { title: '已发放', dataIndex: 'issued_count', width: 120 },
    { title: '已使用', dataIndex: 'used_count', width: 120 },
    { title: '使用率', width: 120, render: (_, row) => row.issued_count ? `${(row.used_count / row.issued_count * 100).toFixed(1)}%` : '0.0%' },
  ]
  const conversion = data?.issued ? `${((data.used / data.issued) * 100).toFixed(1)}%` : '0.0%'

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><Card loading={loading} className="catboard-stat-card"><WalletOutlined /><Typography.Text>累计发放</Typography.Text><strong>{data?.issued ?? 0}</strong><span>可用 {data?.available ?? 0} 张</span></Card></Col>
        <Col xs={12} lg={6}><Card loading={loading} className="catboard-stat-card"><ReadOutlined /><Typography.Text>累计使用</Typography.Text><strong>{data?.used ?? 0}</strong><span>已过期 {data?.expired ?? 0} 张</span></Card></Col>
        <Col xs={12} lg={6}><Card loading={loading} className="catboard-stat-card"><PercentageOutlined /><Typography.Text>整体使用率</Typography.Text><strong>{conversion}</strong><span>{data?.templates ?? 0} 个模板</span></Card></Col>
        <Col xs={12} lg={6}><Card loading={loading} className="catboard-stat-card"><DollarOutlined /><Typography.Text>优惠带动收入</Typography.Text><strong>{money(data?.revenue ?? 0)}</strong><span>累计优惠 {money(data?.discount_total ?? 0)}</span></Card></Col>
      </Row>
      <Card className="mt-3" title="模板使用排行">
        <Table rowKey="id" loading={loading} columns={columns} dataSource={data?.template_ranking ?? []} pagination={false} locale={{ emptyText: <Empty description="暂无优惠券使用数据" /> }} />
      </Card>
    </div>
  )
}
