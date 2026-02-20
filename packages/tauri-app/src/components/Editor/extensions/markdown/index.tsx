import { EyeIcon, EditIcon, SplitIcon } from 'lucide-react';
import type { EditorExtension, ExtensionContext, ExtensionAction } from '../types';
import { MarkdownPreview } from './MarkdownPreview';

export type MarkdownViewMode = 'edit' | 'preview' | 'split';

export const markdownExtension: EditorExtension = {
  id: 'markdown',
  name: 'Markdown',
  fileExtensions: ['.md', '.markdown', '.mdx'],
  languages: ['markdown'],
  viewMode: 'toggle',

  getActions: (context: ExtensionContext): ExtensionAction[] => {
    const viewMode = (context.state.viewMode as MarkdownViewMode) || 'split';

    return [
      {
        id: 'edit-mode',
        label: 'Edit',
        icon: <EditIcon className="w-4 h-4" />,
        isActive: viewMode === 'edit',
        tooltip: 'Edit mode',
        onClick: () => context.setState({ viewMode: 'edit' }),
      },
      {
        id: 'preview-mode',
        label: 'Preview',
        icon: <EyeIcon className="w-4 h-4" />,
        isActive: viewMode === 'preview',
        tooltip: 'Preview mode',
        onClick: () => context.setState({ viewMode: 'preview' }),
      },
      {
        id: 'split-mode',
        label: 'Split',
        icon: <SplitIcon className="w-4 h-4" />,
        isActive: viewMode === 'split',
        tooltip: 'Split view (Editor + Preview)',
        onClick: () => context.setState({ viewMode: 'split' }),
      },
    ];
  },

  getView: (context: ExtensionContext) => {
    const viewMode = (context.state.viewMode as MarkdownViewMode) || 'split';

    if (viewMode === 'preview') {
      return <MarkdownPreview content={context.content} />;
    }

    // For 'split' mode, this returns the preview side
    // The editor will be shown separately
    if (viewMode === 'split') {
      return <MarkdownPreview content={context.content} />;
    }

    // 'edit' mode returns null - just show the editor
    return null;
  },
};
