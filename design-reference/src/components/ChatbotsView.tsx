import React, { useState } from "react";
import { Chatbot } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface ChatbotsViewProps {
  bots: Chatbot[];
  onOpenWizard: (bot?: Chatbot) => void;
  onDeleteBot: (id: string) => void;
}

export default function ChatbotsView({ bots, onOpenWizard, onDeleteBot }: ChatbotsViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"deployments" | "sessions">("deployments");

  const handleCopyCode = (botId: string) => {
    const embedCode = `<script src="https://rigachat.com/cdn/bot-${botId}.js" defer></script>`;
    navigator.clipboard.writeText(embedCode);
    setCopiedId(botId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const simulatedSessions = [
    { id: "s-1", visitor: "Visitor #8291", region: "Mumbai", botName: "South Delhi Concierge", time: "5 mins ago", text: "Looking for a premium villa with private pool.", messages: 4 },
    { id: "s-2", visitor: "Visitor #4829", region: "Pune", botName: "Pune Rental Bot", time: "18 mins ago", text: "Do you have 1BHK near Hinjewadi Phase 2?", messages: 7 },
    { id: "s-3", visitor: "Visitor #1102", region: "Delhi", botName: "South Delhi Concierge", time: "1 hour ago", text: "What is the maintenance cost per square foot?", messages: 3 },
    { id: "s-4", visitor: "Visitor #9021", region: "Mumbai", botName: "Mumbai Hub Bot", time: "4 hours ago", text: "Interested in co-working desks for a 15-person team.", messages: 9 }
  ];

  return (
    <div className="space-y-8">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight font-sans">
            Deployments & Chatbots
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            Deploy, train, embed, and inspect your custom AI Real Estate agents.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="bg-slate-100 border border-slate-200 p-1 rounded-xl flex items-center shadow-inner">
          <button
            onClick={() => setActiveTab("deployments")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "deployments"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/50"
            }`}
          >
            Deployments ({bots.length})
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "sessions"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/50"
            }`}
          >
            Recent Sessions ({simulatedSessions.length})
          </button>
        </div>
      </div>

      {activeTab === "deployments" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active deployments bento cards */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {bots.map((bot) => (
                <motion.div
                  key={bot.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 100 }}
                  className="glass-card hover-lift rounded-xl p-6 flex flex-col justify-between min-h-[290px] relative overflow-hidden"
                >
                  {/* Glass Card Header */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-xl">
                            {bot.icon || "smart_toy"}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-800 truncate max-w-[150px]">
                            {bot.name}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]">
                            {bot.url}
                          </p>
                        </div>
                      </div>

                      {/* Status */}
                      <span
                        className={`text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full border ${
                          bot.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                        }`}
                      >
                        {bot.status}
                      </span>
                    </div>

                    {/* Description instruction */}
                    <p className="text-xs text-slate-500 line-clamp-3 mb-4 font-medium italic">
                      "{bot.systemInstruction || "Ready to guide prospective property buyers."}"
                    </p>

                    {/* Bottom Stats inside Card */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4 text-xs font-semibold">
                      <div>
                        <p className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">Leads Captured</p>
                        <p className="text-slate-800 font-black">{bot.leadsCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">Satisfaction</p>
                        <p className="text-slate-800 font-black">
                          {bot.satisfaction > 0 ? `${bot.satisfaction}%` : "Calculating"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-4 mt-auto">
                    <button
                      onClick={() => onOpenWizard(bot)}
                      className="flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                      Modify
                    </button>

                    <button
                      onClick={() => handleCopyCode(bot.id)}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                        copiedId === bot.id
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                      }`}
                      title="Copy Embed Code Script"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copiedId === bot.id ? "check" : "code"}
                      </span>
                      <span>{copiedId === bot.id ? "Copied" : "Script"}</span>
                    </button>

                    {bots.length > 1 && (
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${bot.name}?`)) {
                            onDeleteBot(bot.id);
                          }
                        }}
                        className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors cursor-pointer"
                        title="Delete Bot"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Create Bot Card */}
              <button
                onClick={() => onOpenWizard()}
                className="glass-card hover-lift rounded-xl p-6 flex flex-col items-center justify-center min-h-[290px] border-2 border-dashed border-indigo-200 hover:border-indigo-500 transition-all text-center group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 shadow-sm group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl font-black">add</span>
                </div>
                <h3 className="font-extrabold text-base text-slate-800">Create New Real Estate Agent</h3>
                <p className="text-xs text-slate-500 font-medium max-w-[200px] mt-1.5 leading-relaxed">
                  Train another bot with bespoke prompt directives, lead routing forms and catalogs.
                </p>
              </button>
            </div>
          </div>

          {/* Premium Upgrade Prompt Side Panel */}
          <div className="space-y-6">
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-6 relative overflow-hidden text-white shadow-xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
              
              <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-6 shadow-md shadow-indigo-500/20">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  workspace_premium
                </span>
              </div>

              <h4 className="text-lg font-black tracking-tight text-white">Upgrade to Deep-Sync</h4>
              <p className="text-xs text-slate-300 mt-2 font-semibold leading-relaxed">
                Connect your chatbot directly to internal CRM systems, trigger active SMS/WhatsApp follow-ups, and sync with live builder inventories.
              </p>

              <ul className="mt-4 space-y-2.5 text-xs text-slate-300 font-bold">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-400 text-sm font-black">check_circle</span>
                  <span>WhatsApp Cloud API Embedding</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-400 text-sm font-black">check_circle</span>
                  <span>10-Second Auto PDF inventory sync</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-400 text-sm font-black">check_circle</span>
                  <span>Unlimited Vector Database Indexing</span>
                </li>
              </ul>

              <button className="w-full mt-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/35 cursor-pointer">
                Unlock Pro Analytics
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* simulated conversations tab */
        <div className="glass-card rounded-xl p-6 min-h-[400px]">
          <div className="mb-6">
            <h3 className="text-lg font-extrabold text-slate-800">Active Live Interactions</h3>
            <p className="text-xs text-slate-500 font-medium">Real-time inspections of visitor requests and LLM resolutions.</p>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  <th className="pb-3 font-semibold">User</th>
                  <th className="pb-3 font-semibold">Origin Location</th>
                  <th className="pb-3 font-semibold">Chat Agent</th>
                  <th className="pb-3 font-semibold">Last Message</th>
                  <th className="pb-3 font-semibold">Turns</th>
                  <th className="pb-3 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {simulatedSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 pr-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600">
                          {session.visitor.slice(-2)}
                        </div>
                        <p className="text-sm font-bold text-slate-800">{session.visitor}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-2">
                      <p className="text-xs font-bold text-slate-500">{session.region}</p>
                    </td>
                    <td className="py-4 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 text-sm">smart_toy</span>
                        <p className="text-xs font-semibold text-slate-800">{session.botName}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-2 max-w-[200px] truncate">
                      <p className="text-xs font-semibold text-slate-500 italic">"{session.text}"</p>
                    </td>
                    <td className="py-4 pr-2">
                      <span className="px-2.5 py-0.5 bg-slate-50 border border-slate-100 text-[10px] font-bold rounded-full text-slate-600">
                        {session.messages} turns
                      </span>
                    </td>
                    <td className="py-4">
                      <p className="text-[11px] font-bold text-slate-400">{session.time}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
