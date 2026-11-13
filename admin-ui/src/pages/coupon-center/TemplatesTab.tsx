import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Radio, Row, Select, Space, Switch, Table, Tag, Typography, type TableColumnsType } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  copyCouponTemplate,
  dropCouponTemplate,
  fetchCouponTemplates,
  saveCouponTemplate,
  type CouponDiscountType,
  type CouponPlan,
  type CouponTemplate,
} from '@/api/services/couponCenter'
import { unwrap } from '@/api/request'
import { message, modal } from '@/app/staticApi'
import { PERIOD_TEXT } from '@/utils/constants'

type ExpiryMode = 'days' | 'fixed'
interface TemplateForm {
  name: string
  name_en?: string
  description?: string
  description_en?: string
  discount_type: CouponDiscountType
  discount_value: number
  plan_ids: number[]
  periods: string[]
  first_order_only: boolean
  stackable: boolean
  per_user_limit: number
  total_limit?: number
  daily_limit?: number
  expiry_mode: ExpiryMode
  valid_days?: number
  starts_at?: Dayjs
  ends_at?: Dayjs
  enabled: boolean
  email_notify_enabled: boolean
}

const periodOptions = Object.entries(PERIOD_TEXT).map(([value, label]) => ({ value, label }))
const displayDiscount = (row: CouponTemplate) => row.discount_type === 'percent' ? `${row.discount_value}%` : `¥${(row.discount_value / 100).toFixed(2)}`

function TemplateEditor({ open, row, plans, onClose, onSaved }: { open: boolean; row: CouponTemplate | null; plans: CouponPlan[]; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<TemplateForm>()
  const [saving, setSaving] = useState(false)
  const discountType = Form.useWatch('discount_type', form) ?? 'fixed'
  const expiryMode = Form.useWatch('expiry_mode', form) ?? 'days'
  const immutable = Boolean(row?.issued_count)

  useEffect(() => {
    if (!open) return
    const expiry: ExpiryMode = row?.valid_days ? 'days' : 'fixed'
    form.setFieldsValue({
      name: row?.name ?? '', name_en: row?.name_en ?? '', description: row?.description ?? '', description_en: row?.description_en ?? '',
      discount_type: row?.discount_type ?? 'fixed', discount_value: row ? (row.discount_type === 'fixed' ? row.discount_value / 100 : row.discount_value) : 5,
      plan_ids: row?.plan_ids ?? [], periods: row?.periods ?? [], first_order_only: Boolean(row?.first_order_only), stackable: Boolean(row?.stackable),
      per_user_limit: row?.per_user_limit ?? 1, total_limit: row?.total_limit ?? undefined, daily_limit: row?.daily_limit ?? undefined,
      expiry_mode: expiry, valid_days: row?.valid_days ?? 30, starts_at: row?.starts_at ? dayjs.unix(row.starts_at) : undefined,
      ends_at: row?.ends_at ? dayjs.unix(row.ends_at) : undefined, enabled: row ? Boolean(row.enabled) : true,
      email_notify_enabled: row ? Boolean(row.email_notify_enabled) : true,
    })
  }, [form, open, row])

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await unwrap(saveCouponTemplate({
        id: row?.id,
        name: values.name.trim(), name_en: values.name_en?.trim(), description: values.description?.trim(), description_en: values.description_en?.trim(),
        discount_type: values.discount_type, discount_value: values.discount_type === 'fixed' ? Math.round(values.discount_value * 100) : values.discount_value,
        plan_ids: values.plan_ids ?? [], periods: values.periods ?? [], first_order_only: values.first_order_only, stackable: values.stackable,
        per_user_limit: values.per_user_limit, total_limit: values.total_limit, daily_limit: values.daily_limit,
        valid_days: values.expiry_mode === 'days' ? values.valid_days : undefined,
        starts_at: values.starts_at?.unix(), ends_at: values.expiry_mode === 'fixed' ? values.ends_at?.unix() : undefined,
        enabled: values.enabled, email_notify_enabled: values.email_notify_enabled,
      }))
      message.success('优惠券模板已保存')
      onClose()
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`${row ? '编辑' : '新增'}优惠券模板`} open={open} onCancel={onClose} onOk={() => void save()} confirmLoading={saving} okText="保存" cancelText="取消" width={900} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}>
        {immutable && <Alert className="mb-3" type="info" showIcon message="该模板已经发放，优惠规则不可修改；需要变更时请复制为新模板。" />}
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="name" label="中文名称" rules={[{ required: true, message: '请输入中文名称' }]}><Input maxLength={100} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="name_en" label="英文名称"><Input maxLength={100} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="description" label="中文说明"><Input.TextArea rows={2} maxLength={1000} showCount /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="description_en" label="英文说明"><Input.TextArea rows={2} maxLength={1000} showCount /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="discount_type" label="优惠类型" rules={[{ required: true }]}><Select disabled={immutable} options={[{ value: 'fixed', label: '固定金额' }, { value: 'percent', label: '百分比折扣' }]} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="discount_value" label={discountType === 'fixed' ? '优惠金额（元）' : '优惠比例（%）'} rules={[{ required: true, message: '请输入优惠值' }]}><InputNumber disabled={immutable} min={0.01} max={discountType === 'percent' ? 100 : undefined} precision={discountType === 'fixed' ? 2 : 0} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="plan_ids" label="适用套餐"><Select disabled={immutable} mode="multiple" allowClear placeholder="不选择代表全部套餐" options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} /></Form.Item></Col>
          <Col span={24}><Form.Item name="periods" label="适用周期"><Select disabled={immutable} mode="multiple" allowClear placeholder="不选择代表全部周期" options={periodOptions} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="expiry_mode" label="有效期方式"><Radio.Group options={[{ value: 'days', label: '领取后有效天数' }, { value: 'fixed', label: '固定结束时间' }]} /></Form.Item></Col>
          <Col xs={24} md={12}>{expiryMode === 'days' ? <Form.Item name="valid_days" label="领取后有效（天）" rules={[{ required: true, message: '请输入有效天数' }]}><InputNumber min={1} max={3650} precision={0} className="w-100" /></Form.Item> : <Form.Item name="ends_at" label="固定结束时间" rules={[{ required: true, message: '请选择结束时间' }]}><DatePicker showTime className="w-100" /></Form.Item>}</Col>
          <Col xs={24} md={12}><Form.Item name="starts_at" label="固定生效时间（可选）"><DatePicker showTime className="w-100" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="per_user_limit" label="每人限领" rules={[{ required: true }]}><InputNumber min={1} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="daily_limit" label="每日发放上限"><InputNumber min={1} precision={0} placeholder="不限" className="w-100" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="total_limit" label="总发放上限"><InputNumber min={1} precision={0} placeholder="不限" className="w-100" /></Form.Item></Col>
          <Col span={24}>
            <Space size="large" wrap>
              <Form.Item name="first_order_only" valuePropName="checked" className="mb-0"><Switch disabled={immutable} checkedChildren="仅限首单" unCheckedChildren="不限首单" /></Form.Item>
              <Form.Item name="stackable" valuePropName="checked" className="mb-0"><Switch disabled={immutable} checkedChildren="可叠加会员折扣" unCheckedChildren="不可叠加会员折扣" /></Form.Item>
              <Form.Item name="email_notify_enabled" valuePropName="checked" className="mb-0"><Switch checkedChildren="邮件通知" unCheckedChildren="不发邮件" /></Form.Item>
              <Form.Item name="enabled" valuePropName="checked" className="mb-0"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
            </Space>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

