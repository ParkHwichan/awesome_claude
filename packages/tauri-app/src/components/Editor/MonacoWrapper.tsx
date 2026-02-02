import { useRef, useEffect, useCallback, useState } from 'react';
import Editor, { type OnMount, type OnChange, loader, type BeforeMount, type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { invoke } from '@tauri-apps/api/core';
import { GITHUB_DARK_THEME } from './types';
import { useEditorStore, type GoToLocation } from '@/store/editor-store';

// Configure Monaco loader
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs',
  },
});

// Track if theme has been defined globally
let themeInitialized = false;

// Cache for tsconfig per project root
const tsconfigCache = new Map<string, TsConfigResult | null>();

interface TsConfigResult {
  configPath: string;
  compilerOptions: Record<string, unknown>;
  paths?: Record<string, string[]>;
  baseUrl?: string;
}

interface ResolvedImport {
  filePath: string;
  lineNumber: number | null;
}

interface MonacoWrapperProps {
  content: string;
  filePath: string;
  language: string;
  projectRoot: string;
  isReadOnly?: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
}

// Convert tsconfig compilerOptions to Monaco format
function convertToMonacoOptions(
  tsconfig: TsConfigResult,
  monaco: Monaco
) {
  const opts = tsconfig.compilerOptions;
  const ts = monaco.languages.typescript;

  // Target mapping
  const targetMap: Record<string, number> = {
    es3: ts.ScriptTarget.ES3,
    es5: ts.ScriptTarget.ES5,
    es6: ts.ScriptTarget.ES2015,
    es2015: ts.ScriptTarget.ES2015,
    es2016: ts.ScriptTarget.ES2016,
    es2017: ts.ScriptTarget.ES2017,
    es2018: ts.ScriptTarget.ES2018,
    es2019: ts.ScriptTarget.ES2019,
    es2020: ts.ScriptTarget.ES2020,
    es2021: ts.ScriptTarget.ES2021,
    es2022: ts.ScriptTarget.ES2022,
    esnext: ts.ScriptTarget.ESNext,
  };

  // Module mapping
  const moduleMap: Record<string, number> = {
    none: ts.ModuleKind.None,
    commonjs: ts.ModuleKind.CommonJS,
    amd: ts.ModuleKind.AMD,
    umd: ts.ModuleKind.UMD,
    system: ts.ModuleKind.System,
    es6: ts.ModuleKind.ES2015,
    es2015: ts.ModuleKind.ES2015,
    es2020: ts.ModuleKind.ES2015, // Monaco doesn't have ES2020
    es2022: ts.ModuleKind.ES2015,
    esnext: ts.ModuleKind.ESNext,
    node16: ts.ModuleKind.ESNext,
    nodenext: ts.ModuleKind.ESNext,
    preserve: ts.ModuleKind.ESNext,
  };

  // Module resolution mapping
  const moduleResolutionMap: Record<string, number> = {
    classic: ts.ModuleResolutionKind.Classic,
    node: ts.ModuleResolutionKind.NodeJs,
    node10: ts.ModuleResolutionKind.NodeJs,
    node16: ts.ModuleResolutionKind.NodeJs,
    nodenext: ts.ModuleResolutionKind.NodeJs,
    bundler: ts.ModuleResolutionKind.NodeJs,
  };

  // JSX mapping
  const jsxMap: Record<string, number> = {
    none: ts.JsxEmit.None,
    preserve: ts.JsxEmit.Preserve,
    react: ts.JsxEmit.React,
    'react-jsx': ts.JsxEmit.ReactJSX,
    'react-jsxdev': ts.JsxEmit.ReactJSXDev,
    'react-native': ts.JsxEmit.ReactNative,
  };

  const target = typeof opts.target === 'string'
    ? targetMap[opts.target.toLowerCase()] ?? ts.ScriptTarget.ESNext
    : ts.ScriptTarget.ESNext;

  const module = typeof opts.module === 'string'
    ? moduleMap[opts.module.toLowerCase()] ?? ts.ModuleKind.ESNext
    : ts.ModuleKind.ESNext;

  const moduleResolution = typeof opts.moduleResolution === 'string'
    ? moduleResolutionMap[opts.moduleResolution.toLowerCase()] ?? ts.ModuleResolutionKind.NodeJs
    : ts.ModuleResolutionKind.NodeJs;

  const jsx = typeof opts.jsx === 'string'
    ? jsxMap[opts.jsx.toLowerCase()] ?? ts.JsxEmit.ReactJSX
    : ts.JsxEmit.ReactJSX;

  return {
    target,
    module,
    moduleResolution,
    jsx,
    allowJs: opts.allowJs as boolean ?? true,
    checkJs: opts.checkJs as boolean ?? false,
    strict: opts.strict as boolean ?? false,
    noImplicitAny: opts.noImplicitAny as boolean ?? false,
    noImplicitThis: opts.noImplicitThis as boolean ?? false,
    strictNullChecks: opts.strictNullChecks as boolean ?? false,
    strictFunctionTypes: opts.strictFunctionTypes as boolean ?? false,
    strictPropertyInitialization: opts.strictPropertyInitialization as boolean ?? false,
    esModuleInterop: opts.esModuleInterop as boolean ?? true,
    allowSyntheticDefaultImports: opts.allowSyntheticDefaultImports as boolean ?? true,
    skipLibCheck: opts.skipLibCheck as boolean ?? true,
    noEmit: true,
    isolatedModules: opts.isolatedModules as boolean ?? true,
    resolveJsonModule: opts.resolveJsonModule as boolean ?? true,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    // Important: Set baseUrl if available
    baseUrl: tsconfig.baseUrl || undefined,
    // paths will be handled separately
  };
}

