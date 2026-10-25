'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { createContext, useContext } from 'react';
import type { Diagram } from '@/lib/shared/types';
import { useDialog } from '../Dialogs';
import { IconFlow, IconPencil, IconTrash } from '../icons';

export interface DiagramCtx {
  diagrams: Record<string, Diagram>;
  editable: boolean;
  onEdit: (blockId: string) => void;
}

export const DiagramContext = createContext<DiagramCtx>({ diagrams: {}, editable: false, onEdit: () => undefined });

export function newBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return `fc-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Block node that references a draw.io diagram stored per version (sop_diagrams.block_id). */
export const DrawioNode = Node.create({
  name: 'drawio',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-block-id'),
        renderHTML: (attrs) => ({ 'data-block-id': attrs.blockId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-drawio]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-drawio': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawioView);
  },
});

function DrawioView({ node, deleteNode }: NodeViewProps) {
  const ctx = useContext(DiagramContext);
  const dialog = useDialog();
  const blockId = node.attrs.blockId as string;
  const diagram = ctx.diagrams[blockId];

  return (
    <NodeViewWrapper className="drawio-figure" data-drag-handle="" contentEditable={false}>
      <div className="fig-head">
        <span className="figcaption" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <IconFlow size={16} />
          Flowchart · draw.io
        </span>
        {ctx.editable && (
          <span className="fig-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ctx.onEdit(blockId)}>
              <IconPencil size={15} />
              แก้ไขผังงาน
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              aria-label="ลบ Flowchart"
              onClick={async () => {
                if (await dialog.confirm({ title: 'ลบ Flowchart นี้ออกจากเอกสาร?', confirmLabel: 'ลบ', danger: true })) {
                  deleteNode();
                }
              }}
            >
              <IconTrash size={15} />
            </button>
          </span>
        )}
      </div>
      {diagram?.preview_png_data ? (
        <div className="fig-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={diagram.preview_png_data}
            alt="Flowchart ขั้นตอนการทำงาน"
            // Previews are exported at 2× for sharp printing — show them at their natural size.
            onLoad={(e) => {
              e.currentTarget.style.width = `${Math.round(e.currentTarget.naturalWidth / 2)}px`;
            }}
          />
        </div>
      ) : (
        <div className="fig-empty">
          {diagram ? 'ยังไม่มีภาพตัวอย่างของผังงานนี้' : 'ยังไม่ได้วาดผังงาน'}
          {ctx.editable && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => ctx.onEdit(blockId)}>
              <IconPencil size={15} />
              เปิด draw.io เพื่อวาด
            </button>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}
