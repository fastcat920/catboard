import {
  BoldOutlined, FontSizeOutlined, AlignLeftOutlined, ItalicOutlined,
  OrderedListOutlined, FontColorsOutlined, UnderlineOutlined, UnorderedListOutlined,
} from '@ant-design/icons'
import { Button, Popover, Tooltip } from 'antd'
import MarkdownIt from 'markdown-it'
import { useLayoutEffect, useRef, useState } from 'react'
import './NoticeEditor.scss'

const markdown = new MarkdownIt({ breaks: true })
const htmlTag = /<\/?[a-z][\w-]*(?:\s|\/?>)/i
const allowedTags = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'TABLE', 'TBODY',
  'TD', 'TH', 'THEAD', 'TR', 'U', 'UL',
])
const discardedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'TEMPLATE'])

const noticeColors = [
  { label: '红色', value: 'rgb(190, 42, 52)' },
  { label: '棕橙色', value: 'rgb(157, 81, 11)' },
  { label: '绿色', value: 'rgb(23, 118, 77)' },
  { label: '蓝色', value: 'rgb(27, 95, 184)' },
  { label: '紫色', value: 'rgb(116, 63, 171)' },
]
const defaultColorMarker = 'rgb(1, 2, 3)'

function cleanHtml(html: string) {
  const source = new DOMParser().parseFromString(html, 'text/html')
  const result = document.createElement('div')

  function append(node: Node, parent: HTMLElement) {
    if (node.nodeType === Node.TEXT_NODE) {
      let value = node.textContent ?? ''
      const blockStart = !node.previousSibling || (node.previousSibling instanceof Element &&
        ['BR', 'DIV', 'P'].includes(node.previousSibling.tagName))
      if (blockStart && !parent.closest('pre, code')) {
        value = value.replace(/^ +/, (spaces) => '\u00a0'.repeat(spaces.length))
      }
      parent.append(document.createTextNode(value))
      return
    }
    if (!(node instanceof Element) || discardedTags.has(node.tagName)) return
    let target = parent
    if (allowedTags.has(node.tagName) || node.tagName === 'FONT') {
      target = document.createElement(node.tagName === 'FONT' ? 'span' : node.tagName)
      if (node instanceof HTMLElement) {
        const color = node.style.color
        if (color === defaultColorMarker || color === 'inherit') {
          target.style.color = 'inherit'
        } else if (noticeColors.some(({ value }) => value === color)) {
          target.style.color = color
        }
      }
      const urlAttribute = node.tagName === 'A' ? 'href' : node.tagName === 'IMG' ? 'src' : null
      const url = urlAttribute && node.getAttribute(urlAttribute)
      if (url && urlAttribute) {
        try {
          const parsed = new URL(url, document.baseURI)
          if (['https:', 'http:'].includes(parsed.protocol) ||
              (urlAttribute === 'href' && parsed.protocol === 'mailto:')) {
            target.setAttribute(urlAttribute, url)
          }
        } catch {
          // Leave invalid URLs out of the announcement.
        }
      }
      const alt = node.tagName === 'IMG' ? node.getAttribute('alt') : null
      if (alt !== null) target.setAttribute('alt', alt)
      parent.append(target)
    }
    node.childNodes.forEach((child) => append(child, target))
  }

  source.body.childNodes.forEach((node) => append(node, result))
  if (!result.textContent?.trim() && !result.querySelector('img[src]')) return ''
  return result.innerHTML
}

function initialHtml(value: string) {
  if (htmlTag.test(value)) return cleanHtml(value)
  // Existing plain-text and Markdown announcements keep their formatting.
  const withoutIndent = value.replace(/^( +)/gm, (spaces) => '\u00a0'.repeat(spaces.length))
  return cleanHtml(markdown.render(withoutIndent).replace(/>\n(?=<)/g, '>'))
}