// Get project root from file path (directory containing tsconfig)
function getProjectRoot(configPath: string): string {
  // Extract directory from config path
  const parts = configPath.replace(/\\/g, '/').split('/');
  parts.pop(); // Remove filename
  return parts.join('/');
}

export function MonacoWrapper({
  content,
  filePath,
  language,
  projectRoot,
  isReadOnly = false,
  onChange,
  onSave,
}: MonacoWrapperProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  // Get pending go-to location from store
  const pendingGoTo = useEditorStore((state) => state.pendingGoTo);
  const clearPendingGoTo = useEditorStore((state) => state.clearPendingGoTo);
  const goToLocation = useEditorStore((state) => state.goToLocation);

  // Load tsconfig when file path changes
  useEffect(() => {
    if (!filePath || !monacoRef.current) return;
    if (language !== 'typescript' && language !== 'javascript') return;

    const loadTsConfig = async () => {
      try {
        // Check cache first by looking at parent directories
        const fileDir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');

        // Check if any cached config path is a parent of this file
        for (const [cachedConfigPath, cachedConfig] of tsconfigCache.entries()) {
          const cachedRoot = getProjectRoot(cachedConfigPath);
          if (fileDir.startsWith(cachedRoot)) {
            if (cachedConfig && monacoRef.current) {
              applyTsConfig(cachedConfig, monacoRef.current);
            }
            setConfigLoaded(true);
            return;
          }
        }

        // Load tsconfig from backend
        const result = await invoke<TsConfigResult | null>('find_tsconfig', { filePath });

        if (result) {
          tsconfigCache.set(result.configPath, result);
          if (monacoRef.current) {
            applyTsConfig(result, monacoRef.current);
          }
        } else {
          // Cache the fact that no tsconfig was found
          tsconfigCache.set(fileDir, null);
        }
        setConfigLoaded(true);
      } catch (err) {
        console.error('Failed to load tsconfig:', err);
        setConfigLoaded(true);
      }
    };

    loadTsConfig();
  }, [filePath, language]);

  // Apply tsconfig to Monaco
  const applyTsConfig = useCallback((config: TsConfigResult, monaco: Monaco) => {
    const compilerOptions = convertToMonacoOptions(config, monaco);

    // Apply to TypeScript
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);

    // Enable diagnostics now that we have proper config
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
      // Ignore specific error codes that are common when module resolution doesn't work perfectly
      diagnosticCodesToIgnore: [
        2307, // Cannot find module
        2304, // Cannot find name (for globals)
        2503, // Cannot find namespace
        7016, // Could not find declaration file
        2339, // Property does not exist on type (often false positive)
      ],
    });

    // Apply to JavaScript
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
      diagnosticCodesToIgnore: [2307, 2304, 2503, 7016, 2339],
    });

    console.log('Applied tsconfig from:', config.configPath);
  }, []);

  // Configure defaults before mount
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    // Define theme BEFORE editor mounts to prevent flash
    if (!themeInitialized) {
      monaco.editor.defineTheme('github-dark', GITHUB_DARK_THEME);
      themeInitialized = true;
    }

    const ts = monaco.languages.typescript;

    // Set sensible defaults before tsconfig is loaded
    const defaultOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      checkJs: false,
      strict: false,
      skipLibCheck: true,
      noEmit: true,
      isolatedModules: true,
      resolveJsonModule: true,
    };

    ts.typescriptDefaults.setCompilerOptions(defaultOptions);
    ts.javascriptDefaults.setCompilerOptions(defaultOptions);

    // Start with semantic validation disabled until tsconfig loads
    const diagnosticsOptions = {
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    };

    ts.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
    ts.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  }, []);

  // Handle Ctrl+Click to go to definition
  const handleCtrlClick = useCallback(async (
    editor: editor.IStandaloneCodeEditor,
    monaco: Monaco,
    position: { lineNumber: number; column: number }
  ) => {
    const model = editor.getModel();
    if (!model) return;

    const line = model.getLineContent(position.lineNumber);

    // Try to find import/require statement on this line
    const importMatch = line.match(
      /(?:import\s+.*\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"])/
    );

    if (importMatch) {
      const importPath = importMatch[1] || importMatch[2] || importMatch[3] || importMatch[4];
      if (importPath) {
        try {
          const resolved = await invoke<ResolvedImport | null>('resolve_import_path', {
            importPath,
            fromFile: filePath,
            projectRoot,
          });

          if (resolved) {
            goToLocation({
              filePath: resolved.filePath,
              lineNumber: resolved.lineNumber || 1,
            });
            return;
          }
        } catch (err) {
          console.error('Failed to resolve import:', err);
        }
      }
    }

    // Try to find word at cursor position and check if it's a path-like string
    const wordAtPosition = model.getWordAtPosition(position);
    if (wordAtPosition) {
      // Check if cursor is inside a string
      const beforeWord = line.substring(0, position.column - 1);
      const afterWord = line.substring(position.column - 1);

      const stringMatch = beforeWord.match(/['"]([^'"]*?)$/);
      const stringEnd = afterWord.match(/^([^'"]*?)['"]/);

      if (stringMatch && stringEnd) {
        const fullString = stringMatch[1] + stringEnd[1];

        // Check if it looks like a file path
        if (fullString.match(/^\.{0,2}\/|^@\/|^~\//)) {
          try {
            const resolved = await invoke<ResolvedImport | null>('resolve_import_path', {
              importPath: fullString,
              fromFile: filePath,
              projectRoot,
            });

            if (resolved) {
              goToLocation({
                filePath: resolved.filePath,
                lineNumber: resolved.lineNumber || 1,
              });
            }
          } catch (err) {
            console.error('Failed to resolve path:', err);
          }
        }
      }
    }
  }, [filePath, projectRoot, goToLocation]);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Ensure theme is applied (should already be defined in beforeMount)
    monaco.editor.setTheme('github-dark');

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    // Add Ctrl+Click handler for go-to-definition
    editor.onMouseDown((e) => {
      if (e.event.ctrlKey || e.event.metaKey) {
        if (e.target.position) {
          e.event.preventDefault();
          e.event.stopPropagation();
          handleCtrlClick(editor, monaco, e.target.position);
        }
      }
    });

    // Change cursor to pointer when Ctrl is held over clickable content
    editor.onMouseMove((e) => {
      if ((e.event.ctrlKey || e.event.metaKey) && e.target.position) {
        const model = editor.getModel();
        if (model) {
          const line = model.getLineContent(e.target.position.lineNumber);
          // Check if line has import/require
          if (line.match(/import|require|from\s+['"]/)) {
            editor.getDomNode()?.style.setProperty('cursor', 'pointer');
            return;
          }
        }
      }
      editor.getDomNode()?.style.removeProperty('cursor');
    });

    // Mark editor as ready after a short delay to ensure tokenization starts
    requestAnimationFrame(() => {
      setEditorReady(true);
      editor.focus();
    });
  }, [onSave, handleCtrlClick]);

  const handleEditorChange: OnChange = useCallback((value) => {
    if (value !== undefined) {
      onChange?.(value);
    }
  }, [onChange]);

  // Update editor options when readOnly changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ readOnly: isReadOnly });
    }
  }, [isReadOnly]);

  // Handle pending go-to location (scroll to line after file loads)
  useEffect(() => {
    if (pendingGoTo && pendingGoTo.filePath === filePath && editorRef.current) {
      const editor = editorRef.current;

      // Wait a tick for content to be rendered
      requestAnimationFrame(() => {
        // Go to line and center it in the viewport
        editor.revealLineInCenter(pendingGoTo.lineNumber);

        // Set cursor position
        editor.setPosition({
          lineNumber: pendingGoTo.lineNumber,
          column: pendingGoTo.column || 1,
        });

        // Highlight the line briefly
        const decorations = editor.createDecorationsCollection([
          {
            range: {
              startLineNumber: pendingGoTo.lineNumber,
              startColumn: 1,
              endLineNumber: pendingGoTo.lineNumber,
              endColumn: 1,
            },
            options: {
              isWholeLine: true,
              className: 'go-to-line-highlight',
              glyphMarginClassName: 'go-to-line-glyph',
            },
          },
        ]);

        // Remove highlight after animation
        setTimeout(() => {
          decorations.clear();
        }, 1500);

        // Clear the pending go-to
        clearPendingGoTo();

        // Focus editor
        editor.focus();
      });
    }
  }, [pendingGoTo, filePath, clearPendingGoTo]);

  return (
    <div
      className="h-full transition-opacity duration-150"
      style={{ opacity: editorReady ? 1 : 0 }}
    >
      <Editor
        height="100%"
        language={language}
        value={content}
        path={filePath} // Important: Set path for multi-file support
        theme="github-dark"
        beforeMount={handleBeforeMount}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
        options={{
          readOnly: isReadOnly,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          minimap: { enabled: true, scale: 1, maxColumn: 80 },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          automaticLayout: true,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          guides: {
            indentation: true,
            bracketPairs: true,
          },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          padding: { top: 8, bottom: 8 },
          folding: true,
          foldingHighlight: true,
          showFoldingControls: 'mouseover',
          formatOnPaste: false,
          formatOnType: false,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'line',
          renderLineHighlightOnlyWhenFocus: false,
        }}
        loading={null}
      />
    </div>
  );
}
