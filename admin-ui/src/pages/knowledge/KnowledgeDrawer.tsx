import { LoadingOutlined } from '@ant-design/icons'
import { Button, Col, Drawer, Input, Row } from 'antd'
import MarkdownIt from 'markdown-it'
import { cloneElement, useState, type MouseEventHandler, type ReactElement } from 'react'
import MdEditor from 'react-markdown-editor-lite'
import 'react-markdown-editor-lite/lib/index.css'
import { fetchKnowledge, saveKnowledge } from '@/api/services/knowledge'
import type { Knowledge } from '@/api/types'
import { message } from '@/app/staticApi'
import { FormGroup } from '@/components/FormGroup'

const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true })
// 与原版一致：菜单栏 + 编辑区 + 预览区（html 使用默认值 true）。
// 原版编辑器只在菜单不可用时才显示「隐藏菜单」按钮，1.4.2 改成了菜单可用时显示，这里关掉以保持原样
const EDITOR_CONFIG = {
  view: { menu: true, md: true, fullScreen: true, hideMenu: true },
  canView: { hideMenu: false },
}

interface KnowledgeDrawerProps {
  id?: number
  /** 保存成功后刷新列表（原版 knowledge/save 之后 put fetch） */
  onSaved: () => Promise<unknown>
  /** 点击后打开抽屉的元素（原版用 cloneElement 覆盖它的 onClick） */
  children: ReactElement<{ onClick?: MouseEventHandler }>
}

// 新增 / 编辑知识抽屉（原版模块 jJ5y 里的抽屉）。与原版一致：保存成功后抽屉保持打开，只提示「保存成功」。
export function KnowledgeDrawer({ id, onSaved, children }: KnowledgeDrawerProps) {
  const [visible, setVisible] = useState(false)
  const [knowledge, setKnowledge] = useState<Partial<Knowledge>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // 每次打开都重新挂载编辑器（原版 this.key = Math.random()）
  const [editorKey, setEditorKey] = useState(0)

  const change = <K extends keyof Knowledge>(key: K, value: Knowledge[K]) => setKnowledge((k) => ({ ...k, [key]: value }))

  const show = async () => {
    setVisible(true)
    setEditorKey((k) => k + 1)
    if (!id) return
    setLoading(true)
    const res = await fetchKnowledge(id)
    setLoading(false)
    if (res.code === 200 && res.data) setKnowledge(res.data)
  }

  const hide = () => {
    setKnowledge({})
    setVisible(false)
  }

  const save = async () => {
    setSaving(true)
    const res = await saveKnowledge({ ...knowledge })
    setSaving(false)
    if (res.code !== 200) return
    // 与原版一致：列表在后台刷新，保存成功的提示不等刷新完成
    void onSaved()
    message.success('保存成功')
  }

  return (
    <>
      {cloneElement(children, { onClick: () => void show() })}
      <Drawer size="80%" open={visible} title={id ? '编辑知识' : '新增知识'} id="knowledge" onClose={hide}>
        {loading ? (
          <LoadingOutlined />
        ) : (
          <div>
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <FormGroup label="标题（中文）">
                  <Input
                    placeholder="请输入中文知识标题"
                    value={knowledge.title}
                    onChange={(e) => change('title', e.target.value)}
                  />
                </FormGroup>
              </Col>
              <Col xs={24} lg={12}>
                <FormGroup label="标题（英文）">
                  <Input
                    placeholder="请输入英文知识标题"
                    value={knowledge.title_en ?? undefined}
                    onChange={(e) => change('title_en', e.target.value)}
                  />
                </FormGroup>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <FormGroup label="分类（中文）">
                  <Input
                    placeholder="请输入中文分类，分类将会自动归集"
                    value={knowledge.category}
                    onChange={(e) => change('category', e.target.value)}
                  />
                </FormGroup>
              </Col>
              <Col xs={24} lg={12}>
                <FormGroup label="分类（英文）">
                  <Input
                    placeholder="请输入英文分类"
                    value={knowledge.category_en ?? undefined}
                    onChange={(e) => change('category_en', e.target.value)}
                  />
                </FormGroup>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} xl={12}>
                <FormGroup label="内容（中文）">
                  <MdEditor
                    key={`zh-${editorKey}`}
                    style={{ height: '500px' }}
                    renderHTML={(text) => markdown.render(text)}
                    value={knowledge.body}
                    onChange={({ text }) => change('body', text)}
                    config={EDITOR_CONFIG}
                  />
                </FormGroup>
              </Col>
              <Col xs={24} xl={12}>
                <FormGroup label="内容（英文）">
                  <MdEditor
                    key={`en-${editorKey}`}
                    style={{ height: '500px' }}
                    renderHTML={(text) => markdown.render(text)}
                    value={knowledge.body_en ?? undefined}
                    onChange={({ text }) => change('body_en', text)}
                    config={EDITOR_CONFIG}
                  />
                </FormGroup>
              </Col>
            </Row>
          </div>
        )}
        <div className="v2board-drawer-action">
          <Button style={{ marginRight: 8 }} onClick={hide}>
            取消
          </Button>
          <Button loading={saving} onClick={() => void save()} type="primary">
            提交
          </Button>
        </div>
      </Drawer>
    </>
  )
}
