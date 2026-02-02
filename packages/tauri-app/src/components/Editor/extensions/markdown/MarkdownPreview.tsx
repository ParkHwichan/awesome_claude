import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  // Simple markdown to HTML conversion
  const html = useMemo(() => parseMarkdown(content), [content]);

  return (
    <ScrollArea className="h-full">
      <div
        className="markdown-preview p-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .markdown-preview {
          color: var(--foreground);
          font-size: 14px;
          line-height: 1.7;
        }
        .markdown-preview h1 {
          font-size: 2em;
          font-weight: 600;
          margin: 0.67em 0;
          padding-bottom: 0.3em;
          border-bottom: 1px solid var(--border);
        }
        .markdown-preview h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin: 0.83em 0;
          padding-bottom: 0.3em;
          border-bottom: 1px solid var(--border);
        }
        .markdown-preview h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 1em 0;
        }
        .markdown-preview h4 {
          font-size: 1em;
          font-weight: 600;
          margin: 1.33em 0;
        }
        .markdown-preview h5 {
          font-size: 0.875em;
          font-weight: 600;
          margin: 1.5em 0;
        }
        .markdown-preview h6 {
          font-size: 0.85em;
          font-weight: 600;
          margin: 1.67em 0;
          color: var(--muted-foreground);
        }
        .markdown-preview p {
          margin: 1em 0;
        }
        .markdown-preview a {
          color: var(--primary);
          text-decoration: none;
        }
        .markdown-preview a:hover {
          text-decoration: underline;
        }
        .markdown-preview strong {
          font-weight: 600;
        }
        .markdown-preview em {
          font-style: italic;
        }
        .markdown-preview del {
          text-decoration: line-through;
          color: var(--muted-foreground);
        }
        .markdown-preview code {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.9em;
          background: var(--muted);
          padding: 0.2em 0.4em;
          border-radius: 4px;
        }
        .markdown-preview pre {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 1em;
          overflow-x: auto;
          margin: 1em 0;
        }
        .markdown-preview pre code {
          background: none;
          padding: 0;
          font-size: 0.875em;
          line-height: 1.5;
        }
        .markdown-preview blockquote {
          border-left: 4px solid var(--primary);
          padding-left: 1em;
          margin: 1em 0;
          color: var(--muted-foreground);
        }
        .markdown-preview ul, .markdown-preview ol {
          margin: 1em 0;
          padding-left: 2em;
        }
        .markdown-preview li {
          margin: 0.5em 0;
        }
        .markdown-preview ul {
          list-style-type: disc;
        }
        .markdown-preview ol {
          list-style-type: decimal;
        }
        .markdown-preview hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 2em 0;
        }
        .markdown-preview table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
        }
        .markdown-preview th, .markdown-preview td {
          border: 1px solid var(--border);
          padding: 0.5em 1em;
          text-align: left;
        }
        .markdown-preview th {
          background: var(--muted);
          font-weight: 600;
        }
        .markdown-preview img {
          max-width: 100%;
          border-radius: 6px;
          margin: 1em 0;
        }
        .markdown-preview .task-list-item {
          list-style-type: none;
          margin-left: -1.5em;
        }
        .markdown-preview .task-list-item input {
          margin-right: 0.5em;
        }
      `}</style>
    </ScrollArea>
  );
}

// Simple markdown parser (basic implementation)
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must be before other rules)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang || ''}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Task lists (must be before regular lists)
  html = html.replace(/^(\s*)- \[x\]\s+(.*)$/gm, '$1<li class="task-list-item"><input type="checkbox" checked disabled /> $2</li>');
  html = html.replace(/^(\s*)- \[ \]\s+(.*)$/gm, '$1<li class="task-list-item"><input type="checkbox" disabled /> $2</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Blockquotes
  html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br/>');

  // Horizontal rule
  html = html.replace(/^(?:---|\*\*\*|___)$/gm, '<hr />');

  // Unordered lists
  html = html.replace(/^[\s]*[-*+]\s+(.*)$/gm, '<li>$1</li>');

  // Ordered lists
  html = html.replace(/^[\s]*\d+\.\s+(.*)$/gm, '<li>$1</li>');

  // Wrap consecutive li elements in ul/ol
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    return '<ul>' + match + '</ul>';
  });

  // Tables (basic)
  const tableLines: string[] = [];
  const lines = html.split('\n');
  let inTable = false;
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableLines.length = 0;
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        processedLines.push(processTable(tableLines));
        inTable = false;
        tableLines.length = 0;
      }
      processedLines.push(line);
    }
  }
  if (inTable) {
    processedLines.push(processTable(tableLines));
  }
  html = processedLines.join('\n');

  // Paragraphs (must be last)
  html = html.replace(/^(?!<[a-z/]|$)(.+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  // Double line breaks to paragraph separation
  html = html.replace(/\n\n+/g, '\n');

  return html;
}

function processTable(lines: string[]): string {
  if (lines.length < 2) return lines.join('\n');

  const headerLine = lines[0];
  const separatorLine = lines[1];
  const bodyLines = lines.slice(2);

  // Check if second line is separator (contains dashes)
  if (!/^[\s|:-]+$/.test(separatorLine)) {
    return lines.join('\n');
  }

  const headerCells = headerLine.slice(1, -1).split('|').map(c => c.trim());
  const headerHtml = '<tr>' + headerCells.map(c => `<th>${c}</th>`).join('') + '</tr>';

  const bodyHtml = bodyLines.map(line => {
    const cells = line.slice(1, -1).split('|').map(c => c.trim());
    return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
  }).join('');

  return `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
}
