import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Typography, type TableColumnsType } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { dropReferralLevel, fetchReferralLevels, saveReferralLevel, type ReferralLevel, type RewardType } from '@/api/services/referral'
import { unwrap } from '@/api/request'
import { message, modal } from '@/app/staticApi'

interface LevelForm {
  name: string
  name_en?: string
  description?: string
  description_en?: string
  sort: number
  required_invites: number
  required_revenue: number
  commission_rate: number
  member_discount: number
  valid_days: number
  retain_invites: number
  retain_revenue: number
  reward_type: RewardType
  reward_value?: number
  enabled: boolean
}

const rewardLabel = (level: ReferralLevel) => {
  const reward = level.reward
  if (!reward || !reward.enabled) return '无'
  if (reward.reward_type === 'balance') return `账户余额：¥${(reward.reward_value / 100).toFixed(2)}`
  if (reward.reward_type === 'commission_balance') return `推广佣金：¥${(reward.reward_value / 100).toFixed(2)}`
  if (reward.reward_type === 'traffic') return `流量：${reward.reward_value} GB`
  if (reward.reward_type === 'duration') return `套餐时长：${reward.reward_value} 天`
  return '无'
}

function LevelEditor({ row, open, nextSort, onClose, onSaved }: { row: ReferralLevel | null; open: boolean; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<LevelForm>()
  const [saving, setSaving] = useState(false)
  const rewardType = Form.useWatch('reward_type', form) ?? 'none'

  useEffect(() => {
    if (!open) return
    const reward = row?.reward && row.reward.enabled ? row.reward : null
    form.setFieldsValue({
      name: row?.name ?? '',
      name_en: row?.name_en ?? '',
      description: row?.description ?? '',
      description_en: row?.description_en ?? '',
      sort: row?.sort ?? nextSort,
      required_invites: row?.required_invites ?? 0,
      required_revenue: (row?.required_revenue ?? 0) / 100,
      commission_rate: row?.commission_rate ?? 10,
      member_discount: row?.member_discount ?? 0,
      valid_days: row?.valid_days ?? 0,
      retain_invites: row?.retain_invites ?? 0,
      retain_revenue: (row?.retain_revenue ?? 0) / 100,
      reward_type: reward?.reward_type ?? 'none',
      reward_value: reward ? (['balance', 'commission_balance'].includes(reward.reward_type) ? reward.reward_value / 100 : reward.reward_value) : undefined,
      enabled: row ? Boolean(row.enabled) : true,
    })
  }, [form, nextSort, open, row])

  const save = async () => {
    const values = await form.validateFields()
    const moneyReward = values.reward_type === 'balance' || values.reward_type === 'commission_balance'
    setSaving(true)
    try {
      await unwrap(saveReferralLevel({
        id: row?.id,
        name: values.name.trim(),
        name_en: values.name_en?.trim(),
        description: values.description?.trim(),
        description_en: values.description_en?.trim(),
        sort: values.sort,
        required_invites: values.required_invites,
        required_revenue: Math.round(values.required_revenue * 100),
        commission_rate: values.commission_rate,
        member_discount: values.member_discount,
        valid_days: values.valid_days,
        retain_invites: values.retain_invites,
        retain_revenue: Math.round(values.retain_revenue * 100),
        enabled: values.enabled,
        reward_type: values.reward_type,
        reward_value: values.reward_type === 'none' ? 0 : moneyReward ? Math.round((values.reward_value || 0) * 100) : values.reward_value || 0,
      }))
      message.success('成长等级已保存')
      onClose()
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`${row ? '编辑' : '新增'}成长等级`} open={open} onCancel={onClose} onOk={() => void save()} confirmLoading={saving} okText="保存" cancelText="取消" width={820} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="name" label="中文名称" rules={[{ required: true, message: '请输入中文名称' }]}><Input maxLength={100} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="name_en" label="英文名称"><Input maxLength={100} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="description" label="中文描述"><Input maxLength={255} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="description_en" label="英文描述"><Input maxLength={255} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="sort" label="等级顺序" rules={[{ required: true }]}><InputNumber min={1} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="required_invites" label="有效邀请数" rules={[{ required: true }]}><InputNumber min={0} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="required_revenue" label="邀请成交额（元）" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-100" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="commission_rate" label="返佣比例（%）" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="member_discount" label="套餐优惠（%）" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="valid_days" label="有效期（天，0 为永久）" rules={[{ required: true }]}><InputNumber min={0} max={3650} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="retain_invites" label="保级邀请数" rules={[{ required: true }]}><InputNumber min={0} precision={0} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="retain_revenue" label="保级成交额（元）" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-100" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="reward_type" label="一次性达标奖励"><Select options={[{ value: 'none', label: '不发放' }, { value: 'balance', label: '账户余额' }, { value: 'commission_balance', label: '推广佣金' }, { value: 'traffic', label: '流量（GB）' }, { value: 'duration', label: '套餐时长（天）' }]} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="reward_value" label={rewardType === 'balance' || rewardType === 'commission_balance' ? '奖励金额（元）' : '奖励数值'} rules={rewardType === 'none' ? [] : [{ required: true, message: '请输入奖励数值' }]}><InputNumber disabled={rewardType === 'none'} min={0} precision={rewardType === 'balance' || rewardType === 'commission_balance' ? 2 : 0} className="w-100" /></Form.Item></Col>
          <Col span={24}><Typography.Paragraph type="secondary">用户首次达到本等级时发放一次；跨级升级会补发所有已达标等级奖励。</Typography.Paragraph></Col>
          <Col span={24}><Form.Item name="enabled" label="规则状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>
  )
}

export function LevelsTab() {
  const [rows, setRows] = useState<ReferralLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ReferralLevel | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await unwrap(fetchReferralLevels())) } finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const remove = (row: ReferralLevel) => modal.confirm({
    title: `删除成长等级“${row.name}”？`,
    okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
    onOk: async () => { await unwrap(dropReferralLevel(row.id)); message.success('等级已删除'); await load() },
  })

  const columns: TableColumnsType<ReferralLevel> = [
    { title: '等级顺序', dataIndex: 'sort', width: 100 },
    { title: '名称', render: (_, row) => <div><strong>{row.name}</strong>{row.name_en && <div><Typography.Text type="secondary">{row.name_en}</Typography.Text></div>}</div> },
    { title: '升级条件', render: (_, row) => `${row.required_invites} 人 + ¥${(row.required_revenue / 100).toFixed(2)}` },
    { title: '返佣比例', dataIndex: 'commission_rate', render: (value) => `${value}%` },
    { title: '套餐优惠', dataIndex: 'member_discount', render: (value) => value ? `减免 ${value}%` : '无' },
    { title: '达标奖励', render: (_, row) => rewardLabel(row) },
    { title: '状态', dataIndex: 'enabled', width: 90, render: (value) => <Tag color={value ? 'success' : 'default'}>{value ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 150, fixed: 'right', render: (_, row) => <Space><Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true) }}>编辑</Button><Button type="link" danger icon={<DeleteOutlined />} onClick={() => remove(row)}>删除</Button></Space> },
  ]

  const nextSort = rows.reduce((max, row) => Math.max(max, Number(row.sort || 0)), 0) + 10
  return (
    <Card title="成长等级（长期权益 + 一次性达标奖励）" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setEditorOpen(true) }}>新增</Button>}>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false} scroll={{ x: 1050 }} />
      <LevelEditor row={editing} open={editorOpen} nextSort={nextSort} onClose={() => setEditorOpen(false)} onSaved={() => void load()} />
    </Card>
  )
}
