import { useEffect, useRef, useState, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import mermaid from 'mermaid';
import { ScrollArea } from '@/components/ui/scroll-area';

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#58a6ff',
    primaryTextColor: '#c9d1d9',
    primaryBorderColor: '#30363d',
    lineColor: '#8b949e',
    secondaryColor: '#21262d',
    tertiaryColor: '#161b22',
    background: '#0d1117',
    mainBkg: '#161b22',
    secondBkg: '#21262d',
    border1: '#30363d',
    border2: '#30363d',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
});

interface MarkdownPreviewProps {
  content: string;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Mermaid code block component - memoized to prevent unnecessary re-renders
const MermaidDiagram = memo(function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef<string>('');
  const renderingRef = useRef(false);

  useEffect(() => {
    // Skip if code hasn't changed or already rendering
    if (code === lastCodeRef.current || renderingRef.current) {
      return;
    }

    const renderDiagram = async () => {
      renderingRef.current = true;
      lastCodeRef.current = code;

      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);
        setSvg(renderedSvg);
        setError(null);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setSvg(null);
      } finally {
        renderingRef.current = false;
      }
    };

    renderDiagram();
  }, [code]);

  if (error) {
    return (
      <div className="mermaid-container">
        <pre className="mermaid-error">Mermaid Error: {error}</pre>
      </div>
    );
  }

  if (svg) {
    return (
      <div
        ref={containerRef}
        className="mermaid-container"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // Loading state with fixed height to prevent layout shift
  return (
    <div className="mermaid-container mermaid-loading">
      <div className="mermaid-placeholder">Loading diagram...</div>
    </div>
  );
}, (prevProps, nextProps) => prevProps.code === nextProps.code);

// Memoized ReactMarkdown components config
const markdownComponents = {
  // Custom code block renderer for mermaid
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const codeContent = String(children).replace(/\n$/, '');

    // Handle mermaid diagrams
    if (language === 'mermaid') {
      return <MermaidDiagram code={codeContent} />;
    }

    // Inline code (no language)
    if (!className) {
      return <code className="inline-code" {...props}>{children}</code>;
    }

    // Code blocks with syntax highlighting
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  // Custom link renderer
  a({ href, children, ...props }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="markdown-link"
        {...props}
      >
        {children}
      </a>
    );
  },
  // Custom table renderer
  table({ children, ...props }: any) {
    return (
      <div className="table-wrapper">
        <table {...props}>{children}</table>
      </div>
    );
  },
  // Custom checkbox for task lists
  input({ type, checked, ...props }: any) {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled
          className="task-checkbox"
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
};

// Memoized plugins arrays
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  // Debounce content to reduce re-renders during typing
  const debouncedContent = useDebounce(content, 150);

  return (
    <ScrollArea className="h-full">
      <div className="markdown-preview p-6">
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={markdownComponents}
        >
          {debouncedContent}
        </ReactMarkdown>
      </div>
      <style>{markdownStyles}</style>
    </ScrollArea>
  );
}

