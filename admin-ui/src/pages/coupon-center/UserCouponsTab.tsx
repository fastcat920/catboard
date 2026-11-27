import { DownloadOutlined, GiftOutlined, MailOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography, type TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  exportUserCoupons,
  extendUserCoupon,
  fetchCouponTemplates,
  fetchUserCoupons,
  issueUserCoupon,
  retryCouponNotification,
  revokeUserCoupon,
  type CouponTemplate,
  type UserCoupon,
} from '@/api/services/couponCenter'
import { unwrap } from '@/api/request'
import { message, modal } from '@/app/staticApi'
import { downloadBuffer, csvFilename } from '@/utils/download'

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待生效', color: 'processing' }, available: { label: '可使用', color: 'success' }, locked: { label: '已锁定', color: 'warning' },
  used: { label: '已使用', color: 'blue' }, expired: { label: '已过期', color: 'default' }, revoked: { label: '已撤销', color: 'error' },
}
const SOURCE: Record<string, string> = { manual: '后台手动发放', newcomer: '新人邀请奖励', referral_newcomer: '新人邀请奖励', distribution_task: '平台批量发放', campaign: '邀请活动奖励' }
const NOTICE: Record<string, { label: string; color: string }> = {
  pending: { label: '等待投递', color: 'processing' }, sending: { label: '发送中', color: 'processing' }, sent: { label: '已发送', color: 'success' },
  failed: { label: '发送失败', color: 'error' }, disabled: { label: '未启用', color: 'default' },
}
const dateTime = (value?: number | null) => value ? dayjs.unix(value).format('YYYY-MM-DD HH:mm') : '-'
async function exportRows() {
  const result = await exportUserCoupons()
  if (result.code === 200) downloadBuffer(result.buffer, csvFilename('USER-COUPONS'))
}

