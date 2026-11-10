import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';

export function RichTextEditor({ value, onChange, label }: { value: string; onChange: (html: string) => void; label: string }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Link.configure({ openOnClick: false })],
    content: value,
    editorProps: { attributes: { class: 'prose-editor min-h-[18rem] px-4 py-3 text-sm leading-relaxed focus:outline-none', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, false);
  }, [value, editor]);
  if (!editor) return null;
  const btn = (active: boolean) => `rounded p-1.5 ${active ? 'bg-harbor-100 text-harbor-800' : 'text-ink-soft hover:bg-harbor-50'}`;
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (leave empty to remove)', prev ?? 'https://');
    if (url === null) return;
    if (url === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  return (
    <div className="overflow-hidden rounded-lg border border-ink-line bg-white focus-within:border-harbor-500 focus-within:ring-2 focus-within:ring-harbor-500/20">
      <div className="flex flex-wrap gap-0.5 border-b border-ink-line bg-canvas px-2 py-1" role="toolbar" aria-label="Formatting">
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold"><Bold className="h-4 w-4" /></button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic className="h-4 w-4" /></button>
        <button type="button" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading 2"><Heading2 className="h-4 w-4" /></button>
        <button type="button" className={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="Heading 3"><Heading3 className="h-4 w-4" /></button>
        <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bulleted list"><List className="h-4 w-4" /></button>
        <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list"><ListOrdered className="h-4 w-4" /></button>
        <button type="button" className={btn(editor.isActive('link'))} onClick={setLink} aria-label="Link"><Link2 className="h-4 w-4" /></button>
        <span className="mx-1 w-px bg-ink-line" />
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()} aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()} aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
