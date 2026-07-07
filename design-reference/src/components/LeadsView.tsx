import React, { useState, useMemo } from "react";
import { Lead, Chatbot, LeadStatus } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface LeadsViewProps {
  leads: Lead[];
  bots: Chatbot[];
  selectedLead: Lead | null;
  onSelectLead: (lead: Lead | null) => void;
  onUpdateLeadStatus: (id: string, status: LeadStatus) => void;
}

export default function LeadsView({
  leads,
  bots,
  selectedLead,
  onSelectLead,
  onUpdateLeadStatus
}: LeadsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [botFilter, setBotFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  // Get unique regions
  const regions = useMemo(() => {
    const list = leads.map((l) => l.region).filter(Boolean);
    return Array.from(new Set(list));
  }, [leads]);

  // Filter logic
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.propertyInterest.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesBot = botFilter === "all" || lead.botId === botFilter || lead.botName === botFilter;
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesRegion = regionFilter === "all" || lead.region === regionFilter;

      return matchesSearch && matchesBot && matchesStatus && matchesRegion;
    });
  }, [leads, searchTerm, botFilter, statusFilter, regionFilter]);

  // Export CSV functionality
  const handleExportCSV = () => {
    if (filteredLeads.length === 0) return;
    
    // Create headers
    const headers = ["Lead ID", "Name", "Email", "Phone", "Origin Bot", "Property Interest", "Budget", "Status", "Region", "Timestamp"];
    
    // Map lines
    const rows = filteredLeads.map((l) => [
      l.id,
      `"${l.name.replace(/"/g, '""')}"`,
      l.email,
      `"${l.phone}"`,
      `"${l.botName}"`,
      `"${l.propertyInterest.replace(/"/g, '""')}"`,
      `"${l.budget}"`,
      l.status,
      l.region,
      l.timestamp
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rigachat_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate simulated chat log for selected lead
  const currentLeadChatHistory = useMemo(() => {
    if (!selectedLead) return [];
    
    const greeting = bots.find(b => b.id === selectedLead.botId)?.greetingMessage 
      || "Namaste! Welcome. How can I help you find your dream luxury property today?";

    return [
      { sender: "bot" as const, text: greeting, time: "10:02 AM" },
      { sender: "user" as const, text: `Hello, I am interested in ${selectedLead.propertyInterest} with a budget around ${selectedLead.budget}.`, time: "10:03 AM" },
      { sender: "bot" as const, text: "Excellent! I have premium registered listings matching that profile. Could you provide your contact details (email and phone) so our real estate manager can send the detailed brochures?", time: "10:03 AM" },
      { sender: "user" as const, text: `Sure! My email is ${selectedLead.email} and my phone number is ${selectedLead.phone}. My name is ${selectedLead.name}.`, time: "10:04 AM" },
      { sender: "bot" as const, text: `Thank you, ${selectedLead.name}! I have locked in your interest for ${selectedLead.propertyInterest}. Our relationship manager will reach out within the hour. Have a wonderful day!`, time: "10:04 AM" }
    ];
  }, [selectedLead, bots]);

  return (
    <div className="space-y-8 relative">
      {/* View Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight font-sans">
            Lead Ecosystem
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            Search, filter, classify, and export high-intent real estate buyers captured by your bots.
          </p>
        </div>

        {/* CSV Export Button */}
        <button
          onClick={handleExportCSV}
          disabled={filteredLeads.length === 0}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-lg">download</span>
          <span>Export CSV ({filteredLeads.length})</span>
        </button>
      </div>

      {/* Filters Strip */}
      <div className="glass-card rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">
            search
          </span>
          <input
            type="text"
            placeholder="Search name, email, interest..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-xs font-semibold outline-none transition-all text-slate-800"
          />
        </div>

        {/* Bot filter */}
        <div className="relative">
          <select
            value={botFilter}
            onChange={(e) => setBotFilter(e.target.value)}
            className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-xs font-bold outline-none cursor-pointer appearance-none text-slate-800"
          >
            <option value="all">All Chatbots</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">
            expand_more
          </span>
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-xs font-bold outline-none cursor-pointer appearance-none text-slate-800"
          >
            <option value="all">All Statuses</option>
            <option value="HOT LEAD">HOT LEAD</option>
            <option value="INTERESTED">INTERESTED</option>
            <option value="NEGOTIATION">NEGOTIATION</option>
            <option value="QUALIFIED">QUALIFIED</option>
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">
            expand_more
          </span>
        </div>

        {/* Region filter */}
        <div className="relative">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-xs font-bold outline-none cursor-pointer appearance-none text-slate-800"
          >
            <option value="all">All Regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">
            expand_more
          </span>
        </div>
      </div>

      {/* Main Database Table Container */}
      <div className="glass-card rounded-xl p-6 min-h-[400px]">
        {filteredLeads.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">
              person_off
            </span>
            <p className="font-bold text-sm text-slate-800">No leads found matching filters</p>
            <p className="text-xs text-slate-400 mt-1">Try resetting search filters or parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  <th className="pb-3 font-semibold">Lead Details</th>
                  <th className="pb-3 font-semibold">Contact</th>
                  <th className="pb-3 font-semibold">Origin Agent</th>
                  <th className="pb-3 font-semibold">Interest Profile</th>
                  <th className="pb-3 font-semibold">Region</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => onSelectLead(lead)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="py-4 pr-2">
                      <p className="font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {lead.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">ID: {lead.id}</p>
                    </td>
                    <td className="py-4 pr-2">
                      <p className="font-semibold text-slate-800">{lead.email}</p>
                      <p className="text-slate-500 font-semibold">{lead.phone}</p>
                    </td>
                    <td className="py-4 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-slate-400 text-sm">smart_toy</span>
                        <span className="font-semibold text-slate-600">{lead.botName}</span>
                      </div>
                    </td>
                    <td className="py-4 pr-2">
                      <p className="font-bold text-slate-800">{lead.propertyInterest}</p>
                      <p className="text-[10px] font-black text-indigo-600">{lead.budget}</p>
                    </td>
                    <td className="py-4 pr-2">
                      <span className="font-bold text-slate-500">{lead.region}</span>
                    </td>
                    <td className="py-4 pr-2">
                      <span
                        className={`inline-block text-[9px] font-extrabold tracking-wider px-2.5 py-1 rounded-full text-center border ${
                          lead.status === "HOT LEAD"
                            ? "bg-rose-50 text-rose-600 border border-rose-100"
                            : lead.status === "NEGOTIATION"
                            ? "bg-amber-50 text-amber-600 border border-amber-100"
                            : lead.status === "QUALIFIED"
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                            : "bg-blue-50 text-blue-600 border border-blue-100"
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-4 font-bold text-slate-400">{lead.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Regional Stats strip at bottom */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <span className="material-symbols-outlined font-bold">payments</span>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-400 font-black">Estimated Value Ecosystem</p>
            <p className="text-base font-black text-slate-800">₹18.4 Crores Pool</p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50/50 text-indigo-500 flex items-center justify-center">
            <span className="material-symbols-outlined font-bold">map</span>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-400 font-black">Dominant Region Interest</p>
            <p className="text-base font-black text-slate-800">Bangalore & Mumbai</p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <span className="material-symbols-outlined font-bold">bolt</span>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-400 font-black">Average Lead Response Time</p>
            <p className="text-base font-black text-slate-800">Instant AI Handoff</p>
          </div>
        </div>
      </div>

      {/* Slide-out Drawer Panel for Lead transcript detail */}
      <AnimatePresence>
        {selectedLead && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onSelectLead(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
            ></motion.div>

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed right-0 top-0 h-screen w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl p-8 z-50 flex flex-col justify-between"
            >
              <div>
                {/* Header Actions */}
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Lead Transcript Inspector
                  </span>
                  <button
                    onClick={() => onSelectLead(null)}
                    className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                {/* Lead Info Header */}
                <div className="mb-6 pb-6 border-b border-slate-100">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">{selectedLead.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 font-semibold">
                    Captured from <strong className="text-indigo-600 font-bold">{selectedLead.botName}</strong> • {selectedLead.timestamp}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg">
                      <p className="text-[10px] uppercase text-slate-400 font-black mb-1">Email</p>
                      <p className="font-extrabold text-slate-800 truncate">{selectedLead.email}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg">
                      <p className="text-[10px] uppercase text-slate-400 font-black mb-1">Phone</p>
                      <p className="font-extrabold text-slate-800 truncate">{selectedLead.phone}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg">
                      <p className="text-[10px] uppercase text-slate-400 font-black mb-1">Property Focus</p>
                      <p className="font-extrabold text-slate-800 truncate">{selectedLead.propertyInterest}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg">
                      <p className="text-[10px] uppercase text-slate-400 font-black mb-1">Budget</p>
                      <p className="font-black text-indigo-600 truncate">{selectedLead.budget}</p>
                    </div>
                  </div>
                </div>

                {/* Live Transcript Logs */}
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm font-bold">forum</span>
                    Conversation Transcript
                  </h4>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                    {currentLeadChatHistory.map((chat, idx) => {
                      const isBot = chat.sender === "bot";
                      return (
                        <div key={idx} className={`flex flex-col ${isBot ? "items-start" : "items-end"}`}>
                          <div className={`p-3.5 rounded-lg max-w-[85%] text-xs font-medium border ${
                            isBot 
                              ? "bg-slate-50 border-slate-100 text-slate-800" 
                              : "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          }`}>
                            <p>{chat.text}</p>
                          </div>
                          <span className="text-[9px] text-slate-400 font-semibold mt-1 px-1">{chat.time}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Status Updater Drawer Footer */}
              <div className="border-t border-slate-100 pt-4 mt-6">
                <p className="text-[10px] uppercase text-slate-400 font-black mb-2">Classify Lead Stage</p>
                <div className="grid grid-cols-4 gap-2">
                  {(["HOT LEAD", "INTERESTED", "NEGOTIATION", "QUALIFIED"] as LeadStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => onUpdateLeadStatus(selectedLead.id, st)}
                      className={`py-2 px-1 rounded-lg text-[9px] font-extrabold tracking-wider border transition-all cursor-pointer ${
                        selectedLead.status === st
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10 scale-[1.03]"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
