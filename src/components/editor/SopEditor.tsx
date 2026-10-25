'use client';

import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useState } from 'react';
import type { Diagram, TiptapDoc } from '@/lib/shared/types';
import {
  IconBold,
  IconFlow,
  IconItalic,
  IconLink,
  IconListOl,
  IconListUl,
  IconQuote,
  IconRedo,
  IconTable,
  IconUnderline,
  IconUndo,
  IconVideo,
} from '../icons';
import { useDialog } from '../Dialogs';
import { DiagramContext, DrawioNode, newBlockId } from './DrawioNode';
import { VideoDialog } from './VideoDialog';
import { YouTubeNode } from './YouTubeNode';

interface Props {
  content: TiptapDoc;
  editable: boolean;
  diagrams: Record<string, Diagram>;
  onChange?: () => void;
  onEditDiagram?: (blockId: string) => void;
  onReady?: (editor: Editor | null) => void;
}

export function buildExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    DrawioNode,
    YouTubeNode,
  ];
}

export function SopEditor({ content, editable, diagrams, onChange, onEditDiagram, onReady }: Props) {
  const editor = useEditor({
    extensions: buildExtensions(),
    content,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: { 'aria-label': 'เนื้อหา SOP', class: 'sop-content' },
    },
    onUpdate: ({ transaction }) => {
      if (transaction.docChanged) onChange?.();
    },
  });

  useEffect(() => {
    onReady?.(editor ?? null);
    return () => onReady?.(null);
  }, [editor, onReady]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  const ctx = useMemo(
    () => ({ diagrams, editable, onEdit: (id: string) => onEditDiagram?.(id) }),
    [diagrams, editable, onEditDiagram],
  );

  return (
    <DiagramContext.Provider value={ctx}>
      {editable && editor && <Toolbar editor={editor} onInsertDiagram={onEditDiagram} />}
      <div className="prose">
        <EditorContent editor={editor} />
      </div>
    </DiagramContext.Provider>
  );
}

function Toolbar({ editor, onInsertDiagram }: { editor: Editor; onInsertDiagram?: (blockId: string) => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      ol: e.isActive('orderedList'),
      ul: e.isActive('bulletList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const dialog = useDialog();
  const [addingVideo, setAddingVideo] = useState(false);

  function setBlock(v: string) {
    const c = editor.chain().focus();
    if (v === 'p') c.setParagraph().run();
    else c.toggleHeading({ level: v === 'h2' ? 2 : 3 }).run();
  }

  async function editLink() {
    const prev = (editor.getAttributes('link').href as string | undefined) ?? 'https://';
    const url = await dialog.prompt({
      title: 'ลิงก์',
      label: 'URL (เว้นว่างเพื่อลบลิงก์)',
      defaultValue: prev,
      placeholder: 'https://',
      validate: (v) =>
        !v.trim() || /^(https?:\/\/|mailto:)/i.test(v.trim()) ? null : 'ลิงก์ต้องขึ้นต้นด้วย http://, https:// หรือ mailto:',
    });
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  function insertDiagram() {
    const blockId = newBlockId();
    editor.chain().focus().insertContent({ type: 'drawio', attrs: { blockId } }).run();
    onInsertDiagram?.(blockId);
  }

  const btn = (active: boolean) => `tb-btn${active ? ' active' : ''}`;

  return (
    <div className="toolbar" role="toolbar" aria-label="จัดรูปแบบข้อความ">
      <select className="tb-select" value={s.block} onChange={(e) => setBlock(e.target.value)} aria-label="ประเภทย่อหน้า">
        <option value="p">ย่อหน้า</option>
        <option value="h2">หัวข้อ</option>
        <option value="h3">หัวข้อย่อย</option>
      </select>
      <button type="button" className={btn(s.bold)} aria-label="ตัวหนา" aria-pressed={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <IconBold size={16} />
      </button>
      <button type="button" className={btn(s.italic)} aria-label="ตัวเอียง" aria-pressed={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <IconItalic size={16} />
      </button>
      <button type="button" className={btn(s.underline)} aria-label="ขีดเส้นใต้" aria-pressed={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <IconUnderline size={16} />
      </button>
      <button type="button" className={btn(s.ol)} aria-label="รายการลำดับเลข" aria-pressed={s.ol} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <IconListOl size={18} />
      </button>
      <button type="button" className={btn(s.ul)} aria-label="รายการหัวข้อย่อย" aria-pressed={s.ul} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <IconListUl size={18} />
      </button>
      <button type="button" className={btn(s.quote)} aria-label="กล่องหมายเหตุ" aria-pressed={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <IconQuote size={18} />
      </button>
      <button type="button" className={btn(s.link)} aria-label="ลิงก์" aria-pressed={s.link} onClick={editLink}>
        <IconLink size={17} />
      </button>
      <button
        type="button"
        className="tb-btn"
        aria-label="แทรกตาราง"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <IconTable size={18} />
      </button>
      <span className="tb-sep" aria-hidden="true" />
      <button type="button" className="tb-btn flow" onClick={insertDiagram}>
        <IconFlow size={16} />
        แทรก Flowchart
      </button>
      <button type="button" className="tb-btn flow" onClick={() => setAddingVideo(true)}>
        <IconVideo size={17} />
        แทรกวิดีโอ
      </button>
      <span className="tb-sep" aria-hidden="true" />
      <button type="button" className="tb-btn" aria-label="เลิกทำ" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <IconUndo size={17} />
      </button>
      <button type="button" className="tb-btn" aria-label="ทำซ้ำ" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <IconRedo size={17} />
      </button>
      {s.table && (
        <>
          <span className="tb-sep" aria-hidden="true" />
          <button type="button" className="tb-btn" onClick={() => editor.chain().focus().addRowAfter().run()}>
            + แถว
          </button>
          <button type="button" className="tb-btn" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            + คอลัมน์
          </button>
          <button type="button" className="tb-btn" onClick={() => editor.chain().focus().deleteRow().run()}>
            − แถว
          </button>
          <button type="button" className="tb-btn" onClick={() => editor.chain().focus().deleteColumn().run()}>
            − คอลัมน์
          </button>
          <button type="button" className="tb-btn" style={{ color: 'var(--danger)' }} onClick={() => editor.chain().focus().deleteTable().run()}>
            ลบตาราง
          </button>
        </>
      )}
      {addingVideo && (
        <VideoDialog
          onSubmit={(attrs) => {
            setAddingVideo(false);
            editor.chain().focus().insertContent({ type: 'youtube', attrs }).run();
          }}
          onCancel={() => setAddingVideo(false)}
        />
      )}
    </div>
  );
}
