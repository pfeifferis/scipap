import React, { useState, useMemo, useEffect } from 'react';
import { 
  Check, 
  X, 
  Edit3, 
  MapPin, 
  Copy, 
  CheckCheck, 
  FileSearch, 
  HelpCircle, 
  ExternalLink, 
  PlusCircle, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  ChevronsUpDown,
  BookOpen,
  Trash2,
  Plus,
  Activity,
  Loader2,
  Clock
} from 'lucide-react';
import { SchemaField, Extraction, HighlightTarget, CitationItem } from '../types';

interface ExtractionTableProps {
  fields: SchemaField[];
  extractions: Extraction[];
  onUpdateExtraction: (extractionId: number, update: { edited_value?: string; quote?: string; citations?: any[] }) => Promise<void>;
  onAddCitation?: (extractionId: number, citation: { quote: string; page?: number }) => Promise<void>;
  onDeleteCitation?: (extractionId: number, citationIndex: number) => Promise<void>;
  onSelectHighlight: (target: HighlightTarget) => void;
  activeHighlight: HighlightTarget | null;
  onOpenSchema: () => void;
  onRunExtraction: () => void;
  isExtracting: boolean;
}

export const ExtractionTable: React.FC<ExtractionTableProps> = ({
  fields,
  extractions,
  onUpdateExtraction,
  onAddCitation,
  onDeleteCitation,
  onSelectHighlight,
  activeHighlight,
  onOpenSchema,
  onRunExtraction,
  isExtracting,
}) => {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    let interval: any = null;
    if (isExtracting) {
      setElapsed(0);
      interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isExtracting]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Mini-form state for adding extra citations
  const [addingCitationForId, setAddingCitationForId] = useState<number | null>(null);
  const [newQuote, setNewQuote] = useState<string>('');
  const [newPage, setNewPage] = useState<string>('');
  const [isSubmittingCitation, setIsSubmittingCitation] = useState<boolean>(false);

  // Map extractions by field_key
  const extractionMap = useMemo(() => {
    const map = new Map<string, Extraction>();
    extractions.forEach((ext) => {
      map.set(ext.field_key, ext);
    });
    return map;
  }, [extractions]);

  // Group active fields by category
  const categorizedFields = useMemo(() => {
    const groups: Record<string, SchemaField[]> = {};
    const q = searchTerm.toLowerCase().trim();

    fields
      .filter((f) => f.is_active !== false)
      .forEach((field) => {
        const cat = field.category || 'General';
        const matchesSearch = !q || 
          field.label.toLowerCase().includes(q) || 
          field.key.toLowerCase().includes(q) ||
          (field.description && field.description.toLowerCase().includes(q));

        if (matchesSearch) {
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(field);
        }
      });
    return groups;
  }, [fields, searchTerm]);

  const categories = Object.keys(categorizedFields);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  const toggleAll = () => {
    const allCollapsed = categories.every((cat) => collapsedCategories[cat]);
    const newState: Record<string, boolean> = {};
    categories.forEach((cat) => {
      newState[cat] = !allCollapsed;
    });
    setCollapsedCategories(newState);
  };

  const handleStartEdit = (ext: Extraction, initialVal: string) => {
    setEditingId(ext.id);
    setEditValue(initialVal || '');
  };

  const handleSaveEdit = async (extId: number) => {
    await onUpdateExtraction(extId, { edited_value: editValue });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCitationClick = (cit: CitationItem, fieldLabel: string) => {
    if (!cit.page) return;
    onSelectHighlight({
      page: cit.page,
      rects: cit.rects || [],
      label: fieldLabel,
      quote: cit.quote || undefined,
      page_width: cit.page_width || undefined,
      page_height: cit.page_height || undefined,
      timestamp: Date.now(),
    });
  };

  const handleRowClick = (ext: Extraction | undefined, field: SchemaField) => {
    if (!ext) return;
    const citations = getCitations(ext);
    if (citations.length > 0) {
      handleCitationClick(citations[0], field.label);
    } else if (ext.page) {
      onSelectHighlight({
        page: ext.page,
        rects: ext.rects || [],
        label: field.label,
        quote: ext.quote || undefined,
        page_width: ext.page_width || undefined,
        page_height: ext.page_height || undefined,
        timestamp: Date.now(),
      });
    }
  };

  const getCitations = (ext?: Extraction): CitationItem[] => {
    if (!ext) return [];
    if (ext.citations && ext.citations.length > 0) {
      return ext.citations;
    }
    if (ext.quote) {
      return [{
        quote: ext.quote,
        page: ext.page,
        rects: ext.rects,
        page_width: ext.page_width,
        page_height: ext.page_height,
      }];
    }
    return [];
  };

  const handleOpenAddCitation = (extId: number, defaultPage?: number | null) => {
    setAddingCitationForId(extId);
    setNewQuote('');
    setNewPage(defaultPage ? String(defaultPage) : '');
  };

  const handleSaveNewCitation = async (extId: number) => {
    if (!newQuote.trim() || !onAddCitation) return;
    setIsSubmittingCitation(true);
    try {
      const pageNum = newPage.trim() ? parseInt(newPage.trim(), 10) : undefined;
      await onAddCitation(extId, { quote: newQuote.trim(), page: isNaN(pageNum as any) ? undefined : pageNum });
      setAddingCitationForId(null);
      setNewQuote('');
      setNewPage('');
    } finally {
      setIsSubmittingCitation(false);
    }
  };

  const totalActiveFields = fields.filter((f) => f.is_active !== false).length;
  const extractedCount = extractions.filter((e) => {
    const val = (e.edited_value !== null && e.edited_value !== undefined && e.edited_value !== '' ? e.edited_value : (e.value || '')).trim().toUpperCase();
    return val && val !== 'NR' && val !== 'NA' && val !== 'N/A' && val !== 'NULL' && val !== 'NOT REPORTED' && val !== 'NOT APPLICABLE';
  }).length;

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden select-text">
      {/* Table Header Controls */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 tracking-tight">Extracted Data Table</h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {extractedCount} / {totalActiveFields} Fields
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click any citation to jump to and highlight passage in PDF. Multiple citations per field supported.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleAll}
              title="Expand / Collapse all categories"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onOpenSchema}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
              <span>Add Field</span>
            </button>
          </div>
        </div>

        {/* Filter Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2" />
          <input
            type="text"
            placeholder="Search within extraction fields (e.g. author, auroc, density)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Active Extraction Status Banner */}
      {isExtracting && (
        <div className="mx-4 my-2.5 p-3.5 rounded-xl bg-slate-900/95 border border-blue-500/40 shadow-lg shadow-blue-500/10 shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
                <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-100 tracking-wide">
                    Automated Extraction Pipeline Active
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    {elapsed < 10 ? `00:0${elapsed}s` : `00:${elapsed}s`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {elapsed < 4
                    ? "Step 1/4: Parsing document layout and structuring target schema variables..."
                    : elapsed < 12
                    ? "Step 2/4: Submitting structured batch inference request to model..."
                    : elapsed < 35
                    ? "Step 3/4: Processing literature text and extracting evidence quotes..."
                    : "Step 4/4: Resolving coordinate bounding boxes and validating references..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.min(96, Math.max(8, elapsed * 3.5))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5">
            <span>Asynchronous literature parsing & evidence grounding</span>
            <span>Estimated 20–50s • Table updates automatically upon completion</span>
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div className="flex-1 overflow-y-auto">
        {categories.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <HelpCircle className="w-10 h-10 text-slate-600 mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">No Matching Fields</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              No fields matched your search term "{searchTerm}".
            </p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {categories.map((category) => {
              const catFields = categorizedFields[category];
              const isCollapsed = !!collapsedCategories[category];
              const catExtracted = catFields.filter((f) => {
                const e = extractionMap.get(f.key);
                return !!(e && (e.edited_value || e.value));
              }).length;

              return (
                <div
                  key={category}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/30 overflow-hidden"
                >
                  {/* Category Accordion Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full px-4 py-2.5 bg-slate-900/80 hover:bg-slate-800/70 border-b border-slate-800/60 flex items-center justify-between text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <span className="text-xs font-bold text-slate-200 tracking-wide">
                        {category}
                      </span>
                    </div>

                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                      {catExtracted} / {catFields.length}
                    </span>
                  </button>

                  {/* Category Field Items */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-800/50">
                      {catFields.map((field) => {
                        const ext = extractionMap.get(field.key);
                        const rawVal = ext?.edited_value !== null && ext?.edited_value !== undefined 
                          ? ext.edited_value 
                          : (ext?.value !== null && ext?.value !== undefined ? ext.value : '');
                        const displayValue = rawVal.trim();
                        const upper = displayValue.toUpperCase();
                        
                        // Strict distinction:
                        // 1. isPending = field was not evaluated/extracted yet (null / empty / no ext object)
                        // 2. isNR = LLM explicitly returned "NR", "NA", "N/A", "Not Reported", "Not Applicable"
                        // 3. isExtracted = LLM extracted a concrete finding
                        // 4. isEdited = investigator manual override
                        const isPending = !ext || ext.value === null || ext.value === undefined || (rawVal === '' && (ext.edited_value === null || ext.edited_value === undefined));
                        const isNR = !isPending && (upper === 'NR' || upper === 'NA' || upper === 'N/A' || upper === 'NOT REPORTED' || upper === 'NOT APPLICABLE');
                        const isEdited = ext?.edited_value !== null && ext?.edited_value !== undefined;
                        const isExtracted = !isPending && !isNR && !isEdited;
                        const isCurrentHighlight = activeHighlight?.label === field.label;
                        const isEditing = editingId === ext?.id;
                        const citations = getCitations(ext);
                        const hasCitations = citations.length > 0;
                        const isAddingCitation = addingCitationForId === ext?.id;

                        return (
                          <div
                            key={field.key}
                            onClick={() => !isEditing && handleRowClick(ext, field)}
                            className={`p-3.5 transition-all duration-150 cursor-pointer ${
                              isCurrentHighlight
                                ? 'bg-amber-500/10 border-l-4 border-l-amber-500 ring-1 ring-amber-500/20'
                                : 'hover:bg-slate-800/40 border-l-4 border-l-transparent'
                            }`}
                          >
                            {/* Top Row: Label, Status, Quick Actions */}
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 min-w-0 pr-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-200 truncate">
                                  {field.label}
                                </span>

                                {isEdited && (
                                  <span className="text-[9px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded shrink-0">
                                    Edited
                                  </span>
                                )}

                                {isExtracted && (
                                  <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded shrink-0">
                                    Extracted
                                  </span>
                                )}

                                {citations.length > 1 && (
                                  <span className="text-[9px] font-semibold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.2 rounded flex items-center gap-1 shrink-0">
                                    <BookOpen className="w-2.5 h-2.5" />
                                    {citations.length} Citations
                                  </span>
                                )}

                                {isNR && (
                                  <span className="text-[9px] font-semibold text-slate-400 bg-slate-800/90 border border-slate-700/80 px-1.5 py-0.2 rounded shrink-0 font-mono">
                                    {upper === 'NA' || upper === 'N/A' ? 'NA' : 'NR'}
                                  </span>
                                )}

                                {isPending && (
                                  <span className="text-[9px] font-medium text-slate-500 bg-slate-800 px-1.5 py-0.2 rounded shrink-0">
                                    Not Extracted
                                  </span>
                                )}
                              </div>

                              {/* Controls */}
                              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {displayValue && (
                                  <button
                                    onClick={() => handleCopy(displayValue, field.key)}
                                    title="Copy value"
                                    className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                  >
                                    {copiedKey === field.key ? (
                                      <CheckCheck className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                )}

                                {ext && !isEditing && (
                                  <button
                                    onClick={() => handleStartEdit(ext, displayValue)}
                                    title="Edit value"
                                    className="p-1 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                )}

                                {ext && onAddCitation && (
                                  <button
                                    onClick={() => handleOpenAddCitation(ext.id, ext.page)}
                                    title="Add another citation for this finding"
                                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-colors"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                    <span>Add Citation</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Field Description Subtitle */}
                            {field.description && (
                              <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                                {field.description}
                              </p>
                            )}

                            {/* Editable Value Container */}
                            {isEditing ? (
                              <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  rows={3}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-full p-2.5 bg-slate-950 border border-blue-500 rounded-lg text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Enter modified value..."
                                  autoFocus
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center gap-1"
                                  >
                                    <X className="w-3 h-3" /> Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveEdit(ext!.id)}
                                    className="px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" /> Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onDoubleClick={() => ext && handleStartEdit(ext, isNR ? 'NR' : (isPending ? '' : displayValue))}
                                className={`p-2.5 rounded-lg text-xs transition-colors ${
                                  isExtracted || isEdited
                                    ? 'bg-slate-950/60 text-slate-200 border border-slate-800/80 leading-relaxed'
                                    : isNR
                                    ? 'bg-slate-950/30 text-slate-400 border border-dashed border-slate-800/90'
                                    : 'bg-slate-950/20 text-slate-500 italic border border-dashed border-slate-800/60'
                                }`}
                              >
                                {isExtracted || isEdited ? (
                                  displayValue
                                ) : isNR ? (
                                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-bold text-[11px] border border-slate-700">
                                      {upper === 'NA' || upper === 'N/A' ? 'NA' : 'NR'}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-normal italic">
                                      {upper === 'NA' || upper === 'N/A' ? '(Not Applicable in Study)' : '(Not Reported in Study)'}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic">Not yet extracted.</span>
                                )}
                              </div>
                            )}

                            {/* Multiple Citations List */}
                            {hasCitations && (
                              <div className="mt-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                {citations.map((cit, cIdx) => {
                                  const isCitActive = activeHighlight?.label === field.label && activeHighlight?.quote === cit.quote;
                                  return (
                                    <div
                                      key={cIdx}
                                      onClick={() => handleCitationClick(cit, field.label)}
                                      className={`pl-3 pr-2 py-2 rounded-lg border text-[11px] transition-all cursor-pointer group flex flex-col gap-1 ${
                                        isCitActive
                                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 shadow-sm'
                                          : 'bg-slate-950/50 hover:bg-amber-500/5 border-slate-800/80 hover:border-amber-500/30 text-amber-300/85'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                                            <FileSearch className="w-3 h-3" />
                                            Citation {citations.length > 1 ? `#${cIdx + 1}` : ''}
                                          </span>

                                          {cit.page && (
                                            <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                              isCitActive 
                                                ? 'bg-amber-500 text-slate-950' 
                                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                            }`}>
                                              <MapPin className="w-2.5 h-2.5" />
                                              Page {cit.page}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] text-amber-400/60 group-hover:text-amber-300 flex items-center gap-0.5">
                                            Show in PDF <ExternalLink className="w-2.5 h-2.5" />
                                          </span>

                                          {ext && onDeleteCitation && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteCitation(ext.id, cIdx);
                                              }}
                                              title="Delete this citation"
                                              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-opacity"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      <p className="italic leading-snug font-serif text-slate-200/90 pl-1 border-l border-amber-500/40">
                                        "{cit.quote}"
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Mini-form to Add New Citation */}
                            {isAddingCitation && ext && (
                              <div 
                                className="mt-2 p-3 bg-slate-950 border border-blue-500/50 rounded-lg space-y-2 text-xs animate-in slide-in-from-top-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-blue-300 flex items-center gap-1 text-[11px]">
                                    <Plus className="w-3 h-3" /> Add Additional Citation
                                  </span>
                                  <button
                                    onClick={() => setAddingCitationForId(null)}
                                    className="text-slate-400 hover:text-slate-200"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>

                                <textarea
                                  rows={2}
                                  value={newQuote}
                                  onChange={(e) => setNewQuote(e.target.value)}
                                  placeholder="Paste exact verbatim sentence or passage from the paper..."
                                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                                  autoFocus
                                />

                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] text-slate-400">Page #:</span>
                                    <input
                                      type="number"
                                      value={newPage}
                                      onChange={(e) => setNewPage(e.target.value)}
                                      placeholder="e.g. 2"
                                      className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                                    />
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setAddingCitationForId(null)}
                                      className="px-2 py-1 text-slate-400 hover:text-slate-200 text-xs"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleSaveNewCitation(ext.id)}
                                      disabled={!newQuote.trim() || isSubmittingCitation}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      {isSubmittingCitation ? 'Locating...' : 'Save & Locate'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="px-5 py-2 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          {categories.length} Research Domains Active
        </span>
        <span>Click any citation to jump to exact passage in PDF</span>
      </div>
    </div>
  );
};