export function TemplatesTab() {
  const [rows, setRows] = useState<CouponTemplate[]>([])
  const [plans, setPlans] = useState<CouponPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CouponTemplate | null>(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { const result = await fetchCouponTemplates(); setRows(result.templates); setPlans(result.plans) } finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const planNames = useMemo(() => new Map(plans.map((plan) => [plan.id, plan.name])), [plans])
  const copy = async (row: CouponTemplate) => { await unwrap(copyCouponTemplate(row.id)); message.success('已复制为停用的新模板'); await load() }
  const remove = (row: CouponTemplate) => modal.confirm({
    title: `删除优惠券模板“${row.name}”？`, content: '只有从未发放的模板可以删除。', okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
    onOk: async () => { await unwrap(dropCouponTemplate(row.id)); message.success('模板已删除'); await load() },
  })
  const columns: TableColumnsType<CouponTemplate> = [
    { title: '名称', width: 220, render: (_, row) => <div><strong>{row.name}</strong>{row.name_en && <div><Typography.Text type="secondary">{row.name_en}</Typography.Text></div>}</div> },
    { title: '优惠', width: 110, render: (_, row) => <strong>{displayDiscount(row)}</strong> },
    { title: '适用范围', width: 260, render: (_, row) => <Space size={[4, 4]} wrap>{row.plan_ids?.length ? row.plan_ids.map((id) => <Tag key={id}>{planNames.get(Number(id)) ?? `套餐 ${id}`}</Tag>) : <Tag>全部套餐</Tag>}{row.periods?.length ? row.periods.map((period) => <Tag key={period}>{PERIOD_TEXT[period as keyof typeof PERIOD_TEXT] ?? period}</Tag>) : <Tag>全部周期</Tag>}</Space> },
    { title: '有效期', width: 160, render: (_, row) => row.valid_days ? `领取后 ${row.valid_days} 天` : row.ends_at ? `至 ${dayjs.unix(row.ends_at).format('YYYY-MM-DD HH:mm')}` : '-' },
    { title: '发放 / 使用', width: 130, render: (_, row) => `${row.issued_count} / ${row.used_count}` },
    { title: '限制', width: 180, render: (_, row) => <Space size={[4, 4]} wrap>{row.first_order_only && <Tag color="blue">仅限首单</Tag>}{!row.stackable && <Tag>不可叠加会员等级折扣</Tag>}</Space> },
    { title: '状态', width: 90, render: (_, row) => <Tag color={row.enabled ? 'success' : 'default'}>{row.enabled ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 210, fixed: 'right', render: (_, row) => <Space><Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(row); setOpen(true) }}>编辑</Button><Button type="link" icon={<CopyOutlined />} onClick={() => void copy(row)}>复制</Button><Button type="link" danger icon={<DeleteOutlined />} disabled={row.issued_count > 0} onClick={() => remove(row)}>删除</Button></Space> },
  ]
  return (
    <Card title="优惠券模板" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setOpen(true) }}>新增模板</Button>}>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 1300 }} />
      <TemplateEditor open={open} row={editing} plans={plans} onClose={() => setOpen(false)} onSaved={() => void load()} />
    </Card>
  )
}
