import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  dropFlashSale,
  fetchActivities,
  fetchFlashSales,
  saveFlashSale,
  type ActivityStatus,
  type ActivityType,
  type FlashDiscountType,
  type FlashSale,
  type FlashSaleInput,
  type MarketingActivity,
  type PlanOption,
} from '@/api/services/marketing'
import { unwrap } from '@/api/request'
import { message, modal } from '@/app/staticApi'
import { AdminLayout } from '@/layouts/AdminLayout'

const TYPE_LABEL: Record<ActivityType, string> = { flash_sale: '限时特价', coupon: '优惠券', newcomer: '新人奖励' }
const STATUS: Record<ActivityStatus, { label: string; color: string }> = {
  active: { label: '进行中', color: 'success' },
  scheduled: { label: '待开始', color: 'processing' },
  ended: { label: '已结束', color: 'default' },
  disabled: { label: '已停用', color: 'warning' },
}
const PERIODS = [
  ['month_price', '月付'],
  ['quarter_price', '季付'],
  ['half_year_price', '半年付'],
  ['year_price', '年付'],
  ['two_year_price', '两年付'],
  ['three_year_price', '三年付'],
  ['onetime_price', '一次性'],
] as const

interface FlashSaleForm {
  name: string
  name_en?: string
  description?: string
  description_en?: string
  range: [Dayjs, Dayjs]
  audience: 'all' | 'new' | 'existing'
  discount_type: FlashDiscountType
  discount_value: number
  minimum_amount: number
  per_user_limit?: number
  total_limit?: number
  priority: number
  allow_coupon: boolean
  allow_member_discount: boolean
  enabled: boolean
  plan_ids: number[]
  periods: string[]
}

function activityTime(value?: number | null) {
  return value ? dayjs.unix(value).format('YYYY-MM-DD HH:mm') : '--'
}

function yuan(value: number) {
  return `¥${(value / 100).toFixed(2)}`
}

