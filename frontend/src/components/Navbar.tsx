import React, { useState } from 'react';
import { 
  Sparkles, 
  Settings as SettingsIcon, 
  Layers, 
  Download, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ChevronDown,
  Loader2
} from 'lucide-react';
import { Paper } from '../types';
import { api } from '../api';

interface NavbarProps {
  activePaper: Paper | null;
  onRunExtraction: () => void;
  onRunBatchExtraction: () => void;
  isExtracting: boolean;
  isBatchExtracting: boolean;
  papersCount: number;
  onOpenSettings: () => void;
  onOpenSchema: () => void;
  apiKeyConfigured: boolean;
  activeModel: string;
  extractionElapsed?: number;
  onToggleChecked?: (paperId: number, newChecked?: boolean) => void;
  checkedPapersCount?: number;
  onShowToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePaper,
  onRunExtraction,
  onRunBatchExtraction,
  isExtracting,
  isBatchExtracting,
  papersCount,
  checkedPapersCount = 0,
  onOpenSettings,
  onOpenSchema,
  apiKeyConfigured,
  activeModel,
  extractionElapsed = 0,
  onToggleChecked,
  onShowToast,
}) => {
  const [exportOpen, setExportOpen] = useState(false);

  const handleExport = (format: 'csv' | 'json', mode: 'checked' | 'all' | 'active' = 'checked') => {
    setExportOpen(false);

    if (mode === 'checked' && checkedPapersCount === 0) {
      onShowToast?.('info', 'No papers are marked as checked yet. Check papers first or choose "Export All".');
      return;
    }

    const options: { paperId?: number; checkedOnly?: boolean } = {};
    if (mode === 'checked') {
      options.checkedOnly = true;
    } else if (mode === 'active' && activePaper) {
      options.paperId = activePaper.id;
    }

    const url = api.getExportUrl(format, options);
    window.open(url, '_blank');
  };

  return (
    <header className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-5 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Active Paper */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
            <div>
              <span className="font-bold text-slate-100 text-base tracking-tight">SciPap</span>
              <p className="text-xs text-slate-400 hidden sm:block">Paper Extraction Tool & Auditing</p>
            </div>
        </div>

        {activePaper && (
          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-800 max-w-lg truncate">
            <span className="text-xs text-slate-400 shrink-0">Active Document:</span>
            <span className="text-xs font-medium text-slate-200 truncate" title={activePaper.title || activePaper.filename}>
              {activePaper.title || activePaper.filename}
            </span>

            {/* Manual Check Toggle */}
            {onToggleChecked && (
              <button
                onClick={() => onToggleChecked(activePaper.id, !activePaper.is_checked)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all shrink-0 ${
                  activePaper.is_checked
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600 hover:bg-slate-700/50'
                }`}
                title={
                  activePaper.is_checked
                    ? 'Marked as verified. Click to toggle.'
                    : 'Mark document as verified / checked'
                }
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    activePaper.is_checked ? 'text-emerald-400 fill-emerald-400/20' : 'text-slate-500'
                  }`}
                />
                <span>{activePaper.is_checked ? 'Verified' : 'Verify'}</span>
              </button>
            )}

            {activePaper.status === 'extracted' && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                <CheckCircle2 className="w-3 h-3" /> Extracted
              </span>
            )}
            {activePaper.status === 'extracting' && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Processing
              </span>
            )}
            {activePaper.status === 'pending' && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full shrink-0">
                <Clock className="w-3 h-3" /> Ready
              </span>
            )}
            {activePaper.status === 'error' && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full shrink-0">
                <AlertTriangle className="w-3 h-3" /> Error
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        {/* Batch Extract All Button */}
        <button
          onClick={onRunBatchExtraction}
          disabled={papersCount === 0 || isBatchExtracting || isExtracting}
          title="Run batch extraction queue across all documents in library"
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium text-xs transition-all shadow-md ${
            papersCount === 0 || isBatchExtracting || isExtracting
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/20 border border-emerald-400/30'
          }`}
        >
          {isBatchExtracting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-200" />
              <span>Batch Extracting...</span>
            </>
          ) : (
            <>
              <Layers className="w-3.5 h-3.5 text-emerald-300" />
              <span>Batch Extract ({papersCount})</span>
            </>
          )}
        </button>

        {/* Run Extraction Single Button */}
        <button
          onClick={onRunExtraction}
          disabled={!activePaper || isExtracting || isBatchExtracting}
          className={`relative group flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-xs transition-all shadow-md ${
            !activePaper || isExtracting || isBatchExtracting
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white hover:from-blue-500 hover:to-indigo-500 active:scale-95 shadow-blue-500/25 border border-blue-400/30'
          }`}
        >
          {isExtracting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-blue-200" />
              <span>Extracting ({extractionElapsed}s)...</span>
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 text-blue-200" />
              <span>Run Extraction</span>
            </>
          )}
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-colors"
            title="Export extracted paper data"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export</span>
            {checkedPapersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-[10px] border border-emerald-500/30">
                {checkedPapersCount} checked
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {exportOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 flex items-center justify-between">
                <span>Checked Papers ({checkedPapersCount})</span>
                <span className="text-emerald-400 text-[10px] font-medium">Default</span>
              </div>

              <button
                onClick={() => handleExport('csv', 'checked')}
                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-medium group-hover:text-white">Export Checked (CSV)</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">.csv</span>
              </button>

              <button
                onClick={() => handleExport('json', 'checked')}
                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-medium group-hover:text-white">Export Checked (JSON)</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">.json</span>
              </button>

              <div className="h-px bg-slate-800 my-1" />

              <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                All Papers ({papersCount})
              </div>

              <button
                onClick={() => handleExport('csv', 'all')}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 flex items-center justify-between transition-colors"
              >
                <span>Export All Papers (CSV)</span>
                <span className="text-[10px] text-slate-600 font-mono">.csv</span>
              </button>

              <button
                onClick={() => handleExport('json', 'all')}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 flex items-center justify-between transition-colors"
              >
                <span>Export All Papers (JSON)</span>
                <span className="text-[10px] text-slate-600 font-mono">.json</span>
              </button>

              {activePaper && (
                <>
                  <div className="h-px bg-slate-800 my-1" />
                  <button
                    onClick={() => handleExport('csv', 'active')}
                    className="w-full px-3 py-1.5 text-left text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 flex items-center justify-between transition-colors"
                  >
                    <span className="truncate pr-2">Export Current Paper Only</span>
                    <span className="text-[10px] text-slate-600 font-mono">.csv</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Schema Fields Config */}
        <button
          onClick={onOpenSchema}
          title="Configure Extraction Schema Fields"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-colors"
        >
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Fields</span>
        </button>

        {/* Settings Modal */}
        <button
          onClick={onOpenSettings}
          title="OpenRouter LLM Settings"
          className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-colors"
        >
          <SettingsIcon className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Settings</span>
          {!apiKeyConfigured && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
          )}
          {!apiKeyConfigured && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
          )}
        </button>
      </div>
    </header>
  );
};