const markdownStyles = `
  .markdown-preview {
    color: var(--foreground);
    font-size: 14px;
    line-height: 1.7;
  }

  /* Headers */
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

  /* Paragraphs */
  .markdown-preview p {
    margin: 1em 0;
  }

  /* Links */
  .markdown-preview a,
  .markdown-preview .markdown-link {
    color: #58a6ff;
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s ease;
  }
  .markdown-preview a:hover,
  .markdown-preview .markdown-link:hover {
    border-bottom-color: #58a6ff;
  }

  /* Text styling */
  .markdown-preview strong {
    font-weight: 600;
    color: #e6edf3;
  }
  .markdown-preview em {
    font-style: italic;
  }
  .markdown-preview del {
    text-decoration: line-through;
    color: var(--muted-foreground);
  }

  /* Inline code */
  .markdown-preview code,
  .markdown-preview .inline-code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.9em;
    background: #21262d;
    padding: 0.2em 0.4em;
    border-radius: 6px;
    color: #e6edf3;
  }

  /* Code blocks */
  .markdown-preview pre {
    background: #161b22;
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
    color: #e6edf3;
  }

  /* Syntax highlighting (highlight.js) */
  .markdown-preview .hljs-keyword,
  .markdown-preview .hljs-selector-tag,
  .markdown-preview .hljs-literal,
  .markdown-preview .hljs-section,
  .markdown-preview .hljs-link {
    color: #ff7b72;
  }
  .markdown-preview .hljs-string,
  .markdown-preview .hljs-meta-string {
    color: #a5d6ff;
  }
  .markdown-preview .hljs-number,
  .markdown-preview .hljs-symbol,
  .markdown-preview .hljs-bullet {
    color: #79c0ff;
  }
  .markdown-preview .hljs-comment,
  .markdown-preview .hljs-quote {
    color: #8b949e;
    font-style: italic;
  }
  .markdown-preview .hljs-meta,
  .markdown-preview .hljs-meta-keyword {
    color: #79c0ff;
  }
  .markdown-preview .hljs-type,
  .markdown-preview .hljs-class .hljs-title,
  .markdown-preview .hljs-title.class_ {
    color: #ffa657;
  }
  .markdown-preview .hljs-function .hljs-title,
  .markdown-preview .hljs-title.function_ {
    color: #d2a8ff;
  }
  .markdown-preview .hljs-variable,
  .markdown-preview .hljs-template-variable,
  .markdown-preview .hljs-attr {
    color: #79c0ff;
  }
  .markdown-preview .hljs-regexp,
  .markdown-preview .hljs-selector-attr,
  .markdown-preview .hljs-selector-pseudo {
    color: #7ee787;
  }
  .markdown-preview .hljs-built_in,
  .markdown-preview .hljs-name {
    color: #ffa657;
  }
  .markdown-preview .hljs-deletion {
    color: #ffa198;
    background: rgba(248, 81, 73, 0.1);
  }
  .markdown-preview .hljs-addition {
    color: #7ee787;
    background: rgba(63, 185, 80, 0.1);
  }

  /* Blockquotes */
  .markdown-preview blockquote {
    border-left: 4px solid #58a6ff;
    padding-left: 1em;
    margin: 1em 0;
    color: var(--muted-foreground);
    background: rgba(88, 166, 255, 0.05);
    padding: 0.5em 1em;
    border-radius: 0 6px 6px 0;
  }
  .markdown-preview blockquote p {
    margin: 0.5em 0;
  }

  /* Lists */
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
  .markdown-preview li > ul, .markdown-preview li > ol {
    margin: 0.25em 0;
  }

  /* Task lists */
  .markdown-preview .task-list-item {
    list-style-type: none;
    margin-left: -1.5em;
  }
  .markdown-preview .task-checkbox {
    margin-right: 0.5em;
    width: 14px;
    height: 14px;
    accent-color: #58a6ff;
  }
  .markdown-preview input[type="checkbox"] {
    margin-right: 0.5em;
    accent-color: #58a6ff;
  }

  /* Horizontal rule */
  .markdown-preview hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2em 0;
  }

  /* Tables */
  .markdown-preview .table-wrapper {
    overflow-x: auto;
    margin: 1em 0;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .markdown-preview table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .markdown-preview th, .markdown-preview td {
    border: 1px solid var(--border);
    padding: 0.75em 1em;
    text-align: left;
  }
  .markdown-preview th {
    background: #21262d;
    font-weight: 600;
    color: #e6edf3;
  }
  .markdown-preview tr:nth-child(even) {
    background: rgba(33, 38, 45, 0.5);
  }
  .markdown-preview tr:hover {
    background: rgba(88, 166, 255, 0.05);
  }

  /* Images */
  .markdown-preview img {
    max-width: 100%;
    border-radius: 6px;
    margin: 1em 0;
    border: 1px solid var(--border);
  }

  /* Mermaid diagrams */
  .markdown-preview .mermaid-container {
    margin: 1.5em 0;
    padding: 1em;
    background: #161b22;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow-x: auto;
    display: flex;
    justify-content: center;
    min-height: 100px;
  }
  .markdown-preview .mermaid-container svg {
    max-width: 100%;
    height: auto;
  }
  .markdown-preview .mermaid-loading {
    align-items: center;
  }
  .markdown-preview .mermaid-placeholder {
    color: var(--muted-foreground);
    font-size: 0.9em;
  }
  .markdown-preview .mermaid-error {
    color: #f85149;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85em;
    padding: 0.5em;
    background: rgba(248, 81, 73, 0.1);
    border-radius: 4px;
  }

  /* Footnotes */
  .markdown-preview .footnotes {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid var(--border);
    font-size: 0.9em;
  }
  .markdown-preview .footnotes ol {
    padding-left: 1.5em;
  }

  /* Definition lists */
  .markdown-preview dl {
    margin: 1em 0;
  }
  .markdown-preview dt {
    font-weight: 600;
    margin-top: 1em;
  }
  .markdown-preview dd {
    margin-left: 2em;
    color: var(--muted-foreground);
  }

  /* Keyboard keys */
  .markdown-preview kbd {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85em;
    padding: 0.2em 0.4em;
    background: #21262d;
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
  }

  /* Abbreviations */
  .markdown-preview abbr {
    text-decoration: underline dotted;
    cursor: help;
  }
`;
