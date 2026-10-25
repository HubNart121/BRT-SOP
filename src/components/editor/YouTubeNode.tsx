'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useContext, useState } from 'react';
import { formatStart, youTubeWatchUrl, type VideoAttrs } from '@/lib/shared/content';
import { useDialog } from '../Dialogs';
import { IconPencil, IconTrash, IconVideo } from '../icons';
import { DiagramContext } from './DrawioNode';
import { VideoDialog } from './VideoDialog';

/** Block node: a YouTube clip with a title and a long description, stored inside the SOP content. */
export const YouTubeNode = Node.create({
  name: 'youtube',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      videoId: { default: null },
      start: { default: null },
      title: { default: '' },
      description: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-youtube]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-youtube': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YouTubeView);
  },
});

function YouTubeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { editable } = useContext(DiagramContext);
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const attrs = node.attrs as VideoAttrs;
  const watchUrl = youTubeWatchUrl(attrs);
  const embed = `https://www.youtube-nocookie.com/embed/${attrs.videoId}?rel=0${attrs.start ? `&start=${attrs.start}` : ''}`;

  return (
    <NodeViewWrapper className="video-block drawio-figure" data-drag-handle="" contentEditable={false}>
      <div className="fig-head">
        <span className="figcaption" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <IconVideo size={16} />
          วิดีโอ · YouTube
        </span>
        {editable && (
          <span className="fig-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              <IconPencil size={15} />
              แก้ไขวิดีโอ
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              aria-label="ลบวิดีโอ"
              onClick={async () => {
                if (await dialog.confirm({ title: 'ลบวิดีโอนี้ออกจากเอกสาร?', confirmLabel: 'ลบ', danger: true })) deleteNode();
              }}
            >
              <IconTrash size={15} />
            </button>
          </span>
        )}
      </div>

      <div className="video-body">
        <div className="video-title">{attrs.title}</div>
        <div className="video-frame no-print">
          <iframe
            src={embed}
            title={attrs.title || 'YouTube video'}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        {/* Printed copies cannot play video: show a thumbnail and the link instead */}
        <div className="video-print">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${attrs.videoId}/mqdefault.jpg`} alt="" />
          <span>
            ดูคลิป: {watchUrl}
            {attrs.start ? ` (เริ่มที่ ${formatStart(attrs.start)})` : ''}
          </span>
        </div>
        {attrs.description && <p className="video-desc">{attrs.description}</p>}
        <a className="small no-print" href={watchUrl} target="_blank" rel="noopener noreferrer">
          เปิดบน YouTube ↗
        </a>
      </div>

      {editing && (
        <VideoDialog
          initial={attrs}
          onSubmit={(next) => {
            updateAttributes(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </NodeViewWrapper>
  );
}
