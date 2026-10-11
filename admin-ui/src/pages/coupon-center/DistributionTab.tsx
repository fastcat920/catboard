import { CloseCircleOutlined, EyeOutlined, FileTextOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Form, Input, Modal, Progress, Row, Select, Space, Switch, Table, Tag, Typography, type TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import {
  cancelDistributionTask,
  createDistributionTask,
  estimateCouponAudience,
  fetchCouponTemplates,
  fetchDistributionTasks,
  importDistributionTask,
  retryDistributionTask,
  type CouponAudienceFilters,
  type CouponPlan,
  type CouponTemplate,
  type DistributionStatus,
  type DistributionTask,
} from '@/api/services/couponCenter'
import { unwrap } from '@/api/request'
import { message, modal } from '@/app/staticApi'

interface TaskForm { template_id: number; name: string; user_ids?: string; emails?: string; plan_ids?: number[]; subscription_status?: '' | 'active' | 'expired'; never_purchased: boolean }
interface ImportForm { template_id: number; name: string; csv: string }
const STATUS: Record<DistributionStatus, { label: string; color: string }> = {
  pending: { label: '等待执行', color: 'processing' }, running: { label: '执行中', color: 'processing' }, completed: { label: '已完成', color: 'success' },
  partial: { label: '部分完成', color: 'warning' }, failed: { label: '执行失败', color: 'error' }, cancelled: { label: '已取消', color: 'default' },
}
const split = (value?: string) => (value ?? '').split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
const dateTime = (value?: number | null) => value ? dayjs.unix(value).format('YYYY-MM-DD HH:mm:ss') : '-'

function TaskDetail({ task, open, onClose }: { task: DistributionTask | null; open: boolean; onClose: () => void }) {
  if (!task) return null
  const filters = task.filters ?? {}
  return (
    <Modal title="发放任务详情" open={open} onCancel={onClose} footer={<Button onClick={onClose}>关闭</Button>} width={760}>
      {task.worker_warning && <Alert className="mb-3" type="warning" showIcon message="任务超过 5 分钟没有更新，请检查队列进程是否正常运行。" />}
      {task.last_error && <Alert className="mb-3" type="error" showIcon message="最近一次错误" description={task.last_error} />}
      <Descriptions bordered column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="任务名称">{task.name}</Descriptions.Item><Descriptions.Item label="状态"><Tag color={STATUS[task.status].color}>{STATUS[task.status].label}</Tag></Descriptions.Item>
        <Descriptions.Item label="预计人数">{task.estimated_count}</Descriptions.Item><Descriptions.Item label="处理进度">{task.processed_count} / {task.estimated_count}</Descriptions.Item>
        <Descriptions.Item label="发放成功">{task.success_count}</Descriptions.Item><Descriptions.Item label="跳过 / 失败">{task.skipped_count} / {task.failed_count}</Descriptions.Item>
        <Descriptions.Item label="批次">{task.completed_batches} / {task.total_batches}</Descriptions.Item><Descriptions.Item label="执行次数">{task.attempts}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{dateTime(task.created_at)}</Descriptions.Item><Descriptions.Item label="完成时间">{dateTime(task.completed_at)}</Descriptions.Item>
        <Descriptions.Item label="指定用户" span={2}>{filters.user_ids?.join('、') || filters.emails?.join('、') || '不限'}</Descriptions.Item>
        <Descriptions.Item label="套餐范围">{filters.plan_ids?.length ? `${filters.plan_ids.length} 个套餐` : '不限'}</Descriptions.Item>
        <Descriptions.Item label="订阅状态">{filters.subscription_status === 'active' ? '有效' : filters.subscription_status === 'expired' ? '已过期' : '不限'}</Descriptions.Item>
      </Descriptions>
    </Modal>
  )
}

export function DistributionTab() {
  const [form] = Form.useForm<TaskForm>()
  const [importForm] = Form.useForm<ImportForm>()
  const [templates, setTemplates] = useState<CouponTemplate[]>([])
  const [plans, setPlans] = useState<CouponPlan[]>([])
  const [tasks, setTasks] = useState<DistributionTask[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [estimate, setEstimate] = useState<number | null>(null)
  const [detail, setDetail] = useState<DistributionTask | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [templateResult, taskRows] = await Promise.all([fetchCouponTemplates(), unwrap(fetchDistributionTasks())])
      setTemplates(templateResult.templates); setPlans(templateResult.plans); setTasks(taskRows)
    } finally { if (!quiet) setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  const hasActive = tasks.some((task) => task.status === 'pending' || task.status === 'running')
  useEffect(() => {
    if (!hasActive) return
    const timer = window.setTimeout(() => void load(true), 3000)
    return () => window.clearTimeout(timer)
  }, [hasActive, load])

  const filtersFrom = (values: TaskForm): CouponAudienceFilters => ({
    user_ids: split(values.user_ids).map(Number).filter((id) => Number.isInteger(id) && id > 0), emails: split(values.emails), plan_ids: values.plan_ids ?? [],
    subscription_status: values.subscription_status ?? '', never_purchased: Boolean(values.never_purchased),
  })
  const estimateUsers = async () => {
    const values = await form.validateFields(['template_id'])
    setEstimating(true)
    try { setEstimate((await unwrap(estimateCouponAudience(filtersFrom(values as TaskForm)))).count) } finally { setEstimating(false) }
  }
  const submit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await unwrap(createDistributionTask(values.template_id, values.name.trim(), filtersFrom(values)))
      message.success('发放任务已创建')
      setEstimate(null)
      form.resetFields(['name', 'user_ids', 'emails', 'plan_ids', 'subscription_status', 'never_purchased'])
      await load()
    } finally { setSubmitting(false) }
  }
  const cancel = (task: DistributionTask) => modal.confirm({ title: `取消发放任务“${task.name}”？`, content: '已经发放成功的优惠券不会自动撤销。', okText: '取消任务', cancelText: '返回', okButtonProps: { danger: true }, onOk: async () => { await unwrap(cancelDistributionTask(task.id)); message.success('任务已取消'); await load() } })
  const retry = (task: DistributionTask) => modal.confirm({ title: '确认重试该任务？', content: task.status === 'failed' ? '将从中断位置继续执行。' : '只会重新处理失败的用户。', okText: '重试', cancelText: '取消', onOk: async () => { await unwrap(retryDistributionTask(task.id)); message.success('重试任务已提交'); await load() } })
  const submitImport = async () => {
    const values = await importForm.validateFields()
    setSubmitting(true)
    try { await unwrap(importDistributionTask(values.template_id, values.name.trim(), values.csv)); message.success('CSV 发放任务已创建'); setImportOpen(false); importForm.resetFields(); await load() } finally { setSubmitting(false) }
  }

  const columns: TableColumnsType<DistributionTask> = [
    { title: '任务', width: 210, render: (_, task) => <div><strong>{task.name}</strong><div><Typography.Text type="secondary">#{task.id} · {dateTime(task.created_at)}</Typography.Text></div></div> },
    { title: '状态', width: 120, render: (_, task) => <div><Tag color={STATUS[task.status].color}>{STATUS[task.status].label}</Tag>{task.worker_warning && <div><Typography.Text type="warning">队列可能异常</Typography.Text></div>}</div> },
    { title: '进度', width: 180, render: (_, task) => <Progress percent={Number(task.progress || 0)} size="small" status={task.status === 'failed' ? 'exception' : undefined} /> },
    { title: '人数', width: 150, render: (_, task) => `${task.success_count} 成功 / ${task.estimated_count} 预计` },
    { title: '跳过 / 失败', width: 120, render: (_, task) => `${task.skipped_count} / ${task.failed_count}` },
    { title: '操作', width: 200, fixed: 'right', render: (_, task) => <Space><Button type="link" icon={<EyeOutlined />} onClick={() => setDetail(task)}>详情</Button>{['pending', 'running'].includes(task.status) && <Button type="link" danger icon={<CloseCircleOutlined />} onClick={() => cancel(task)}>取消</Button>}{['partial', 'failed'].includes(task.status) && <Button type="link" icon={<ReloadOutlined />} onClick={() => retry(task)}>重试</Button>}</Space> },
  ]

  return (
    <Row gutter={[16, 16]} align="top">
      <Col xs={24} xl={8}>
        <Card title="创建发放任务" extra={<Button type="link" icon={<FileTextOutlined />} onClick={() => setImportOpen(true)}>CSV 导入</Button>}>
          <Form form={form} layout="vertical" requiredMark={false} initialValues={{ never_purchased: false, subscription_status: '' }}>
            <Form.Item name="template_id" label="优惠券模板" rules={[{ required: true, message: '请选择模板' }]}><Select placeholder="选择要发放的优惠券" options={templates.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
            <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}><Input maxLength={100} placeholder="例如：十月老用户回馈" /></Form.Item>
            <Form.Item name="user_ids" label="指定用户 ID"><Input.TextArea rows={2} placeholder="多个 ID 用逗号或换行分隔" /></Form.Item>
            <Form.Item name="emails" label="指定邮箱"><Input.TextArea rows={2} placeholder="多个邮箱用逗号或换行分隔" /></Form.Item>
            <Form.Item name="plan_ids" label="指定订阅"><Select mode="multiple" allowClear maxTagCount="responsive" placeholder="不选择代表不限订阅" options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} /></Form.Item>
            <Form.Item name="subscription_status" label="订阅状态"><Select options={[{ value: '', label: '不限' }, { value: 'active', label: '有效订阅' }, { value: 'expired', label: '无有效订阅' }]} /></Form.Item>
            <Form.Item name="never_purchased" valuePropName="checked"><Switch checkedChildren="仅从未购买" unCheckedChildren="不限购买记录" /></Form.Item>
            {estimate !== null && <Alert className="mb-3" type="info" showIcon message={`预计发放 ${estimate} 人`} />}
            <Space wrap><Button loading={estimating} onClick={() => void estimateUsers()}>预估人数</Button><Button type="primary" icon={<PlayCircleOutlined />} loading={submitting} onClick={() => void submit()}>创建并执行</Button></Space>
          </Form>
        </Card>
      </Col>
      <Col xs={24} xl={16}>
        <Card title="发放任务" extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>}>
          <Table rowKey="id" loading={loading} columns={columns} dataSource={tasks} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 980 }} />
        </Card>
      </Col>
      <TaskDetail task={detail} open={Boolean(detail)} onClose={() => setDetail(null)} />
      <Modal title="CSV 导入发放" open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => void submitImport()} confirmLoading={submitting} okText="创建任务" cancelText="取消" destroyOnHidden>
        <Alert className="mb-3" type="info" showIcon message="每行填写一个用户 ID 或邮箱，系统会自动去重并忽略无效行。" />
        <Form form={importForm} layout="vertical" requiredMark={false}>
          <Form.Item name="template_id" label="优惠券模板" rules={[{ required: true, message: '请选择模板' }]}><Select options={templates.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}><Input maxLength={100} /></Form.Item>
          <Form.Item name="csv" label="用户 ID 或邮箱" rules={[{ required: true, message: '请输入用户 ID 或邮箱' }]}><Input.TextArea rows={10} /></Form.Item>
        </Form>
      </Modal>
    </Row>
  )
}
