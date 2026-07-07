import React, { useState } from "react";
import { KnowledgeSource, TrainingLog } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface KnowledgeBaseViewProps {
  sources: KnowledgeSource[];
  logs: TrainingLog[];
  onAddSource: (source: Omit<KnowledgeSource, "id" | "percentageAnalyzed" | "status">) => void;
  onDeleteSource: (id: string) => void;
  onTriggerSync: (id: string) => void;
}

export default function KnowledgeBaseView({
  sources,
  logs,
  onAddSource,
  onDeleteSource,
  onTriggerSync
}: KnowledgeBaseViewProps) {
  const [activeCategory, setActiveCategory] = useState<"all" | "Property Details" | "Legal & Tax" | "FAQs & Pricing">("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<"PDF" | "URL" | "CSV">("PDF");
  const [sourceName, setSourceName] = useState("");
  const [sourceTarget, setSourceTarget] = useState(""); // URL or File placeholder
  const [sourceCategory, setSourceCategory] = useState<"Property Details" | "Legal & Tax" | "FAQs & Pricing">("Property Details");
  const [sourceDescription, setSourceDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Filter sources
  const filteredSources = sources.filter(
    (s) => activeCategory === "all" || s.category === activeCategory
  );

  // Group size counts for category stats
  const categoryCounts = {
    all: sources.length,
    property: sources.filter((s) => s.category === "Property Details").length,
    legal: sources.filter((s) => s.category === "Legal & Tax").length,
    faqs: sources.filter((s) => s.category === "FAQs & Pricing").length
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName) return;

    onAddSource({
      name: sourceName,
      type: uploadType,
      category: sourceCategory,
      description: sourceDescription || "Bespoke knowledge training document added by administrator.",
      size: uploadType === "URL" ? "Daily sync" : "420KB",
    });

    // Reset Form
    setSourceName("");
    setSourceTarget("");
    setSourceDescription("");
    setShowUploadModal(false);
  };

  // Drag and Drop simulated actions
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      setSourceName(file.name);
      setUploadType(file.name.endsWith(".csv") ? "CSV" : "PDF");
      setShowUploadModal(true);
    }
  };

  return (
    <div className="space-y-8 relative">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#191c1c] tracking-tight font-sans">
            RAG Knowledge Index
          </h2>
          <p className="text-sm text-[#414845]/70 font-medium">
            Upload floorplans, compliance PDF sheets, and pricing CSVs to automatically context-train the LLM vectors.
          </p>
        </div>

        {/* Upload Action */}
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-5 py-2.5 rounded-full bg-[#47645a] hover:bg-[#47645a]/90 text-white font-bold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-lg">upload</span>
          <span>Upload Document</span>
        </button>
      </div>

      {/* Categories Bento Grid Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* All */}
        <div
          onClick={() => setActiveCategory("all")}
          className={`p-5 rounded-3xl cursor-pointer transition-all border ${
            activeCategory === "all"
              ? "bg-[#47645a] border-[#47645a] text-white shadow-md shadow-[#47645a]/10 scale-[1.02]"
              : "glass-card hover-lift text-[#191c1c]"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: activeCategory === "all" ? "'FILL' 1" : undefined }}>
              folder_open
            </span>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white/20">
              {categoryCounts.all} files
            </span>
          </div>
          <p className="text-xs uppercase font-extrabold tracking-wider opacity-60">Complete Index</p>
          <h3 className="text-base font-black mt-0.5">All Knowledge</h3>
        </div>

        {/* Property Details */}
        <div
          onClick={() => setActiveCategory("Property Details")}
          className={`p-5 rounded-3xl cursor-pointer transition-all border ${
            activeCategory === "Property Details"
              ? "bg-[#47645a] border-[#47645a] text-white shadow-md shadow-[#47645a]/10 scale-[1.02]"
              : "glass-card hover-lift text-[#191c1c]"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: activeCategory === "Property Details" ? "'FILL' 1" : undefined }}>
              apartment
            </span>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white/20">
              {categoryCounts.property} files
            </span>
          </div>
          <p className="text-xs uppercase font-extrabold tracking-wider opacity-60">Property Specs</p>
          <h3 className="text-base font-black mt-0.5">Details & Inventories</h3>
        </div>

        {/* Legal & Tax */}
        <div
          onClick={() => setActiveCategory("Legal & Tax")}
          className={`p-5 rounded-3xl cursor-pointer transition-all border ${
            activeCategory === "Legal & Tax"
              ? "bg-[#47645a] border-[#47645a] text-white shadow-md shadow-[#47645a]/10 scale-[1.02]"
              : "glass-card hover-lift text-[#191c1c]"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: activeCategory === "Legal & Tax" ? "'FILL' 1" : undefined }}>
              gavel
            </span>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white/20">
              {categoryCounts.legal} files
            </span>
          </div>
          <p className="text-xs uppercase font-extrabold tracking-wider opacity-60">Compliance & RERA</p>
          <h3 className="text-base font-black mt-0.5">Legal Guidelines</h3>
        </div>

        {/* FAQs & Pricing */}
        <div
          onClick={() => setActiveCategory("FAQs & Pricing")}
          className={`p-5 rounded-3xl cursor-pointer transition-all border ${
            activeCategory === "FAQs & Pricing"
              ? "bg-[#47645a] border-[#47645a] text-white shadow-md shadow-[#47645a]/10 scale-[1.02]"
              : "glass-card hover-lift text-[#191c1c]"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: activeCategory === "FAQs & Pricing" ? "'FILL' 1" : undefined }}>
              payments
            </span>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white/20">
              {categoryCounts.faqs} files
            </span>
          </div>
          <p className="text-xs uppercase font-extrabold tracking-wider opacity-60">Pricing Schedules</p>
          <h3 className="text-base font-black mt-0.5">FAQs & Maintenance</h3>
        </div>
      </div>

      {/* Main Grid: Upload Dropzone, Source List, Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`glass-card rounded-3xl p-8 border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all h-44 ${
              isDragging
                ? "border-[#47645a] bg-[#47645a]/5 scale-[1.01]"
                : "border-[#47645a]/20 hover:border-[#47645a]/40"
            }`}
            onClick={() => {
              setUploadType("PDF");
              setShowUploadModal(true);
            }}
          >
            <div className="w-11 h-11 rounded-full bg-[#47645a]/10 text-[#47645a] flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-xl">upload_file</span>
            </div>
            <p className="text-xs font-black text-[#191c1c]">Drag & drop file here or click to browse</p>
            <p className="text-[10px] text-[#414845]/60 mt-1 font-semibold">Supports property specifications in PDF, URL sites, or pricing CSV databases.</p>
          </div>

          {/* Sources List container */}
          <div className="glass-card rounded-3xl p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-[#191c1c]">Active Knowledge Sources ({filteredSources.length})</h3>
              <p className="text-xs text-[#414845]/70 font-medium">Synced documents currently fueling the semantic context engine.</p>
            </div>

            <div className="divide-y divide-[#414845]/5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              {filteredSources.map((source) => (
                <div key={source.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-xs ${
                      source.type === "PDF"
                        ? "bg-red-500/10 text-red-600"
                        : source.type === "CSV"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-blue-500/10 text-blue-600"
                    }`}>
                      {source.type}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[#191c1c]">{source.name}</p>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                          source.status === "Synced"
                            ? "bg-[#47645a]/10 text-[#47645a] border border-[#47645a]/15"
                            : "bg-amber-500/10 text-amber-600 border border-amber-500/15 animate-pulse"
                        }`}>
                          {source.status} ({source.percentageAnalyzed}%)
                        </span>
                      </div>
                      <p className="text-xs text-[#414845]/75 mt-1 font-semibold leading-relaxed">
                        {source.description}
                      </p>
                      <div className="flex items-center gap-4 text-[10px] text-[#414845]/60 font-mono mt-2">
                        <span>Category: <strong className="text-[#414845] font-bold">{source.category}</strong></span>
                        {source.size && <span>Size: {source.size}</span>}
                        {source.syncFrequency && <span>Frequency: {source.syncFrequency}</span>}
                      </div>
                    </div>
                  </div>

                  {/* actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onTriggerSync(source.id)}
                      disabled={source.status === "Analyzing"}
                      className="p-1.5 rounded-lg bg-[#414845]/5 hover:bg-[#47645a]/10 hover:text-[#47645a] text-[#414845]/60 disabled:opacity-40 transition-colors"
                      title="Sync Document Vectors"
                    >
                      <span className="material-symbols-outlined text-lg">sync</span>
                    </button>
                    <button
                      onClick={() => onDeleteSource(source.id)}
                      className="p-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-500 transition-colors"
                      title="Remove Document Source"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sync Training Logs column */}
        <div className="glass-card rounded-3xl p-6 flex flex-col h-[580px]">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-[#414845]/70 mb-0.5">Training Health</h3>
              <h3 className="text-base font-black text-[#191c1c]">Index Logs</h3>
            </div>
            <span className="material-symbols-outlined text-[#47645a] text-lg">health_and_safety</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="p-4 rounded-2xl bg-white/40 border border-white/60 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${log.type === "success" ? "bg-[#47645a]" : "bg-blue-500"}`}></span>
                    <p className="font-extrabold text-[#191c1c]">{log.title}</p>
                  </div>
                  <span className="text-[10px] text-[#414845]/50 font-semibold">{log.timestamp.split("•")[0]}</span>
                </div>
                <p className="text-xs text-[#414845]/75 leading-relaxed font-medium">
                  {log.description}
                </p>
                <p className="text-[10px] text-[#414845]/50 font-mono text-right">{log.timestamp.split("•")[1] || ""}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upload/Creation Modal Popup */}
      <AnimatePresence>
        {showUploadModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUploadModal(false)}
              className="fixed inset-0 bg-[#191c1c]/15 backdrop-blur-sm z-50"
            ></motion.div>

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 m-auto h-fit w-full max-w-md bg-white/95 backdrop-blur-3xl border border-white/60 rounded-3xl p-6 shadow-2xl z-50"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-[#191c1c]">Train Index Source</h3>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-[#414845]/5 flex items-center justify-center text-[#414845]"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
                {/* Type selection selector */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-[#414845]/60 mb-2">Source Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["PDF", "URL", "CSV"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setUploadType(t)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          uploadType === t
                            ? "bg-[#47645a] border-[#47645a] text-white shadow-md shadow-[#47645a]/10"
                            : "bg-white/40 border-white/60 text-[#414845] hover:bg-white/80"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-[#414845]/60 mb-1.5">Source Title Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Worli Penthouse specifications..."
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/30 border border-white/60 focus:ring-2 focus:ring-[#47645a]/30 rounded-xl font-semibold outline-none"
                  />
                </div>

                {/* Target (URL address or Mock file input) */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-[#414845]/60 mb-1.5">
                    {uploadType === "URL" ? "Website Link URL" : "Mock File Selection"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={uploadType === "URL" ? "https://your-inventory-listings.com/specs" : "worli_specs_draft_v2.pdf"}
                    value={sourceTarget}
                    onChange={(e) => setSourceTarget(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/30 border border-white/60 focus:ring-2 focus:ring-[#47645a]/30 rounded-xl font-semibold outline-none"
                  />
                </div>

                {/* Category dropdown */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-[#414845]/60 mb-1.5">Category Section</label>
                  <div className="relative">
                    <select
                      value={sourceCategory}
                      onChange={(e) => setSourceCategory(e.target.value as any)}
                      className="w-full pl-3 pr-10 py-2.5 bg-white/30 border border-white/60 focus:ring-2 focus:ring-[#47645a]/30 rounded-xl font-bold outline-none cursor-pointer appearance-none"
                    >
                      <option value="Property Details">Property Details & Spec sheets</option>
                      <option value="Legal & Tax">Legal Compliance (RERA & Stamp Duties)</option>
                      <option value="FAQs & Pricing">Pricing, Catalog, or Loan Partners</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#414845]/50 pointer-events-none text-lg">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-[#414845]/60 mb-1.5">Internal Summary covers (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of what vectors are indexed in this source..."
                    value={sourceDescription}
                    onChange={(e) => setSourceDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-white/30 border border-white/60 focus:ring-2 focus:ring-[#47645a]/30 rounded-xl font-semibold outline-none resize-none"
                  />
                </div>

                {/* Action footer */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="flex-1 py-2.5 text-xs font-bold text-[#414845] bg-white/40 border border-white/60 rounded-xl hover:bg-white/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 text-xs font-bold text-white bg-[#47645a] hover:bg-[#47645a]/90 rounded-xl shadow-md transition-colors"
                  >
                    Index Vectors
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
