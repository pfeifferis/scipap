import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Loader2, 
  FileWarning, 
  Highlighter,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  List,
  Copy,
  Check
} from 'lucide-react';
import { HighlightTarget, PDFSearchMatch } from '../types';
import { api } from '../api';

interface PDFViewerProps {
  paperId?: number | null;
  pdfUrl: string | null;
  activeHighlight: HighlightTarget | null;
  onPageChange?: (page: number) => void;
  isExtracting?: boolean;
  extractionElapsed?: number;
}

// Access pdfjsLib from window (loaded in index.html) or global
declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  paperId,
  pdfUrl,
  activeHighlight,
  onPageChange,
  isExtracting = false,
  extractionElapsed = 0,
}) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.25);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search states
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<PDFSearchMatch[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showMatchList, setShowMatchList] = useState<boolean>(false);

  // Text Selection & Copy states
  const [selectedText, setSelectedText] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [selectionBox, setSelectionBox] = useState<{ top: number; left: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightOverlayRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const textLayerRenderTaskRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({ width: 595, height: 842 });

  const effectivePaperId = paperId ?? (pdfUrl ? Number(pdfUrl.match(/\/api\/papers\/(\d+)/)?.[1]) : null);

  // 1. Load PDF Document
  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      setNumPages(0);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      try {
        const pdfjs = window.pdfjsLib;
        if (!pdfjs) {
          throw new Error('PDF.js library is still loading or unavailable.');
        }

        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setPageNum(1);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Error loading PDF document:', err);
          setError(err.message || 'Failed to load PDF file.');
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [pdfUrl]);

  // Reset search & selection when active paper changes
  useEffect(() => {
    setSearchResults([]);
    setCurrentMatchIdx(-1);
    setSearchQuery('');
    setIsSearchOpen(false);
    setShowMatchList(false);
    setSelectedText('');
    setSelectionBox(null);
  }, [pdfUrl, paperId]);

  // 2. Respond to activeHighlight changes (jump to target page and scroll)
  useEffect(() => {
    if (activeHighlight && activeHighlight.page) {
      if (activeHighlight.page !== pageNum) {
        setPageNum(activeHighlight.page);
      }
    }
  }, [activeHighlight]);

  // Smooth scroll to active search match
  const scrollToActiveMatch = useCallback(() => {
    setTimeout(() => {
      if (highlightOverlayRef.current && containerRef.current) {
        const activeBox = highlightOverlayRef.current.querySelector('.search-match-active') as HTMLElement;
        if (activeBox) {
          const topPos = activeBox.offsetTop;
          containerRef.current.scrollTo({
            top: Math.max(0, topPos - 140),
            behavior: 'smooth',
          });
        }
      }
    }, 80);
  }, []);

  // 3. Render Current Page (Canvas + Selectable Text Layer)
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || pageNum < 1 || pageNum > numPages) return;

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (textLayerRenderTaskRef.current) {
        textLayerRenderTaskRef.current.cancel();
        textLayerRenderTaskRef.current = null;
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * pixelRatio;
      canvas.height = viewport.height * pixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      setPageDimensions({
        width: viewport.width / scale,
        height: viewport.height / scale,
      });

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Render PDF.js Text Layer for seamless text selection and copying
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.setProperty('--scale-factor', `${scale}`);
        textLayerRef.current.style.width = `${viewport.width}px`;
        textLayerRef.current.style.height = `${viewport.height}px`;

        try {
          const textContent = await page.getTextContent();
          if (window.pdfjsLib?.renderTextLayer) {
            const textTask = window.pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayerRef.current,
              viewport: viewport,
            });
            textLayerRenderTaskRef.current = textTask;
            await textTask.promise;
            textLayerRenderTaskRef.current = null;
          }
        } catch (textErr: any) {
          if (textErr?.name !== 'AbortException' && textErr?.name !== 'RenderingCancelledException') {
            console.warn('Text layer render notice:', textErr);
          }
        }
      }

      // Auto-scroll to active extraction citation if on this page
      if (activeHighlight && activeHighlight.page === pageNum && activeHighlight.rects?.length) {
        setTimeout(() => {
          if (highlightOverlayRef.current && containerRef.current) {
            const firstBox = highlightOverlayRef.current.querySelector('.highlight-box') as HTMLElement;
            if (firstBox) {
              const topPos = firstBox.offsetTop;
              containerRef.current.scrollTo({
                top: Math.max(0, topPos - 120),
                behavior: 'smooth',
              });
            }
          }
        }, 100);
      } else if (currentMatchIdx >= 0 && searchResults[currentMatchIdx]?.page === pageNum) {
        scrollToActiveMatch();
      }
    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', err);
      }
    }
  }, [pdfDoc, pageNum, scale, activeHighlight, numPages, currentMatchIdx, searchResults, scrollToActiveMatch]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Execute keyword search against backend
  const executeSearch = useCallback(async (query: string, caseSens: boolean) => {
    const cleanQ = query.trim();
    if (!cleanQ) {
      setSearchResults([]);
      setCurrentMatchIdx(-1);
      return;
    }
    if (!effectivePaperId) return;

    setIsSearching(true);
    try {
      const res = await api.searchPaperPdf(effectivePaperId, cleanQ, caseSens);
      const matches = res.matches || [];
      setSearchResults(matches);

      if (matches.length > 0) {
        const pageMatchIdx = matches.findIndex((m) => m.page === pageNum);
        const targetIdx = pageMatchIdx !== -1 ? pageMatchIdx : 0;
        setCurrentMatchIdx(targetIdx);

        if (matches[targetIdx].page !== pageNum) {
          setPageNum(matches[targetIdx].page);
          onPageChange?.(matches[targetIdx].page);
        } else {
          scrollToActiveMatch();
        }
      } else {
        setCurrentMatchIdx(-1);
      }
    } catch (err) {
      console.error('Error searching paper PDF:', err);
      setSearchResults([]);
      setCurrentMatchIdx(-1);
    } finally {
      setIsSearching(false);
    }
  }, [effectivePaperId, pageNum, onPageChange, scrollToActiveMatch]);

  // Debounce search when query or case-sensitivity changes
  useEffect(() => {
    if (!isSearchOpen || !searchQuery.trim()) {
      setSearchResults([]);
      setCurrentMatchIdx(-1);
      return;
    }
    const timer = setTimeout(() => {
      executeSearch(searchQuery, caseSensitive);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, caseSensitive, isSearchOpen, executeSearch]);

  // Jump to specific match
  const goToMatch = useCallback((idx: number) => {
    if (idx < 0 || idx >= searchResults.length) return;
    setCurrentMatchIdx(idx);
    const targetMatch = searchResults[idx];
    if (targetMatch.page !== pageNum) {
      setPageNum(targetMatch.page);
      onPageChange?.(targetMatch.page);
    } else {
      scrollToActiveMatch();
    }
  }, [searchResults, pageNum, onPageChange, scrollToActiveMatch]);

  // Next Match Navigation
  const goToNextMatch = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchResults.length;
    goToMatch(nextIdx);
  }, [currentMatchIdx, searchResults, goToMatch]);

  // Previous Match Navigation
  const goToPrevMatch = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + searchResults.length) % searchResults.length;
    goToMatch(prevIdx);
  }, [currentMatchIdx, searchResults, goToMatch]);

  // Global & Keyboard Shortcuts (Cmd+F / Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 50);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        setShowMatchList(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Native Copy Event Listener for visual confirmation
  useEffect(() => {
    const handleGlobalCopy = () => {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 0) {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1200);
      }
    };

    window.addEventListener('copy', handleGlobalCopy);
    return () => window.removeEventListener('copy', handleGlobalCopy);
  }, []);

  // Text selection tracking on mouse up
  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text && text.length > 0 && containerRef.current) {
        setSelectedText(text);
        try {
          const range = sel!.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = containerRef.current.getBoundingClientRect();
          // Position copy tooltip slightly above selection
          setSelectionBox({
            top: rect.top - containerRect.top + containerRef.current.scrollTop - 38,
            left: Math.max(10, rect.left - containerRect.left + rect.width / 2 - 50),
          });
        } catch {
          setSelectionBox(null);
        }
      } else {
        setSelectedText('');
        setSelectionBox(null);
        setCopyFeedback(false);
      }
    }, 20);
  }, []);

  const handleCopySelectedText = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!selectedText) return;
    navigator.clipboard.writeText(selectedText);
    setCopyFeedback(true);
    setTimeout(() => {
      setCopyFeedback(false);
      setSelectedText('');
      setSelectionBox(null);
      window.getSelection()?.removeAllRanges();
    }, 1000);
  }, [selectedText]);

  // Page Controls
  const handlePrev = () => {
    if (pageNum > 1) {
      const nextP = pageNum - 1;
      setPageNum(nextP);
      onPageChange?.(nextP);
    }
  };

  const handleNext = () => {
    if (pageNum < numPages) {
      const nextP = pageNum + 1;
      setPageNum(nextP);
      onPageChange?.(nextP);
    }
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(2.5, prev + 0.2));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.6, prev - 0.2));
  };

  const handleFitWidth = () => {
    if (containerRef.current && pageDimensions.width > 0) {
      const containerWidth = containerRef.current.clientWidth - 48;
      const newScale = Math.max(0.6, Math.min(2.5, containerWidth / pageDimensions.width));
      setScale(newScale);
    }
  };

  // Helper to highlight matched query inside context snippets
  const highlightSnippetQuery = (snippet: string, query: string) => {
    if (!query.trim()) return snippet;
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = snippet.split(new RegExp(`(${escaped})`, caseSensitive ? 'g' : 'gi'));
      return parts.map((part, i) =>
        (caseSensitive ? part === query : part.toLowerCase() === query.toLowerCase()) ? (
          <mark key={i} className="bg-amber-400 text-slate-950 font-bold px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      );
    } catch {
      return snippet;
    }
  };

  const currentActiveMatch = currentMatchIdx >= 0 && currentMatchIdx < searchResults.length ? searchResults[currentMatchIdx] : null;
  const pageMatches = searchResults.filter((m) => m.page === pageNum);

  return (
    <div className="h-full flex flex-col bg-slate-950 border-l border-slate-800 relative">
      {/* Sticky PDF Toolbar */}
      <div className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30 select-none">
        {/* Left: Pagination */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            disabled={pageNum <= 1 || loading}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs text-slate-300 font-medium px-2">
            Page <span className="font-semibold text-white">{pageNum}</span> of{' '}
            <span>{numPages || 1}</span>
          </span>

          <button
            onClick={handleNext}
            disabled={pageNum >= numPages || loading}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Active Highlight Badge Notification */}
        {activeHighlight && activeHighlight.page === pageNum && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-[11px] font-semibold text-blue-300 animate-pulse">
            <Highlighter className="w-3 h-3 text-blue-400" />
            <span>Marked: {activeHighlight.label}</span>
          </div>
        )}

        {/* Right: Search Toggle & Zoom Controls */}
        <div className="flex items-center gap-1.5">
          {/* PDF Search Toggle Button */}
          <button
            onClick={() => {
              setIsSearchOpen((prev) => {
                const next = !prev;
                if (next) {
                  setTimeout(() => {
                    searchInputRef.current?.focus();
                    searchInputRef.current?.select();
                  }, 50);
                }
                return next;
              });
            }}
            className={`px-2 py-1 rounded flex items-center gap-1.5 text-xs font-medium transition-colors ${
              isSearchOpen || searchResults.length > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
            title="Search PDF for keywords (Cmd+F / Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search</span>
            {searchResults.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
                {searchResults.length}
              </span>
            )}
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Zoom Buttons */}
          <button
            onClick={handleZoomOut}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 w-12 text-center font-mono">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitWidth}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 ml-1 transition-colors"
            title="Fit Width"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Modern PDF Search Bar */}
      {isSearchOpen && (
        <div className="absolute top-14 right-6 z-40 flex flex-col items-end animate-in fade-in slide-in-from-top-2 duration-150 select-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl ring-1 ring-white/10">
            {/* Search Icon & Input */}
            <div className="flex items-center gap-1.5 pl-2">
              <Search className="w-4 h-4 text-amber-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                      goToPrevMatch();
                    } else {
                      goToNextMatch();
                    }
                  } else if (e.key === 'Escape') {
                    setIsSearchOpen(false);
                    setShowMatchList(false);
                  }
                }}
                placeholder="Search keywords in PDF..."
                className="w-48 sm:w-60 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Match Counter / Status */}
            <div className="px-1.5 py-0.5 min-w-[58px] flex items-center justify-center">
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : searchResults.length > 0 ? (
                <span className="text-[11px] font-mono font-semibold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 whitespace-nowrap">
                  {currentMatchIdx + 1}/{searchResults.length}
                </span>
              ) : searchQuery.trim().length > 0 ? (
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  0 matches
                </span>
              ) : null}
            </div>

            <div className="h-4 w-px bg-slate-800" />

            {/* Prev / Next Navigation Buttons */}
            <button
              onClick={goToPrevMatch}
              disabled={searchResults.length === 0}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous Match (Shift+Enter)"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            <button
              onClick={goToNextMatch}
              disabled={searchResults.length === 0}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next Match (Enter)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Case Sensitive Toggle Button */}
            <button
              onClick={() => setCaseSensitive((prev) => !prev)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                caseSensitive
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Match Case"
            >
              Aa
            </button>

            {/* Snippet List Drawer Toggle Button */}
            <button
              onClick={() => setShowMatchList((prev) => !prev)}
              disabled={searchResults.length === 0}
              className={`p-1 rounded transition-colors ${
                showMatchList
                  ? 'bg-amber-500/25 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              } disabled:opacity-30 disabled:hover:bg-transparent`}
              title="View all matching snippets"
            >
              <List className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              onClick={() => {
                setIsSearchOpen(false);
                setShowMatchList(false);
              }}
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Close search (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Expandable Snippet List Drawer */}
          {showMatchList && searchResults.length > 0 && (
            <div className="mt-1.5 w-80 sm:w-96 max-h-72 overflow-y-auto bg-slate-900/98 backdrop-blur-md border border-slate-700/90 rounded-xl shadow-2xl p-2 z-40 flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] text-slate-400 font-medium border-b border-slate-800/80 mb-1">
                <span>All matches ({searchResults.length})</span>
                <span>Click to jump</span>
              </div>
              {searchResults.map((m, idx) => {
                const isActive = idx === currentMatchIdx;
                return (
                  <button
                    key={m.id}
                    onClick={() => goToMatch(idx)}
                    className={`text-left p-2 rounded-lg transition-all flex flex-col gap-1 border ${
                      isActive
                        ? 'bg-amber-500/15 border-amber-500/50 shadow-sm shadow-amber-500/10'
                        : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-400 text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        Page {m.page}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        #{idx + 1}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-2">
                      {highlightSnippetQuery(m.snippet, searchQuery)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PDF Viewport / Canvas Container */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="flex-1 overflow-auto p-6 flex flex-col items-center bg-slate-950 relative select-text"
      >
        {/* Floating Quick Copy Pill over Selected Text */}
        {selectionBox && selectedText && (
          <div
            className="absolute z-50 animate-in fade-in zoom-in-95 duration-100 select-none"
            style={{
              top: `${selectionBox.top}px`,
              left: `${selectionBox.left}px`,
            }}
          >
            <button
              onClick={handleCopySelectedText}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/95 text-white text-xs font-semibold rounded-md shadow-2xl border border-blue-500/50 backdrop-blur-md hover:bg-blue-600 hover:border-blue-400 transition-all cursor-pointer"
              title="Click to copy selected text (or press Cmd+C / Ctrl+C)"
            >
              {copyFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-blue-400" />
                  <span>Copy text</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Global Floating Copied Feedback Pill */}
        {copyFeedback && !selectionBox && (
          <div className="fixed bottom-6 right-8 z-50 flex items-center gap-2 px-3 py-1.5 bg-emerald-950/95 border border-emerald-500/60 rounded-full shadow-2xl text-xs font-semibold text-emerald-200 animate-in fade-in slide-in-from-bottom-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Copied to clipboard</span>
          </div>
        )}

        {/* Floating Extraction Status Badge */}
        {isExtracting && (
          <div className="sticky top-2 z-30 mb-3 flex items-center gap-2.5 px-3.5 py-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-full shadow-lg text-xs font-medium text-slate-200 select-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>Document extraction in progress ({extractionElapsed}s) • Resolving citations...</span>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 select-none">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Loading document...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-2 max-w-sm text-center select-none">
            <FileWarning className="w-10 h-10 text-red-500" />
            <h4 className="text-sm font-semibold">Unable to Load PDF</h4>
            <p className="text-xs text-slate-400">{error}</p>
          </div>
        )}

        {!pdfUrl && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2 text-center select-none">
            <Highlighter className="w-10 h-10 text-slate-700" />
            <p className="text-xs">Select a paper from the library to view, select, search, and copy text.</p>
          </div>
        )}

        {/* Render Canvas, Selectable Text Layer & Highlight Overlays */}
        <div
          className={`relative shadow-2xl rounded-sm transition-opacity duration-200 select-text ${
            loading || error || !pdfUrl ? 'hidden' : 'block'
          }`}
          style={{
            width: `${pageDimensions.width * scale}px`,
            height: `${pageDimensions.height * scale}px`,
          }}
        >
          {/* Main PDF Canvas (Image Layer) */}
          <canvas
            ref={canvasRef}
            className="rounded-sm bg-white block shadow-lg pointer-events-none"
          />

          {/* Precision Highlight Overlay Layer (Underneath Text Layer for unobstructed selection) */}
          <div
            ref={highlightOverlayRef}
            className="absolute inset-0 pointer-events-none z-10"
          >
            {/* 1. Evidence Extraction Citation Highlights (Blue) */}
            {activeHighlight && activeHighlight.page === pageNum && (
              <>
                {activeHighlight.rects && activeHighlight.rects.length > 0 ? (
                  activeHighlight.rects.map((rect, idx) => {
                    const pdfW = activeHighlight.page_width || pageDimensions.width;
                    const pdfH = activeHighlight.page_height || pageDimensions.height;
                    const scaleX = (pageDimensions.width * scale) / pdfW;
                    const scaleY = (pageDimensions.height * scale) / pdfH;

                    const left = rect[0] * scaleX;
                    const top = rect[1] * scaleY;
                    const width = (rect[2] - rect[0]) * scaleX;
                    const height = (rect[3] - rect[1]) * scaleY;

                    return (
                      <div
                        key={`cit-${idx}`}
                        className="highlight-box absolute rounded transition-all duration-300 pointer-events-none"
                        style={{
                          left: `${left}px`,
                          top: `${top}px`,
                          width: `${Math.max(width, 10)}px`,
                          height: `${Math.max(height, 8)}px`,
                          backgroundColor: 'rgba(59, 130, 246, 0.45)',
                          border: '2px solid rgba(37, 99, 235, 0.95)',
                          boxShadow: '0 0 16px rgba(59, 130, 246, 0.7)',
                        }}
                      >
                        {idx === 0 && (
                          <div
                            className="absolute -top-7 left-0 whitespace-nowrap bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 z-30"
                            style={{ pointerEvents: 'none' }}
                          >
                            <Highlighter className="w-2.5 h-2.5" />
                            <span>{activeHighlight.label || 'Extraction Citation'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="absolute top-4 right-4 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded shadow-lg">
                    📍 Information cited on Page {activeHighlight.page}
                  </div>
                )}
              </>
            )}

            {/* 2. Keyword Search Match Highlights on Current Page (Amber/Yellow) */}
            {pageMatches.map((m) => {
              const isActive = currentActiveMatch?.id === m.id;
              const pdfW = m.page_width || pageDimensions.width;
              const pdfH = m.page_height || pageDimensions.height;
              const scaleX = (pageDimensions.width * scale) / pdfW;
              const scaleY = (pageDimensions.height * scale) / pdfH;

              return m.rects.map((rect, rIdx) => {
                const left = rect[0] * scaleX;
                const top = rect[1] * scaleY;
                const width = (rect[2] - rect[0]) * scaleX;
                const height = (rect[3] - rect[1]) * scaleY;

                return (
                  <div
                    key={`search-${m.id}-${rIdx}`}
                    className={`search-box absolute rounded-[2px] transition-all duration-150 pointer-events-none ${
                      isActive
                        ? 'search-match-active z-30 ring-2 ring-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.95)]'
                        : 'z-20'
                    }`}
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${Math.max(width, 8)}px`,
                      height: `${Math.max(height, 8)}px`,
                      backgroundColor: isActive
                        ? 'rgba(245, 158, 11, 0.65)'
                        : 'rgba(234, 179, 8, 0.35)',
                      border: isActive
                        ? '2px solid rgba(251, 191, 36, 1)'
                        : '1px solid rgba(202, 138, 4, 0.75)',
                    }}
                  >
                    {isActive && rIdx === 0 && (
                      <div
                        className="absolute -top-6 left-0 whitespace-nowrap bg-amber-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded shadow flex items-center gap-1 z-40"
                        style={{ pointerEvents: 'none' }}
                      >
                        <Search className="w-2.5 h-2.5 text-slate-950" />
                        <span>Match {currentMatchIdx + 1}/{searchResults.length}</span>
                      </div>
                    )}
                  </div>
                );
              });
            })}
          </div>

          {/* PDF.js Selectable & Copyable Text Layer (On Top, z-20) */}
          <div
            ref={textLayerRef}
            className="textLayer absolute inset-0 z-20 pointer-events-auto select-text"
            style={{
              width: `${pageDimensions.width * scale}px`,
              height: `${pageDimensions.height * scale}px`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
