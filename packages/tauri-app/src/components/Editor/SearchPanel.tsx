import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '@/store/editor-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  SearchIcon,
  ReplaceIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  XIcon,
  RefreshCwIcon,
  CaseSensitiveIcon,
  RegexIcon,
} from 'lucide-react';

interface SearchMatch {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

interface GroupedResults {
  [filePath: string]: SearchMatch[];
}

interface SearchPanelProps {
  workingDir: string;
}

export function SearchPanel({ workingDir }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { openFile } = useEditorStore();

  // Group results by file
  const groupedResults: GroupedResults = results.reduce((acc, match) => {
    if (!acc[match.filePath]) {
      acc[match.filePath] = [];
    }
    acc[match.filePath].push(match);
    return acc;
  }, {} as GroupedResults);

  const fileCount = Object.keys(groupedResults).length;
  const matchCount = results.length;

  // Perform search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const matches = await invoke<SearchMatch[]>('search_in_files', {
        directory: workingDir,
        query: searchQuery,
        caseSensitive,
        useRegex,
        filePattern: null,
      });
      setResults(matches);

      // Expand all files by default
      setExpandedFiles(new Set(matches.map((m) => m.filePath)));
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [workingDir, searchQuery, caseSensitive, useRegex]);

  // Trigger search on Enter
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  // Replace in single file
  const handleReplaceInFile = useCallback(
    async (filePath: string) => {
      if (!searchQuery.trim()) return;

      try {
        await invoke('replace_in_file', {
          filePath,
          search: searchQuery,
          replacement: replaceQuery,
          caseSensitive,
          useRegex,
        });

        // Re-run search to update results
        handleSearch();
      } catch (err) {
        setError(String(err));
      }
    },
    [searchQuery, replaceQuery, caseSensitive, useRegex, handleSearch]
  );

  // Replace all
  const handleReplaceAll = useCallback(async () => {
    if (!searchQuery.trim()) return;

    try {
      const files = Object.keys(groupedResults);
      for (const filePath of files) {
        await invoke('replace_in_file', {
          filePath,
          search: searchQuery,
          replacement: replaceQuery,
          caseSensitive,
          useRegex,
        });
      }

      // Re-run search to update results
      handleSearch();
    } catch (err) {
      setError(String(err));
    }
  }, [searchQuery, replaceQuery, caseSensitive, useRegex, groupedResults, handleSearch]);

  // Toggle file expansion
  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  // Open file at line
  const handleOpenResult = useCallback(
    (match: SearchMatch) => {
      openFile(match.filePath);
      // TODO: Go to specific line in editor
    },
    [openFile]
  );

  // Get relative path for display
  const getRelativePath = useCallback(
    (filePath: string) => {
      const normalized = filePath.replace(/\\/g, '/');
      const normalizedRoot = workingDir.replace(/\\/g, '/');
      if (normalized.startsWith(normalizedRoot)) {
        return normalized.slice(normalizedRoot.length + 1);
      }
      return filePath;
    },
    [workingDir]
  );

  // Highlight match in text
  const highlightMatch = useCallback((text: string, start: number, end: number) => {
    const before = text.slice(0, start);
    const match = text.slice(start, end);
    const after = text.slice(end);

    return (
      <>
        <span className="text-muted-foreground">{before}</span>
        <span className="bg-warning/30 text-warning-foreground">{match}</span>
        <span className="text-muted-foreground">{after}</span>
      </>
    );
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search inputs */}
      <div className="p-2 border-b border-border space-y-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setShowReplace(!showReplace)}
          >
            {showReplace ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )}
          </Button>
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search"
              className="h-7 pl-7 pr-16 text-sm"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <Button
                variant={caseSensitive ? 'secondary' : 'ghost'}
                size="icon"
                className="h-5 w-5"
                onClick={() => setCaseSensitive(!caseSensitive)}
                title="Match Case"
              >
                <CaseSensitiveIcon className="h-3 w-3" />
              </Button>
              <Button
                variant={useRegex ? 'secondary' : 'ghost'}
                size="icon"
                className="h-5 w-5"
                onClick={() => setUseRegex(!useRegex)}
                title="Use Regex"
              >
                <RegexIcon className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? (
              <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <RefreshCwIcon className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {showReplace && (
          <div className="flex items-center gap-1 ml-7">
            <div className="flex-1 relative">
              <ReplaceIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace"
                className="h-7 pl-7 text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleReplaceAll}
              disabled={!searchQuery.trim() || matchCount === 0}
            >
              Replace All
            </Button>
          </div>
        )}
      </div>

      {/* Results summary */}
      {searchQuery.trim() && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
          {matchCount > 0 ? (
            <>
              {matchCount} result{matchCount !== 1 ? 's' : ''} in {fileCount} file
              {fileCount !== 1 ? 's' : ''}
            </>
          ) : isSearching ? (
            'Searching...'
          ) : (
            'No results found'
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 text-xs text-destructive bg-destructive/10">
          {error}
        </div>
      )}

      {/* Results list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {Object.entries(groupedResults).map(([filePath, matches]) => {
            const isExpanded = expandedFiles.has(filePath);
            const relativePath = getRelativePath(filePath);

            return (
              <div key={filePath}>
                <button
                  onClick={() => toggleFile(filePath)}
                  className={cn(
                    'w-full flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted/50',
                    'text-left'
                  )}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="h-3 w-3 shrink-0" />
                  )}
                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1 text-foreground">{relativePath}</span>
                  <span className="text-muted-foreground shrink-0">{matches.length}</span>
                  {showReplace && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplaceInFile(filePath);
                      }}
                      title="Replace in file"
                    >
                      <ReplaceIcon className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </button>

                {isExpanded && (
                  <div className="ml-4">
                    {matches.map((match, idx) => (
                      <button
                        key={`${match.lineNumber}-${idx}`}
                        onClick={() => handleOpenResult(match)}
                        className={cn(
                          'w-full flex items-start gap-2 px-2 py-0.5 text-xs hover:bg-muted/50',
                          'text-left font-mono'
                        )}
                      >
                        <span className="text-muted-foreground shrink-0 w-8 text-right">
                          {match.lineNumber}
                        </span>
                        <span className="truncate">
                          {highlightMatch(
                            match.lineContent,
                            match.matchStart,
                            match.matchEnd
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