function FlashSaleEditor({
  open,
  row,
  plans,
  onClose,
  onSaved,
}: {
  open: boolean
  row: FlashSale | null
  plans: PlanOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm<FlashSaleForm>()
  const [saving, setSaving] = useState(false)
  const discountType = Form.useWatch('discount_type', form) ?? 'fixed_price'

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: row?.name ?? '',
      name_en: row?.name_en ?? '',
      description: row?.description ?? '',
      description_en: row?.description_en ?? '',
      range: [row?.starts_at ? dayjs.unix(row.starts_at) : dayjs(), row?.ends_at ? dayjs.unix(row.ends_at) : dayjs().add(7, 'day')],
      audience: row?.audience ?? 'all',
      discount_type: row?.discount_type ?? 'fixed_price',
      discount_value: row ? (row.discount_type === 'percent_off' ? row.discount_value : row.discount_value / 100) : 10,
      minimum_amount: row ? row.minimum_amount / 100 : 0,
      per_user_limit: row?.per_user_limit ?? undefined,
      total_limit: row?.total_limit ?? undefined,
      priority: row?.priority ?? 0,
      allow_coupon: row ? Boolean(row.allow_coupon) : true,
      allow_member_discount: row ? Boolean(row.allow_member_discount) : true,
      enabled: row ? Boolean(row.enabled) : true,
      plan_ids: row?.plan_ids ?? [],
      periods: row?.periods ?? [],
    })
  }, [form, open, row])

  const save = async () => {
    const values = await form.validateFields()
    const payload: FlashSaleInput = {
      id: row?.id,
      name: values.name.trim(),
      name_en: values.name_en?.trim(),
      description: values.description?.trim(),
      description_en: values.description_en?.trim(),
      starts_at: values.range[0].unix(),
      ends_at: values.range[1].unix(),
      audience: values.audience,
      discount_type: values.discount_type,
      discount_value: values.discount_type === 'percent_off' ? values.discount_value : Math.round(values.discount_value * 100),
      minimum_amount: Math.round((values.minimum_amount || 0) * 100),
      per_user_limit: values.per_user_limit ?? null,
      total_limit: values.total_limit ?? null,
      priority: values.priority || 0,
      allow_coupon: values.allow_coupon,
      allow_member_discount: values.allow_member_discount,
      enabled: values.enabled,
      plan_ids: values.plan_ids,
      periods: values.periods,
    }
    setSaving(true)
    try {
      await unwrap(saveFlashSale(payload))
      message.success('限时特价已保存')
      onClose()
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const remove = () => {
    if (!row) return
    modal.confirm({
      title: '确认删除该限时特价？',
      content: '已有成交的活动无法删除，只能停用。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await unwrap(dropFlashSale(row.id))
        message.success('活动已删除')
        onClose()
        onSaved()
      },
    })
  }

  return (
    <Modal
      title={`${row ? '编辑' : '新建'}限时特价`}
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      width={880}
      destroyOnHidden
      footer={(
        <Space className="catboard-modal-footer">
          {row && <Button danger icon={<DeleteOutlined />} onClick={remove}>删除</Button>}
          <span />
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>保存</Button>
        </Space>
      )}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="name" label="中文名称" rules={[{ required: true, message: '请输入中文名称' }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="name_en" label="英文名称"><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="description" label="中文说明"><Input.TextArea rows={3} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="description_en" label="英文说明"><Input.TextArea rows={3} /></Form.Item></Col>
          <Col span={24}><Form.Item name="range" label="活动时间" rules={[{ required: true, message: '请选择活动时间' }]}><DatePicker.RangePicker showTime className="w-100" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="audience" label="参与用户"><Select options={[{ value: 'all', label: '全部用户' }, { value: 'new', label: '仅新购用户' }, { value: 'existing', label: '仅已有用户' }]} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="discount_type" label="优惠方式"><Select options={[{ value: 'fixed_price', label: '固定活动价' }, { value: 'percent_off', label: '优惠百分比' }, { value: 'amount_off', label: '立减金额' }]} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="discount_value" label={discountType === 'percent_off' ? '优惠百分比' : '优惠值（元）'} rules={[{ required: true }]}><InputNumber min={0.01} max={discountType === 'percent_off' ? 100 : undefined} precision={2} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="minimum_amount" label="最低订单金额（元）"><InputNumber min={0} precision={2} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="per_user_limit" label="每用户限购次数"><InputNumber min={1} precision={0} className="w-100" placeholder="不限" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="total_limit" label="活动总名额"><InputNumber min={1} precision={0} className="w-100" placeholder="不限" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="priority" label="优先级"><InputNumber min={0} max={9999} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="allow_coupon" label="优惠券" valuePropName="checked"><Switch checkedChildren="可叠加" unCheckedChildren="不叠加" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="allow_member_discount" label="会员等级折扣" valuePropName="checked"><Switch checkedChildren="可叠加" unCheckedChildren="不叠加" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="plan_ids" label="指定套餐（不选代表全部）"><Select mode="multiple" allowClear options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="periods" label="购买周期（不选代表全部）"><Select mode="multiple" allowClear options={PERIODS.map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
          <Col span={24}><Form.Item name="enabled" label="活动状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>
  )
}

export default function MarketingPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<MarketingActivity[]>([])
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [summary, setSummary] = useState({ total: 0, active: 0, scheduled: 0, ended: 0 })
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<FlashSale | null>(null)
  // oxlint-disable react/memo-dependencies -- 三个筛选值都是请求参数，改变任一项都需重新请求。
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchActivities({ keyword, type: typeFilter, status: statusFilter })
      if (response.code !== 200) return
      setRows(response.data ?? [])
      setPlans((response.plans as PlanOption[] | undefined) ?? [])
      setSummary((response.summary as typeof summary | undefined) ?? { total: 0, active: 0, scheduled: 0, ended: 0 })
    } finally {
      setLoading(false)
    }
  }, [keyword, statusFilter, typeFilter])
  // oxlint-enable react/memo-dependencies

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const edit = async (activity?: MarketingActivity) => {
    if (activity && activity.type !== 'flash_sale') {
      navigate(activity.type === 'coupon' ? '/coupon' : '/referral')
      return
    }
    const response = await fetchFlashSales()
    if (response.code !== 200) return
    setPlans((response.plans as PlanOption[] | undefined) ?? plans)
    setEditing(activity ? response.data?.find((item) => item.id === activity.source_id) ?? null : null)
    setEditorOpen(true)
  }

  const columns: TableColumnsType<MarketingActivity> = [
    { title: '活动名称', dataIndex: 'name', render: (value, row) => <div><strong>{value}</strong>{row.name_en && <div><Typography.Text type="secondary">{row.name_en}</Typography.Text></div>}</div> },
    { title: '类型', dataIndex: 'type', width: 120, render: (value: ActivityType) => TYPE_LABEL[value] },
    { title: '时间', width: 190, render: (_, row) => <span>{activityTime(row.starts_at)}<br />{activityTime(row.ends_at)}</span> },
    { title: '范围', dataIndex: 'scope' },
    { title: '订单', dataIndex: 'orders', width: 90, align: 'right' },
    { title: '收入', dataIndex: 'revenue', width: 110, align: 'right', render: (value: number) => yuan(value) },
    { title: '优惠', dataIndex: 'discount_total', width: 110, align: 'right', render: (value: number) => yuan(value) },
    { title: '状态', dataIndex: 'status', width: 100, render: (value: ActivityStatus) => <Tag color={STATUS[value].color}>{STATUS[value].label}</Tag> },
    { title: '操作', width: 100, fixed: 'right', render: (_, row) => <Button type="link" icon={<EditOutlined />} onClick={() => void edit(row)}>{row.type === 'flash_sale' ? '编辑' : '查看'}</Button> },
  ]

  return (
    <AdminLayout title="营销活动">
      <div className="catboard-page">
        <div className="catboard-page-heading">
          <div><h2>营销活动</h2><p>统一查看新人奖励、优惠券与限时特价</p></div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void edit()}>新建限时特价</Button>
          </Space>
        </div>
        <Row gutter={[12, 12]} className="mb-3">
          {([['全部活动', summary.total], ['进行中', summary.active], ['待开始', summary.scheduled], ['已结束', summary.ended]] as const).map(([label, value]) => (
            <Col xs={12} lg={6} key={label}><Card size="small"><Typography.Text type="secondary">{label}</Typography.Text><div className="catboard-stat-value">{value}</div></Card></Col>
          ))}
        </Row>
        <Card>
          <div className="catboard-filter-bar">
            <Input prefix={<SearchOutlined />} allowClear placeholder="搜索活动名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            <Select value={typeFilter} onChange={setTypeFilter} options={[{ value: '', label: '全部类型' }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]} />
            <Select value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: '全部状态' }, ...Object.entries(STATUS).map(([value, item]) => ({ value, label: item.label }))]} />
          </div>
          <Table rowKey="key" loading={loading} columns={columns} dataSource={rows} scroll={{ x: 1100 }} pagination={{ pageSize: 10, showSizeChanger: false }} />
        </Card>
      </div>
      <FlashSaleEditor open={editorOpen} row={editing} plans={plans} onClose={() => setEditorOpen(false)} onSaved={() => void load()} />
    </AdminLayout>
  )
}
