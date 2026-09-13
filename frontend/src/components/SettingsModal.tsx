import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  Cpu, 
  Check, 
  FileCode, 
  ExternalLink, 
  AlertCircle,
  Eye,
  EyeOff,
  RotateCcw
} from 'lucide-react';
import { Settings } from '../types';
import { api } from '../api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsSaved: (updated: Settings) => void;
}

const POPULAR_MODELS = [
  { id: 'google/gemini-2.5-flash-lite:batch', name: 'Google Gemini 2.5 Flash Lite (Batch Queue)', desc: 'Asynchronous batch pipeline (1M token context window) — Default' },
  { id: 'google/gemini-2.5-flash-lite', name: 'Google Gemini 2.5 Flash Lite (Standard)', desc: 'Real-time synchronous inference (1M token context window)' },
  { id: 'google/gemini-flash-latest', name: 'Google Gemini Flash Latest', desc: 'Latest production Flash model (1M+ context window)' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct', desc: 'Open-weights architecture with high structured JSON extraction fidelity' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct', desc: 'Meta open foundation model (128k context window)' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', desc: 'High-throughput reasoning architecture' },
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini', desc: 'Compact multimodal foundation model (128k context window)' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic Claude 3.5 Sonnet', desc: 'Frontier reasoning model for complex extraction protocols' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsSaved,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState(settings.model || 'google/gemini-2.5-flash');
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(settings.system_prompt || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setModel(settings.model || 'google/gemini-2.5-flash');
    const isPop = POPULAR_MODELS.some((m) => m.id === settings.model);
    if (!isPop && settings.model) {
      setIsCustomModel(true);
      setCustomModel(settings.model);
    } else {
      setIsCustomModel(false);
    }
    setSystemPrompt(settings.system_prompt || '');
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSavedSuccess(false);

    try {
      const selectedModel = isCustomModel ? customModel.trim() : model;
      if (!selectedModel) {
        throw new Error('Please select or enter an LLM model.');
      }

      await api.saveSettings({
        openrouter_api_key: apiKey ? apiKey.trim() : undefined,
        model: selectedModel,
        system_prompt: systemPrompt || undefined,
      });

      const updated = await api.getSettings();
      onSettingsSaved(updated);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Key className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">LLM & Extraction Settings</h3>
              <p className="text-[11px] text-slate-400">Configure OpenRouter API and LLM parameters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* OpenRouter API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <span>OpenRouter API Key</span>
                {settings.openrouter_api_key_set && (
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    Key Active
                  </span>
                )}
              </label>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                Get OpenRouter Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings.openrouter_api_key_set ? '•••••••••••••••••••••••• (Leave blank to keep existing)' : 'sk-or-v1-...'}
                className="w-full pl-3 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Your key connects securely to OpenRouter's unified endpoint. Can also be set in <code>.env</code> as <code>OPENROUTER_API_KEY</code>.
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>Extraction Model</span>
            </label>

            <select
              value={isCustomModel ? 'custom' : model}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setIsCustomModel(true);
                } else {
                  setIsCustomModel(false);
                  setModel(e.target.value);
                }
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {POPULAR_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id})
                </option>
              ))}
              <option value="custom">Other / Custom Model ID...</option>
            </select>

            {isCustomModel && (
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. mistralai/mistral-large-2407"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono mt-2"
              />
            )}
          </div>

          {/* System Prompt Customizer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                <span>Extraction Prompt Instructions</span>
              </label>
              <button
                type="button"
                onClick={() => setSystemPrompt('')}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                title="Reset to default system prompt"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Reset
              </button>
            </div>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Leave blank to use default scientific extraction prompt..."
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" /> Saved!
              </>
            ) : isSaving ? (
              'Saving...'
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
