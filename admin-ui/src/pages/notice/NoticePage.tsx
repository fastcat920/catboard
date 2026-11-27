import { PlusOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Divider, Input, Modal, Select, Switch, type TableColumnsType } from 'antd'
import { useState } from 'react'
import { unwrap } from '@/api/request'
import { dropNotice, fetchNotice, fetchNotices, saveNotice, toggleNoticeShow } from '@/api/services/notice'
import type { Notice } from '@/api/types'
import { confirmDelete } from '@/components/confirmDelete'
import { FormGroup } from '@/components/FormGroup'
import { JsLink } from '@/components/JsLink'
import { TableBlock } from '@/components/TableBlock'
import { V2Table } from '@/components/table/V2Table'
import { AdminLayout } from '@/layouts/AdminLayout'
import { formatTime } from '@/utils/format'
import { NoticeEditor } from './NoticeEditor'

// 公告管理（原版模块 JZE9 + model lETv）
export default function NoticePage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const { data, isFetching } = useQuery({
    queryKey: ['notice', 'list', page],
    queryFn: async () => {
      const request = fetchNotices(page, pageSize)
      const notices = await unwrap(request)
      return { notices, total: (await request).total ?? notices.length }
    },
  })
  const notices = data?.notices ?? []
  const [visible, setVisible] = useState(false)
  const [submit, setSubmit] = useState<Partial<Notice>>({})

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['notice', 'list'] })

  const toggleModal = () => {
    const next = !visible
    setVisible(next)
    if (!next) setSubmit({})
  }

  const save = async () => {
    const res = await saveNotice({ ...submit })
    if (res.code !== 200) return
    void refetch()
    toggleModal()
  }

  const drop = async (record: Notice) => {
    const res = await dropNotice(record.id)
    if (res.code === 200) {
      if (notices.length === 1 && page > 1) setPage(page - 1)
      void refetch()
    }
  }

  const edit = async (id: number) => {
    const res = await fetchNotice(id)
    if (res.code === 200 && res.data) {
      setSubmit(res.data)
      setVisible(true)
    }
  }

  const columns: TableColumnsType<Notice> = [
    { title: '#', dataIndex: 'id', key: 'id' },
    {
      title: '显示',
      dataIndex: 'show',
      key: 'show',
      render: (show: number, record) => (
        <Switch
          size="small"
          checked={Boolean(show)}
          onChange={async () => {
            const res = await toggleNoticeShow(record.id)
            if (res.code === 200) void refetch()
          }}
        />
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record) => (
        <div>
          <strong>{title}</strong>
          {record.title_en && <div className="text-muted">{record.title_en}</div>}
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'right',
      render: (value: number) => formatTime(value),
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      align: 'right',
      fixed: 'right',
      render: (_: unknown, record) => (
        <div>
          <JsLink
            onClick={() => void edit(record.id)}
          >
            编辑
          </JsLink>
          <Divider orientation="vertical" />
          {/* 有意修正：原版公告删除没有确认，这里与优惠券、知识库等页面统一 */}
          <JsLink onClick={() => confirmDelete(() => drop(record))}>删除</JsLink>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout title="公告管理">
      <TableBlock
        loading={isFetching}
        toolbar={
          <Button icon={<PlusOutlined />} onClick={toggleModal}>
            添加公告
          </Button>
        }
      >
        <V2Table<Notice> dataSource={notices} pagination={{ current: page, pageSize, total: data?.total, showSizeChanger: false, onChange: setPage }} columns={columns} scroll={{ x: 950 }} />
      </TableBlock>
      <Modal
        title={submit.id ? '编辑公告' : '新建公告'}
        open={visible}
        destroyOnHidden
        width={720}
        onCancel={toggleModal}
        onOk={() => void save()}
        okText="提交"
        cancelText="取消"
      >
        <div>
          <FormGroup label="标题（中文）">
            <Input
              placeholder="请输入中文公告标题"
              value={submit.title}
              onChange={(e) => setSubmit({ ...submit, title: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="标题（英文）">
            <Input
              placeholder="请输入英文公告标题"
              value={submit.title_en ?? undefined}
              onChange={(e) => setSubmit({ ...submit, title_en: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="公告内容（中文）">
            <NoticeEditor
              label="公告内容（中文）"
              placeholder="输入中文公告正文"
              value={submit.content}
              onChange={(content) => setSubmit((previous) => ({ ...previous, content: content }))}
            />
          </FormGroup>
          <FormGroup label="公告内容（英文）">
            <NoticeEditor
              label="公告内容（英文）"
              placeholder="输入英文公告正文"
              value={submit.content_en}
              onChange={(content) => setSubmit((previous) => ({ ...previous, content_en: content }))}
            />
          </FormGroup>
          <FormGroup label="公告标签">
            <Select
              mode="tags"
              suffixIcon={null}
              value={submit.tags || []}
              style={{ width: '100%' }}
              placeholder="输入后回车添加标签"
              onChange={(tags: string[]) => setSubmit({ ...submit, tags: tags.length > 0 ? tags : null })}
            />
          </FormGroup>
          <FormGroup label="图片URL">
            <Input
              placeholder="请输入图片URL"
              value={submit.img_url ?? undefined}
              onChange={(e) => setSubmit({ ...submit, img_url: e.target.value })}
            />
          </FormGroup>
        </div>
      </Modal>
    </AdminLayout>
  )
}