const toolbar = [
  { label: '加粗', command: 'bold', icon: BoldOutlined },
  { label: '斜体', command: 'italic', icon: ItalicOutlined },
  { label: '下划线', command: 'underline', icon: UnderlineOutlined },
  { label: '小标题', command: 'formatBlock', icon: FontSizeOutlined, argument: 'h3' },
  { label: '项目符号', command: 'insertUnorderedList', icon: UnorderedListOutlined },
  { label: '编号列表', command: 'insertOrderedList', icon: OrderedListOutlined },
  { label: '首行缩进', command: 'insertText', icon: AlignLeftOutlined, argument: '\u00a0\u00a0' },
]

export function NoticeEditor({ label, placeholder, value, onChange }: {
  label: string
  placeholder: string
  value?: string | null
  onChange: (value: string) => void
}) {
  const editor = useRef<HTMLDivElement>(null)
  const initialValue = useRef(value ?? '')
  const [empty, setEmpty] = useState(true)
  const [colorsOpen, setColorsOpen] = useState(false)
  const colorRange = useRef<Range | null>(null)

  useLayoutEffect(() => {
    const html = initialHtml(initialValue.current)
    if (editor.current) editor.current.innerHTML = html
    setEmpty(!html)
  }, [])

  const sync = () => {
    if (!editor.current) return
    const html = cleanHtml(editor.current.innerHTML)
    setEmpty(!html)
    onChange(html)
  }

  const rememberColorRange = () => {
    const selection = document.getSelection()
    if (editor.current && selection?.rangeCount && editor.current.contains(selection.anchorNode)
      && editor.current.contains(selection.focusNode)) {
      colorRange.current = selection.getRangeAt(0).cloneRange()
    }
  }

  const applyColor = (color: string) => {
    editor.current?.focus()
    if (colorRange.current && editor.current?.contains(colorRange.current.commonAncestorContainer)) {
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(colorRange.current)
    }
    document.execCommand('styleWithCSS', false, 'true')
    try {
      document.execCommand('foreColor', false, color)
    } finally {
      document.execCommand('styleWithCSS', false, 'false')
    }
    colorRange.current = null
    setColorsOpen(false)
    sync()
  }

  return (
    <div className="notice-editor">
      <div className="notice-editor__toolbar" role="group" aria-label={`${label}格式`}>
        {toolbar.map(({ label: action, command, icon: Icon, argument }) => (
          <Tooltip key={command} title={action}>
            <Button
              aria-label={action}
              type="text"
              size="small"
              icon={<Icon />}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.current?.focus()
                document.execCommand('styleWithCSS', false, 'false')
                document.execCommand(command, false, argument)
                sync()
              }}
            />
          </Tooltip>
        ))}
        <Popover
          trigger="click"
          placement="bottomLeft"
          open={colorsOpen}
          onOpenChange={(open) => {
            if (open) rememberColorRange()
            setColorsOpen(open)
          }}
          content={
            <div className="notice-editor-palette" role="group" aria-label="文字颜色">
              {noticeColors.map(({ label: colorName, value: color }) => (
                <Tooltip key={color} title={colorName}>
                  <button
                    type="button"
                    className="notice-editor-palette__swatch"
                    aria-label={colorName}
                    style={{ backgroundColor: color }}
                    onClick={() => applyColor(color)}
                  />
                </Tooltip>
              ))}
              <Button type="text" size="small" onClick={() => applyColor(defaultColorMarker)}>默认</Button>
            </div>
          }
        >
          <Button
            type="text"
            size="small"
            aria-label="文字颜色"
            aria-expanded={colorsOpen}
            icon={<FontColorsOutlined />}
            onMouseDown={(event) => {
              event.preventDefault()
              rememberColorRange()
            }}
          />
        </Popover>
      </div>
      <div
        ref={editor}
        className="notice-editor__body"
        data-empty={empty}
        data-placeholder={placeholder}
        aria-placeholder={placeholder}
        contentEditable
        role="textbox"
        aria-label={label}
        aria-multiline
        onInput={sync}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
          sync()
        }}
        onDrop={(event) => event.preventDefault()}
      />
    </div>
  )
}