export function UserCouponsTab() {
  const [templates, setTemplates] = useState<CouponTemplate[]>([])
  const [rows, setRows] = useState<UserCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState<{ current: number; pageSize: number; keyword: string; status?: string; templateId?: number }>({ current: 1, pageSize: 20, keyword: '' })
  const [revision, setRevision] = useState(0)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueForm] = Form.useForm<{ template_id: number; user_id: number }>()
  const [saving, setSaving] = useState(false)
  const { current, pageSize, keyword, status: queryStatus, templateId: queryTemplateId } = query

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      void fetchUserCoupons({ current, pageSize, keyword: keyword || undefined, status: queryStatus, template_id: queryTemplateId, refresh: revision || undefined })
        .then(async (result) => { setRows(await unwrap(Promise.resolve(result))); setTotal(Number(result.total || 0)) })
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [current, keyword, pageSize, queryStatus, queryTemplateId, revision])
  useEffect(() => { const timer = window.setTimeout(() => { void fetchCouponTemplates().then((result) => setTemplates(result.templates)) }, 0); return () => window.clearTimeout(timer) }, [])

  const issue = async () => {
    const values = await issueForm.validateFields()
    setSaving(true)
    try { await unwrap(issueUserCoupon(values.template_id, values.user_id)); message.success('优惠券已发放'); setIssueOpen(false); issueForm.resetFields(); setRevision((value) => value + 1) } finally { setSaving(false) }
  }
  const revoke = (row: UserCoupon) => modal.confirm({ title: '确认撤销该优惠券？', content: '撤销后用户将无法继续使用，操作不可直接恢复。', okText: '撤销', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => { await unwrap(revokeUserCoupon(row.id)); message.success('优惠券已撤销'); setRevision((value) => value + 1) } })
  const extend = (row: UserCoupon) => {
    let days = 30
    modal.confirm({ title: '延长优惠券有效期', content: <InputNumber min={1} max={3650} precision={0} defaultValue={30} addonAfter="天" className="w-100" onChange={(value) => { days = Number(value || 0) }} />, okText: '确认延期', cancelText: '取消', onOk: async () => { if (!days) return; await unwrap(extendUserCoupon(row.id, days)); message.success(`已延长 ${days} 天`); setRevision((value) => value + 1) } })
  }
  const retryMail = async (row: UserCoupon) => { await unwrap(retryCouponNotification(row.id)); message.success('邮件已重新加入发送队列'); setRevision((value) => value + 1) }
  const columns: TableColumnsType<UserCoupon> = [
    { title: '用户', width: 220, render: (_, row) => <div><strong>{row.user_email || `用户 ${row.user_id}`}</strong><div><Typography.Text type="secondary">ID {row.user_id}</Typography.Text></div></div> },
    { title: '优惠券', width: 190, render: (_, row) => row.template?.name ?? `模板 ${row.template_id}` },
    { title: '来源', width: 150, render: (_, row) => SOURCE[row.source] ?? row.source },
    { title: '状态', width: 100, render: (_, row) => <Tag color={(STATUS[row.status] ?? { color: 'default' }).color}>{STATUS[row.status]?.label ?? row.status}</Tag> },
    { title: '有效期', width: 190, render: (_, row) => <div>{dateTime(row.starts_at)}<div><Typography.Text type="secondary">至 {dateTime(row.expires_at)}</Typography.Text></div></div> },
    { title: '邮件通知', width: 130, render: (_, row) => row.notification_status ? <div><Tag color={NOTICE[row.notification_status]?.color ?? 'default'}>{NOTICE[row.notification_status]?.label ?? row.notification_status}</Tag>{row.notification_error && <div><Typography.Text type="danger" ellipsis={{ tooltip: row.notification_error }}>查看错误</Typography.Text></div>}</div> : '-' },
    { title: '关联订单', width: 110, render: (_, row) => row.order_id || '-' },
    { title: '操作', width: 235, fixed: 'right', render: (_, row) => <Space><Button type="link" onClick={() => extend(row)}>延期</Button>{['pending', 'available'].includes(row.status) && <Button type="link" danger icon={<StopOutlined />} onClick={() => revoke(row)}>撤销</Button>}{row.notification_status === 'failed' && <Button type="link" icon={<MailOutlined />} onClick={() => void retryMail(row)}>重发邮件</Button>}</Space> },
  ]

  return (
    <Card
      title="用户优惠券"
      extra={<Space wrap><Button icon={<DownloadOutlined />} onClick={() => void exportRows()}>导出</Button><Button type="primary" icon={<GiftOutlined />} onClick={() => setIssueOpen(true)}>手动发放</Button></Space>}
    >
      <Row gutter={[12, 12]} className="catboard-filter-bar catboard-filter-bar-four">
        <Col xs={24} md={8}><Input.Search allowClear placeholder="搜索用户邮箱" value={searchText} onChange={(event) => setSearchText(event.target.value)} onSearch={(value) => setQuery((previous) => ({ ...previous, current: 1, keyword: value.trim() }))} /></Col>
        <Col xs={12} md={5}><Select allowClear placeholder="全部状态" value={query.status} onChange={(value) => setQuery((previous) => ({ ...previous, current: 1, status: value }))} options={Object.entries(STATUS).map(([value, item]) => ({ value, label: item.label }))} className="w-100" /></Col>
        <Col xs={12} md={7}><Select allowClear showSearch optionFilterProp="label" placeholder="全部模板" value={query.templateId} onChange={(value) => setQuery((previous) => ({ ...previous, current: 1, templateId: value }))} options={templates.map((item) => ({ value: item.id, label: item.name }))} className="w-100" /></Col>
        <Col xs={24} md={4}><Button block icon={<ReloadOutlined />} loading={loading} onClick={() => setRevision((value) => value + 1)}>刷新</Button></Col>
      </Row>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} scroll={{ x: 1300 }} pagination={{ current: query.current, pageSize: query.pageSize, total, showSizeChanger: true, showTotal: (count) => `共 ${count} 张` }} onChange={(pagination) => setQuery((previous) => ({ ...previous, current: pagination.current ?? 1, pageSize: pagination.pageSize ?? 20 }))} />
      <Modal title="手动发放优惠券" open={issueOpen} onCancel={() => setIssueOpen(false)} onOk={() => void issue()} confirmLoading={saving} okText="确认发放" cancelText="取消" destroyOnHidden>
        <Form form={issueForm} layout="vertical" requiredMark={false}>
          <Form.Item name="template_id" label="优惠券模板" rules={[{ required: true, message: '请选择模板' }]}><Select showSearch optionFilterProp="label" options={templates.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
          <Form.Item name="user_id" label="用户 ID" rules={[{ required: true, message: '请输入用户 ID' }]}><InputNumber min={1} precision={0} className="w-100" /></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
