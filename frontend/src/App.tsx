import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Menu, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Layers,
  FileText
} from 'lucide-react';
import { Paper, SchemaField, Extraction, Settings, HighlightTarget } from './types';
import { api } from './api';
import { Navbar } from './components/Navbar';
import { PaperSidebar } from './components/PaperSidebar';
import { ExtractionTable } from './components/ExtractionTable';
import { PDFViewer } from './components/PDFViewer';
import { SettingsModal } from './components/SettingsModal';
import { SchemaModal } from './components/SchemaModal';

export const App: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [settings, setSettings] = useState<Settings>({
    openrouter_api_key_set: false,
    model: 'google/gemini-2.5-flash-lite:batch',
  });

  const [activeHighlight, setActiveHighlight] = useState<HighlightTarget | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isBatchExtracting, setIsBatchExtracting] = useState<boolean>(false);
  const [extractionElapsed, setExtractionElapsed] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Resizable panel states (persisted in localStorage)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('scipap_sidebar_width') || localStorage.getItem('scholar_sidebar_width');
      return saved ? Math.min(Math.max(parseInt(saved, 10), 220), 650) : 320;
    } catch {
      return 320;
    }
  });

  const [tableWidthPercent, setTableWidthPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('scipap_table_width_percent') || localStorage.getItem('scholar_table_width_percent');
      return saved ? Math.min(Math.max(parseFloat(saved), 20), 80) : 50;
    } catch {
      return 50;
    }
  });

  const [isDraggingSidebar, setIsDraggingSidebar] = useState<boolean>(false);
  const [isDraggingTable, setIsDraggingTable] = useState<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  // 1b. Sidebar Resize Handlers
  const handleSidebarDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.min(Math.max(startWidth + delta, 220), 650);
      setSidebarWidth(next);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      setIsDraggingSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const finalDelta = upEvent.clientX - startX;
      const finalWidth = Math.min(Math.max(startWidth + finalDelta, 220), 650);
      try {
        localStorage.setItem('scipap_sidebar_width', String(finalWidth));
      } catch {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 1c. Table & PDF Viewer Resize Handlers
  const handleTableDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!splitContainerRef.current) return;
    setIsDraggingTable(true);
    const rect = splitContainerRef.current.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - rect.left;
      const percent = Math.min(Math.max((relativeX / rect.width) * 100, 20), 80);
      setTableWidthPercent(percent);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      setIsDraggingTable(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const relativeX = upEvent.clientX - rect.left;
      const finalPercent = Math.min(Math.max((relativeX / rect.width) * 100, 20), 80);
      try {
        localStorage.setItem('scipap_table_width_percent', String(finalPercent));
      } catch {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Global extraction timer
  useEffect(() => {
    let interval: any = null;
    if (isExtracting || isBatchExtracting) {
      setExtractionElapsed(0);
      interval = setInterval(() => {
        setExtractionElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setExtractionElapsed(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isExtracting, isBatchExtracting]);
  
  // Modals
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [schemaOpen, setSchemaOpen] = useState<boolean>(false);

  // Notification Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // 1. Initial Load
  const loadInitialData = useCallback(async () => {
    try {
      const [papersData, schemaData, settingsData] = await Promise.all([
        api.getPapers(),
        api.getSchema(),
        api.getSettings(),
      ]);

      setPapers(papersData);
      setSchemaFields(schemaData);
      setSettings(settingsData);

      if (papersData.length > 0) {
        setActivePaper((prev) => prev || papersData[0]);
      }
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
      showToast('error', 'Could not connect to backend server.');
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. Select Paper
  const handleSelectPaper = async (paper: Paper) => {
    try {
      const fresh = await api.getPaper(paper.id);
      setActivePaper(fresh);
      setActiveHighlight(null);
    } catch (err: any) {
      showToast('error', `Failed to load paper details: ${err.message}`);
    }
  };

  // 2b. Toggle Paper Checked
  const handleTogglePaperChecked = async (paperId: number, newChecked?: boolean) => {
    const current = papers.find((p) => p.id === paperId);
    const targetState = newChecked !== undefined ? newChecked : !current?.is_checked;

    // Optimistically update
    setPapers((prev) =>
      prev.map((p) => (p.id === paperId ? { ...p, is_checked: targetState } : p))
    );
    if (activePaper && activePaper.id === paperId) {
      setActivePaper((prev) => (prev ? { ...prev, is_checked: targetState } : prev));
    }

    try {
      const res = await api.togglePaperChecked(paperId, targetState);
      setPapers((prev) =>
        prev.map((p) => (p.id === paperId ? { ...p, is_checked: res.is_checked } : p))
      );
      if (activePaper && activePaper.id === paperId) {
        setActivePaper((prev) => (prev ? { ...prev, is_checked: res.is_checked } : prev));
      }
      showToast(
        'success',
        res.is_checked ? 'Paper marked as manually checked ✓' : 'Paper marked as open'
      );
    } catch (err: any) {
      showToast('error', `Failed to update status: ${err.message}`);
      const refreshed = await api.getPapers();
      setPapers(refreshed);
      if (activePaper) {
        const freshActive = refreshed.find((p) => p.id === activePaper.id);
        if (freshActive) setActivePaper(freshActive);
      }
    }
  };

  // 3. Rescan Papers Folder
  const handleRescan = async () => {
    try {
      await api.scanPapers();
      const updatedList = await api.getPapers();
      setPapers(updatedList);
      showToast('success', `Scanned papers folder. ${updatedList.length} files available.`);
      if (activePaper) {
        const freshActive = updatedList.find((p) => p.id === activePaper.id);
        if (freshActive) setActivePaper(freshActive);
      } else if (updatedList.length > 0) {
        setActivePaper(updatedList[0]);
      }
    } catch (err: any) {
      showToast('error', `Failed to scan folder: ${err.message}`);
    }
  };

  // 4. Upload Paper
  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const res = await api.uploadPaper(file);
      showToast('success', `Uploaded ${res.filename}`);
      const updatedList = await api.getPapers();
      setPapers(updatedList);
      const newPaper = updatedList.find((p) => p.id === res.paper_id);
      if (newPaper) setActivePaper(newPaper);
    } catch (err: any) {
      showToast('error', `Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // 5. Run Extraction
  const handleRunExtraction = async () => {
    if (!activePaper) return;

    if (!settings.openrouter_api_key_set) {
      setSettingsOpen(true);
      showToast('info', 'Please provide your OpenRouter API key first to start extracting.');
      return;
    }

    setIsExtracting(true);
    // Instantly reflect 'extracting' status in library sidebar and paper status
    setActivePaper((prev) => (prev ? { ...prev, status: 'extracting', error_message: undefined } : prev));
    setPapers((prev) =>
      prev.map((p) => (p.id === activePaper.id ? { ...p, status: 'extracting', error_message: undefined } : p))
    );
    showToast('info', `Submitting "${activePaper.filename}" to OpenRouter Batch (${settings.model})... 50% discount applied.`);

    try {
      const result = await api.extractPaper(activePaper.id, settings.model);
      showToast('success', `Extraction completed! Extracted ${result.extractions.length} fields.`);

      // Refresh paper data
      const updatedPaper = await api.getPaper(activePaper.id);
      setActivePaper(updatedPaper);

      // Update paper in papers list
      setPapers((prev) => prev.map((p) => (p.id === updatedPaper.id ? updatedPaper : p)));

      // Auto highlight the first extracted quote if available
      const firstWithQuote = updatedPaper.extractions.find((e) => e.page && e.rects && e.rects.length > 0);
      if (firstWithQuote && firstWithQuote.page) {
        const fieldMeta = schemaFields.find((f) => f.key === firstWithQuote.field_key);
        setActiveHighlight({
          page: firstWithQuote.page,
          rects: firstWithQuote.rects || [],
          label: fieldMeta?.label || firstWithQuote.field_key,
          quote: firstWithQuote.quote || undefined,
          page_width: firstWithQuote.page_width || undefined,
          page_height: firstWithQuote.page_height || undefined,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      showToast('error', `Extraction failed: ${err.message}`);
      if (activePaper) {
        const refreshed = await api.getPaper(activePaper.id);
        setActivePaper(refreshed);
        setPapers((prev) => prev.map((p) => (p.id === activePaper.id ? refreshed : p)));
      }
    } finally {
      setIsExtracting(false);
    }
  };

  // 5b. Run Batch Extraction for All Papers
  const handleRunBatchExtraction = async () => {
    if (papers.length === 0) {
      showToast('info', 'No papers in the library to extract.');
      return;
    }

    if (!settings.openrouter_api_key_set) {
      setSettingsOpen(true);
      showToast('info', 'Please provide your OpenRouter API key in Settings first.');
      return;
    }

    setIsBatchExtracting(true);
    showToast('info', `Submitting all ${papers.length} papers to OpenRouter Batch (${settings.model})...`);

    try {
      const res = await api.extractBatch(undefined, true, settings.model);
      showToast('success', `Batch complete! Successfully extracted ${res.processed_count} papers.`);

      // Refresh all papers list and current paper
      const updatedList = await api.getPapers();
      setPapers(updatedList);
      if (activePaper) {
        const freshActive = updatedList.find((p) => p.id === activePaper.id);
        if (freshActive) setActivePaper(freshActive);
      }
    } catch (err: any) {
      showToast('error', `Batch extraction failed: ${err.message}`);
      const updatedList = await api.getPapers();
      setPapers(updatedList);
    } finally {
      setIsBatchExtracting(false);
    }
  };

  // 6. Update Extraction Inline
  const handleUpdateExtraction = async (
    extractionId: number,
    update: { edited_value?: string; quote?: string }
  ) => {
    try {
      const updatedExt = await api.updateExtraction(extractionId, update);
      if (activePaper) {
        setActivePaper({
          ...activePaper,
          extractions: activePaper.extractions.map((e) =>
            e.id === extractionId ? { ...e, ...updatedExt } : e
          ),
        });
      }
      showToast('success', 'Extraction value saved.');
    } catch (err: any) {
      showToast('error', `Failed to update extraction: ${err.message}`);
    }
  };

  // 6b. Add Citation to Extraction
  const handleAddCitation = async (extractionId: number, citation: { quote: string; page?: number }) => {
    try {
      const updatedExt = await api.addExtractionCitation(extractionId, citation);
      if (activePaper) {
        setActivePaper({
          ...activePaper,
          extractions: activePaper.extractions.map((e) =>
            e.id === extractionId ? { ...e, ...updatedExt } : e
          ),
        });
      }
      showToast('success', 'Citation added & matched in PDF!');
    } catch (err: any) {
      showToast('error', `Failed to add citation: ${err.message}`);
    }
  };

  // 6c. Delete Citation from Extraction
  const handleDeleteCitation = async (extractionId: number, citationIndex: number) => {
    try {
      const updatedExt = await api.deleteExtractionCitation(extractionId, citationIndex);
      if (activePaper) {
        setActivePaper({
          ...activePaper,
          extractions: activePaper.extractions.map((e) =>
            e.id === extractionId ? { ...e, ...updatedExt } : e
          ),
        });
      }
      showToast('info', 'Citation removed.');
    } catch (err: any) {
      showToast('error', `Failed to delete citation: ${err.message}`);
    }
  };

  // 7. Refresh Schema
  const handleSchemaUpdated = async () => {
    try {
      const refreshed = await api.getSchema();
      setSchemaFields(refreshed);
    } catch (err: any) {
      console.error(err);
    }
  };

  const pdfUrl = activePaper ? api.getPaperPdfUrl(activePaper.id) : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Top Navigation */}
      <Navbar
        activePaper={activePaper}
        onRunExtraction={handleRunExtraction}
        onRunBatchExtraction={handleRunBatchExtraction}
        isExtracting={isExtracting}
        isBatchExtracting={isBatchExtracting}
        papersCount={papers.length}
        checkedPapersCount={papers.filter((p) => p.is_checked).length}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSchema={() => setSchemaOpen(true)}
        apiKeyConfigured={settings.openrouter_api_key_set}
        activeModel={settings.model}
        extractionElapsed={extractionElapsed}
        onToggleChecked={handleTogglePaperChecked}
        onShowToast={showToast}
      />

      {/* Floating Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-medium flex items-center gap-2.5 transition-all animate-in slide-in-from-bottom-3 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-emerald-500/10'
              : toast.type === 'error'
              ? 'bg-red-950/90 text-red-200 border-red-500/40 shadow-red-500/10'
              : 'bg-blue-950/90 text-blue-200 border-blue-500/40 shadow-blue-500/10'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
          {toast.type === 'info' && <FileText className="w-4 h-4 text-blue-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Full-screen invisible overlay during dragging to prevent canvas/iframe capture */}
        {(isDraggingSidebar || isDraggingTable) && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto bg-transparent" />
        )}

        {/* Panel 1: Sidebar for Papers Library */}
        <PaperSidebar
          papers={papers}
          activePaper={activePaper}
          onSelectPaper={handleSelectPaper}
          onRefresh={handleRescan}
          onUpload={handleUpload}
          isUploading={isUploading}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onBatchExtract={handleRunBatchExtraction}
          isBatchExtracting={isBatchExtracting}
          onToggleChecked={handleTogglePaperChecked}
          width={sidebarWidth}
          isResizing={isDraggingSidebar}
        />

        {/* Resizer Handle 1: Between Sidebar and Table */}
        {sidebarOpen && (
          <div
            onMouseDown={handleSidebarDragStart}
            onDoubleClick={() => {
              setSidebarWidth(320);
              try { localStorage.setItem('scipap_sidebar_width', '320'); } catch {}
            }}
            title="Drag to resize library sidebar (Double-click to reset to 320px)"
            className="w-2 -ml-1 cursor-col-resize z-30 flex items-center justify-center group select-none relative hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors shrink-0"
          >
            <div className="h-10 w-1 rounded-full bg-slate-700/80 group-hover:bg-blue-400 group-active:bg-blue-400 transition-colors" />
          </div>
        )}

        {/* Sidebar Toggle Tab */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Collapse library' : 'Expand library'}
          className={`absolute top-1/2 -translate-y-1/2 z-30 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white p-1 rounded-r-md border-r border-t border-b border-slate-700 shadow-md transition-[left] ${
            isDraggingSidebar ? 'duration-0' : 'duration-200'
          }`}
          style={{ left: sidebarOpen ? `${sidebarWidth}px` : '0' }}
        >
          {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Split View Container for Panels 2 and 3 */}
        <div ref={splitContainerRef} className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {/* Panel 2: Extracted Data Table */}
          <div
            style={{ width: `${tableWidthPercent}%` }}
            className="h-full overflow-hidden border-b md:border-b-0 flex flex-col shrink-0"
          >
            <ExtractionTable
              fields={schemaFields}
              extractions={activePaper?.extractions || []}
              onUpdateExtraction={handleUpdateExtraction}
              onAddCitation={handleAddCitation}
              onDeleteCitation={handleDeleteCitation}
              onSelectHighlight={(target) => setActiveHighlight(target)}
              activeHighlight={activeHighlight}
              onOpenSchema={() => setSchemaOpen(true)}
              onRunExtraction={handleRunExtraction}
              isExtracting={isExtracting}
            />
          </div>

          {/* Resizer Handle 2: Between Extracted Data Table and PDF Viewer */}
          <div
            onMouseDown={handleTableDragStart}
            onDoubleClick={() => {
              setTableWidthPercent(50);
              try { localStorage.setItem('scipap_table_width_percent', '50'); } catch {}
            }}
            title="Drag to resize table & PDF viewer (Double-click to reset 50/50)"
            className="w-2.5 -mx-1 cursor-col-resize z-20 flex items-center justify-center group select-none relative hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors shrink-0"
          >
            <div className="h-12 w-1 rounded-full bg-slate-700/80 group-hover:bg-blue-400 group-active:bg-blue-400 transition-colors" />
          </div>

          {/* Panel 3: PDF Viewer with Highlighting */}
          <div
            style={{ width: `${100 - tableWidthPercent}%` }}
            className="h-full overflow-hidden flex flex-col shrink-0"
          >
            <PDFViewer
              paperId={activePaper?.id}
              pdfUrl={pdfUrl}
              activeHighlight={activeHighlight}
              isExtracting={isExtracting}
              extractionElapsed={extractionElapsed}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsSaved={(updated) => {
          setSettings(updated);
          showToast('success', 'Settings updated successfully.');
        }}
      />

      <SchemaModal
        isOpen={schemaOpen}
        onClose={() => setSchemaOpen(false)}
        fields={schemaFields}
        onSchemaUpdated={handleSchemaUpdated}
      />
    </div>
  );
};
