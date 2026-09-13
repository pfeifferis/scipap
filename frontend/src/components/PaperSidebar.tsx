import React, { useState, useRef } from 'react';
import { 
  FolderOpen, 
  Upload, 
  RefreshCw, 
  Search, 
  FileText, 
  CheckCircle2, 
  Circle,
  Check,
  Clock, 
  AlertCircle,
  FileCheck2,
  ChevronRight,
  Layers,
  Loader2
} from 'lucide-react';
import { Paper } from '../types';

interface PaperSidebarProps {
  papers: Paper[];
  activePaper: Paper | null;
  onSelectPaper: (paper: Paper) => void;
  onRefresh: () => void;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onBatchExtract?: () => void;
  isBatchExtracting?: boolean;
  onToggleChecked: (paperId: number, newChecked?: boolean) => void;
  width?: number;
  isResizing?: boolean;
}

export const PaperSidebar: React.FC<PaperSidebarProps> = ({
  papers,
  activePaper,
  onSelectPaper,
  onRefresh,
  onUpload,
  isUploading,
  isOpen,
  onToggle,
  onBatchExtract,
  isBatchExtracting,
  onToggleChecked,
  width = 320,
  isResizing = false,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'checked' | 'unchecked'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkedCount = papers.filter((p) => !!p.is_checked).length;
  const uncheckedCount = papers.length - checkedCount;

  const filteredPapers = papers.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.filename.toLowerCase().includes(q) ||
      (p.title && p.title.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (filterStatus === 'checked') return !!p.is_checked;
    if (filterStatus === 'unchecked') return !p.is_checked;
    return true;
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await onUpload(e.target.files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <aside
      style={{ width: isOpen ? `${width}px` : '0px' }}
      className={`border-r border-slate-800 bg-slate-900/60 backdrop-blur flex flex-col shrink-0 z-20 ${
        isResizing ? '' : 'transition-[width] duration-200'
      } ${!isOpen ? 'overflow-hidden border-r-0' : ''}`}
    >
      {/* Top Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Papers Library</h2>
          <span className="text-[11px] font-bold bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
            {papers.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Checked Count Badge */}
          <div 
            className="flex items-center gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full"
            title={`${checkedCount} of ${papers.length} papers manually checked`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{checkedCount}/{papers.length}</span>
          </div>

          <button
            onClick={onRefresh}
            title="Rescan papers folder"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Upload PDF paper"
            className="p-1.5 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            className="hidden"
          />
        </div>
      </div>

      {/* Search & Filter Section */}
      <div className="p-3 border-b border-slate-800/60 shrink-0 space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search papers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
          />
        </div>

        {/* Filter Pills: All / Checked / Unchecked */}
        <div className="grid grid-cols-3 gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800/80 text-[11px]">
          <button
            onClick={() => setFilterStatus('all')}
            className={`py-1 rounded-md font-medium text-center transition-colors ${
              filterStatus === 'all'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            All ({papers.length})
          </button>
          <button
            onClick={() => setFilterStatus('checked')}
            className={`py-1 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1 ${
              filterStatus === 'checked'
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/50'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Checked ({checkedCount})</span>
          </button>
          <button
            onClick={() => setFilterStatus('unchecked')}
            className={`py-1 rounded-md font-medium text-center transition-colors ${
              filterStatus === 'unchecked'
                ? 'bg-slate-700 text-slate-200 border border-slate-600'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Open ({uncheckedCount})
          </button>
        </div>

        {/* Quick Batch Extract Action */}
        {papers.length > 0 && onBatchExtract && (
          <div>
            <button
              onClick={onBatchExtract}
              disabled={isBatchExtracting}
              className={`w-full py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                isBatchExtracting
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 cursor-not-allowed'
                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50'
              }`}
            >
              {isBatchExtracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Processing Batch ({papers.length} papers)...</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Extract All {papers.length} Papers (Batch)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Papers List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredPapers.length === 0 ? (
          <div className="text-center py-8 px-4">
            <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">No papers found</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {filterStatus !== 'all' 
                ? `No papers matching filter "${filterStatus}".`
                : 'Drop PDFs into the ./papers folder or click upload.'}
            </p>
          </div>
        ) : (
          filteredPapers.map((paper) => {
            const isSelected = activePaper?.id === paper.id;
            const isChecked = !!paper.is_checked;
            const extractionsCount = paper.extractions?.length || 0;

            return (
              <div
                key={paper.id}
                onClick={() => onSelectPaper(paper)}
                className={`w-full text-left p-3 rounded-xl transition-all group flex items-start gap-2.5 border cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500/40 shadow-sm shadow-blue-500/10'
                    : isChecked
                    ? 'bg-emerald-950/15 hover:bg-emerald-950/25 border-emerald-900/40 hover:border-emerald-500/30'
                    : 'bg-slate-900/30 hover:bg-slate-800/60 border-transparent hover:border-slate-800'
                } ${isChecked ? 'border-l-4 border-l-emerald-500' : ''}`}
              >
                {/* Check Toggle Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleChecked(paper.id, !isChecked);
                  }}
                  title={
                    isChecked
                      ? 'Manually checked. Click to mark unchecked.'
                      : 'Mark as manually checked'
                  }
                  className={`mt-0.5 p-1 rounded-md transition-all shrink-0 ${
                    isChecked
                      ? 'text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 shadow-sm shadow-emerald-500/20'
                      : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/40'
                  }`}
                >
                  {isChecked ? (
                    <CheckCircle2 className="w-4 h-4 fill-emerald-500/20" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </button>

                {/* Paper Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-blue-400' : isChecked ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    />
                    <h3
                      className={`text-xs font-medium truncate ${
                        isSelected
                          ? 'text-blue-200 font-semibold'
                          : isChecked
                          ? 'text-emerald-100 font-medium'
                          : 'text-slate-300'
                      }`}
                      title={paper.title || paper.filename}
                    >
                      {paper.title || paper.filename}
                    </h3>
                  </div>

                  <p className="text-[11px] text-slate-500 truncate mb-2">
                    {paper.filename}
                  </p>

                  <div className="flex items-center flex-wrap gap-1.5">
                    {/* Checked Badge */}
                    {isChecked && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        <Check className="w-2.5 h-2.5" />
                        <span>Checked</span>
                      </span>
                    )}

                    <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                      {paper.num_pages} {paper.num_pages === 1 ? 'page' : 'pages'}
                    </span>

                    {paper.status === 'extracted' && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        <FileCheck2 className="w-2.5 h-2.5" />
                        <span>{extractionsCount} fields</span>
                      </span>
                    )}

                    {paper.status === 'extracting' && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400" />
                        <span>Extracting...</span>
                      </span>
                    )}

                    {paper.status === 'pending' && (
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                        Not extracted
                      </span>
                    )}

                    {paper.status === 'error' && (
                      <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                        <AlertCircle className="w-2.5 h-2.5" />
                        <span>Error</span>
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight
                  className={`w-4 h-4 shrink-0 transition-transform mt-1 ${
                    isSelected ? 'text-blue-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                  }`}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Folder Hint */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-500 shrink-0">
        <span className="block font-medium text-slate-400">PDF Watch Directory:</span>
        <code className="text-[10px] text-slate-400 block truncate mt-0.5">./papers/*.pdf</code>
      </div>
    </aside>
  );
};
