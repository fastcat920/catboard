import { CaretDownOutlined, FilterOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { Badge, Button, Dropdown, Tag, Tooltip, type TableColumnsType } from 'antd'
import { useEffect } from 'react'
import { usePlans } from '@/api/queries'
import type { Order } from '@/api/types'
import { FilterDrawer, type FilterKey } from '@/components/FilterDrawer'
import { JsLink } from '@/components/JsLink'
import { Loading } from '@/components/Loading'
import { V2Table } from '@/components/table/V2Table'
import { AdminLayout } from '@/layouts/AdminLayout'
import { useOrderManageStore } from '@/stores/orderManage'
import { COMMISSION_STATUS_TEXT, ORDER_STATUS_TEXT, PERIOD_TEXT, type PeriodKey } from '@/utils/constants'
import { formatTime } from '@/utils/format'
import { AssignOrderModal } from './AssignOrderModal'
import { OrderDetailModal } from './OrderDetailModal'

const TYPE_TEXT: Record<number, string> = { 1: '新购', 2: '续费', 3: '变更', 4: '流量包', 9: '充值' }
const ORDER_BADGE = ['error', 'processing', 'default', 'success', 'default'] as const
const COMMISSION_BADGE = ['default', 'processing', 'success', 'error'] as const

const FILTER_KEYS: FilterKey[] = [
  { key: 'trade_no', title: '订单号', condition: ['模糊', '='] },
  {
    key: 'status',
    title: '订单状态',
    type: 'select',
    condition: ['='],
    options: [
      { key: '未支付', value: 0 },
      { key: '已支付', value: 1 },
      { key: '已取消', value: 2 },
      { key: '已完成', value: 3 },
      { key: '已折抵', value: 4 },
    ],
  },
  {
    key: 'commission_status',
    title: '佣金状态',
    type: 'select',
    condition: ['='],
    options: [
      { key: '待确认', value: 0 },
      { key: '发放中', value: 1 },
      { key: '已发放', value: 2 },
      { key: '无效', value: 3 },
    ],
  },
  { key: 'user_id', title: '用户ID', condition: ['='] },
  { key: 'invite_user_id', title: '邀请人ID', condition: ['=', '!='] },
  { key: 'callback_no', title: '回调单号', condition: ['模糊'] },
  { key: 'commission_balance', title: '佣金金额', condition: ['>', '<', '=', '!=', '>=', '<='] },
]

// 订单管理（原版模块 pi3A + model order）
export default function OrderPage() {
  // 与原版一样随 orderManage 的任何变化重新渲染
  const model = useOrderManageStore()
  const { orders, fetchLoading, pagination, filter } = model
  usePlans()

  useEffect(() => {
    void useOrderManageStore.getState().fetch()
    return () => {
      const store = useOrderManageStore.getState()
      store.empty()
      store.setState({ filter: [] })
    }
  }, [])

  const columns: TableColumnsType<Order> = [
    {
      title: '# 订单号',
      dataIndex: 'trade_no',
      key: 'trade_no',
      render: (tradeNo: string, order) => (
        <OrderDetailModal orderId={order.id}>
          <JsLink>
            {tradeNo.substr(0, 3)}...{tradeNo.substr(-3)}
          </JsLink>
        </OrderDetailModal>
      ),
    },
    { title: '类型', dataIndex: 'type', key: 'type', render: (type: number) => TYPE_TEXT[type] },
    { title: '订阅计划', dataIndex: 'plan_name', key: 'plan_name' },
    {
      title: '周期',
      dataIndex: 'period',
      key: 'period',
      align: 'center',
      render: (_: string, order) => <Tag>{PERIOD_TEXT[order.period as PeriodKey]}</Tag>,
    },
    {
      title: '支付金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      align: 'right',
      render: (amount: number) => (amount / 100).toFixed(2),
    },
    {
      title: (
        <span>
          <Tooltip placement="top" title="标记为[已支付]后将会由系统进行开通后并完成">
            订单状态 <QuestionCircleOutlined />
          </Tooltip>
        </span>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (status: number, order) => (
        <div>
          <Dropdown
            disabled={status !== 0}
            trigger={['click']}
            menu={{
              items: [
                { key: '1', label: '已支付', onClick: () => void model.paid(order.trade_no) },
                { key: '2', label: '取消', onClick: () => void model.cancel(order.trade_no) },
              ],
            }}
          >
            <div>
              <Badge status={ORDER_BADGE[status]} />
              <span>{ORDER_STATUS_TEXT[status]} </span>
              {status === 0 && (
                <JsLink>
                  标记为 <CaretDownOutlined />
                </JsLink>
              )}
            </div>
          </Dropdown>
        </div>
      ),
    },
    {
      title: '佣金金额',
      dataIndex: 'commission_balance',
      key: 'commission_balance',
      align: 'right',
      render: (amount: number, order) =>
        order.status === 0 || order.status === 2 ? '-' : amount ? (amount / 100).toFixed(2) : '-',
    },
    {
      title: (
        <span>
          佣金状态{' '}
          <Tooltip placement="top" title="标记为[有效]后将会由系统处理后发放到用户并完成">
            <QuestionCircleOutlined />
          </Tooltip>
        </span>
      ),
      dataIndex: 'commission_status',
      key: 'commission_status',
      render: (commissionStatus: number, order) => {
        if (order.status === 0 || order.status === 2) return '-'
        if (!order.commission_balance) return '-'
        const label = (
          <>
            <Badge status={COMMISSION_BADGE[commissionStatus]} />
            <span>{COMMISSION_STATUS_TEXT[commissionStatus]} </span>
          </>
        )
        if (commissionStatus === 2) return <div>{label}</div>
        const mark = (key: string, text: string, value: number) => ({
          key,
          label: text,
          disabled: commissionStatus === value,
          onClick: ({ key: next }: { key: string }) => void model.update(order.trade_no, 'commission_status', next),
        })
        return (
          <div>
            <Dropdown
              trigger={['click']}
              menu={{ items: [mark('0', '待确认', 0), mark('1', '有效', 1), mark('3', '无效', 3)] }}
            >
              <div>
                {label}
                <JsLink>
                  标记为 <CaretDownOutlined />
                </JsLink>
              </div>
            </Dropdown>
          </div>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'right',
      render: (createdAt: number) => formatTime(createdAt),
    },
  ]

  return (
    <AdminLayout title="订单管理">
      <div className="d-flex justify-content-between align-items-center" />
      <Loading loading={fetchLoading}>
        <div className="block block-rounded">
          <div className="bg-white">
            <div style={{ padding: 15 }}>
              <Button.Group>
                <FilterDrawer value={filter} onOk={model.filterBy} keys={FILTER_KEYS}>
                  <Button type={filter.length > 0 ? 'primary' : 'default'} icon={<FilterOutlined />}>
                    过滤器
                  </Button>
                </FilterDrawer>
              </Button.Group>
              <AssignOrderModal>
                <Button style={{ marginLeft: 10 }} icon={<PlusOutlined />}>
                  添加订单
                </Button>
              </AssignOrderModal>
            </div>
            <V2Table<Order>
              dataSource={orders}
              pagination={{ ...pagination, current: pagination.current || 1, size: 'small' }}
              columns={columns}
              scroll={{ x: 1050 }}
              onChange={(next) => model.changeTable({ current: next.current, pageSize: next.pageSize })}
            />
          </div>
        </div>
      </Loading>
    </AdminLayout>
  )
}
