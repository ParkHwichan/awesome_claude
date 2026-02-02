import { useAppStore, type ActivityType } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FilesIcon,
  SearchIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  TerminalIcon,
  NetworkIcon,
  BotIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIVITY_ITEMS: { id: ActivityType; icon: React.ReactNode; label: string }[] = [
  { id: 'files', icon: <FilesIcon className="w-5 h-5" />, label: 'Explorer' },
  { id: 'search', icon: <SearchIcon className="w-5 h-5" />, label: 'Search' },
  { id: 'git', icon: <GitBranchIcon className="w-5 h-5" />, label: 'Source Control' },
  { id: 'board', icon: <LayoutDashboardIcon className="w-5 h-5" />, label: 'Board' },
  { id: 'graph', icon: <NetworkIcon className="w-5 h-5" />, label: 'Graph' },
  { id: 'terminal', icon: <TerminalIcon className="w-5 h-5" />, label: 'Terminal' },
];

export function ActivityBar() {
  const {
    activeActivity,
    setActiveActivity,
    sidebarOpen,
    toggleSidebar,
    showOrchestrator,
    setShowOrchestrator,
    setSidebarOpen,
  } = useAppStore();

  const handleActivityClick = (id: ActivityType) => {
    if (activeActivity === id) {
      toggleSidebar();
    } else {
      setActiveActivity(id);
      setSidebarOpen(true);
    }
  };

  return (
    <div className="w-12 flex flex-col items-center py-2 bg-card shrink-0">
      <TooltipProvider delayDuration={300}>
        {ACTIVITY_ITEMS.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-10 w-10 mb-1',
                  activeActivity === item.id
                    ? 'text-foreground bg-muted border-l-2 border-primary rounded-none'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => handleActivityClick(item.id)}
              >
                {item.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
        {/* Spacer */}
        <div className="flex-1" />
        {/* Orchestrator Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-10 w-10',
                showOrchestrator
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setShowOrchestrator(!showOrchestrator)}
            >
              <BotIcon className="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Orchestrator</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
