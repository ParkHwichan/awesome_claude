import { useMemo } from 'react';
import { useAppStore, type ActivityType, type WorkbenchView, getMainView } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  PanelsRightBottomIcon,
  PanelsTopLeftIcon,
  XIcon,
  Columns2Icon,
  Rows2Icon,
  LayoutDashboardIcon,
  NetworkIcon,
  TerminalIcon,
  FileCode2Icon,
  TicketIcon,
} from 'lucide-react';

type TabDef = {
  id: ActivityType;
  label: string;
  icon: React.ReactNode;
  mainView: ReturnType<typeof getMainView>;
};

const TABS: TabDef[] = [
  { id: 'files', label: 'Editor', icon: <FileCode2Icon className="w-4 h-4" />, mainView: 'editor' },
  { id: 'board', label: 'Board', icon: <LayoutDashboardIcon className="w-4 h-4" />, mainView: 'board' },
  { id: 'graph', label: 'Graph', icon: <NetworkIcon className="w-4 h-4" />, mainView: 'graph' },
  { id: 'terminal', label: 'Terminal', icon: <TerminalIcon className="w-4 h-4" />, mainView: 'terminal' },
];

export function WorkbenchTabs() {
  const {
    activeActivity,
    setActiveActivity,
    splitOpen,
    splitDirection,
    setSplitOpen,
    setSplitDirection,
    setSecondaryView,
    secondaryView,
  } = useAppStore();

  const activeMainView = getMainView(activeActivity);

  const activeTabId = useMemo(() => {
    const hit = TABS.find((t) => t.mainView === activeMainView);
    return hit?.id ?? 'files';
  }, [activeMainView]);

  const setMainViewTab = (id: ActivityType) => {
    // Files/search/git are all "editor". Use files as canonical entry.
    setActiveActivity(id === 'files' ? 'files' : id);
  };

  const splitLabel = splitDirection === 'horizontal' ? 'Split right' : 'Split down';

  const setSplit = (direction: 'horizontal' | 'vertical', view: WorkbenchView) => {
    setSplitDirection(direction);
    setSecondaryView(view);
    setSplitOpen(true);
  };

  return (
    <div className="flex items-center h-9 px-2 bg-card border-b border-border">
      <div className="flex items-center gap-1">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <Button
              key={tab.id}
              variant="ghost"
              size="sm"
              onClick={() => setMainViewTab(tab.id)}
              className={cn(
                'h-7 gap-2 px-2.5 text-[13px]',
                isActive
                  ? 'bg-background text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </Button>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-2 text-xs text-muted-foreground hover:text-foreground"
              title="Split and open a secondary pane"
            >
              {splitDirection === 'horizontal' ? (
                <Columns2Icon className="w-4 h-4" />
              ) : (
                <Rows2Icon className="w-4 h-4" />
              )}
              {splitOpen ? splitLabel : 'Split'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSplit('horizontal', 'terminal')}>
              <PanelsTopLeftIcon className="w-4 h-4" />
              Terminal (right)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSplit('horizontal', 'ticket')}>
              <PanelsRightBottomIcon className="w-4 h-4" />
              Ticket (right)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSplit('vertical', 'terminal')}>
              <TerminalIcon className="w-4 h-4" />
              Terminal (down)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSplit('vertical', 'ticket')}>
              <TicketIcon className="w-4 h-4" />
              Ticket (down)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {splitOpen && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  title="Change secondary pane"
                >
                  {secondaryView === 'terminal' ? 'Terminal' : secondaryView === 'ticket' ? 'Ticket' : 'Pane'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSecondaryView('terminal')}>
                  <TerminalIcon className="w-4 h-4" />
                  Terminal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSecondaryView('ticket')}>
                  <TicketIcon className="w-4 h-4" />
                  Ticket
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSplitOpen(false)}
              title="Close split"
            >
              <XIcon className="w-4 h-4 text-muted-foreground" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

