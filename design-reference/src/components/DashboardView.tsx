import React, { useMemo } from "react";
import { Chatbot, Lead, KnowledgeSource } from "../types";
import { motion } from "motion/react";

interface DashboardViewProps {
  bots: Chatbot[];
  leads: Lead[];
  knowledgeSources: KnowledgeSource[];
  setActiveTab: (tab: string) => void;
  onOpenWizard: () => void;
  onSelectLead: (lead: Lead) => void;
}

export default function DashboardView({
  bots,
  leads,
  knowledgeSources,
  setActiveTab,
  onOpenWizard,
  onSelectLead
}: DashboardViewProps) {
  // Calculate aggregate metrics
  const activeBotsCount = bots.filter((b) => b.status === "ACTIVE").length;
  const totalLeadsToday = leads.length; // Just use size of mock lead database
  
  const averageSatisfaction = useMemo(() => {
    const activeBots = bots.filter((b) => b.satisfaction > 0);
    if (activeBots.length === 0) return 92;
    const totalSat = activeBots.reduce((sum, b) => sum + b.satisfaction, 0);
    return Math.round(totalSat / activeBots.length);
  }, [bots]);

  const knowledgeSyncedCount = knowledgeSources.filter((k) => k.status === "Synced").length;

  // Staggered animation containers
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Welcome Banner */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight font-sans">
            Welcome back to RigaChat
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            Your real estate chatbot fleet is synchronized and capturing live leads.
          </p>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-full shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-emerald-700 tracking-wide uppercase">All Engines Active</span>
        </div>
      </motion.div>

      {/* Quick Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Stat 1 */}
        <div className="glass-card hover-lift rounded-2xl p-6 flex items-center justify-between border-l-4 border-l-indigo-600">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Total Leads</p>
            <h3 className="text-3xl font-extrabold text-slate-800">{totalLeadsToday}</h3>
            <p className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm font-black">trending_up</span>
              +14% since yesterday
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <span className="material-symbols-outlined text-2xl font-bold">group</span>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="glass-card hover-lift rounded-2xl p-6 flex items-center justify-between border-l-4 border-l-indigo-400">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Active Bots</p>
            <h3 className="text-3xl font-extrabold text-slate-800">{activeBotsCount} / {bots.length}</h3>
            <p className="text-[11px] text-slate-500 font-bold mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">sync</span>
              {bots.length - activeBotsCount} in syncing queue
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
            <span className="material-symbols-outlined text-2xl font-bold">smart_toy</span>
          </div>
        </div>

        {/* Stat 3 */}
        <div className="glass-card hover-lift rounded-2xl p-6 flex items-center justify-between border-l-4 border-l-amber-500">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Client Sat</p>
            <h3 className="text-3xl font-extrabold text-slate-800">{averageSatisfaction}%</h3>
            <p className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm font-black">star</span>
              Exceeding sector averages
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined text-2xl font-bold">sentiment_very_satisfied</span>
          </div>
        </div>

        {/* Stat 4 */}
        <div className="glass-card hover-lift rounded-2xl p-6 flex items-center justify-between border-l-4 border-l-purple-500">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Knowledge Hub</p>
            <h3 className="text-3xl font-extrabold text-slate-800">{knowledgeSyncedCount} Sources</h3>
            <p className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">verified</span>
              100% vector accuracy
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
            <span className="material-symbols-outlined text-2xl font-bold">menu_book</span>
          </div>
        </div>
      </motion.div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Leads Table Card */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-card rounded-xl p-6 flex flex-col min-h-[460px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">Recent Captured Leads</h3>
              <p className="text-xs text-slate-500 font-medium">Real-time property inquiries captured from deployed agents.</p>
            </div>
            <button 
              onClick={() => setActiveTab("leads")} 
              className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              See database
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          <div className="flex-1 overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  <th className="pb-3 font-semibold">Lead Information</th>
                  <th className="pb-3 font-semibold">Interest & Budget</th>
                  <th className="pb-3 font-semibold">Origin Bot</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.slice(0, 5).map((lead) => (
                  <tr 
                    key={lead.id} 
                    onClick={() => onSelectLead(lead)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 pr-2">
                      <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                      <p className="text-xs text-slate-400 font-medium truncate max-w-[150px]">{lead.email}</p>
                    </td>
                    <td className="py-3.5 pr-2">
                      <p className="text-xs font-bold text-slate-700">{lead.propertyInterest}</p>
                      <p className="text-[11px] text-indigo-600 font-extrabold">{lead.budget}</p>
                    </td>
                    <td className="py-3.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 text-sm">smart_toy</span>
                        <p className="text-xs font-semibold text-slate-600 truncate max-w-[120px]">{lead.botName}</p>
                      </div>
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-block text-[9px] font-extrabold tracking-wider px-2.5 py-1 rounded-full text-center border ${
                        lead.status === "HOT LEAD" 
                          ? "bg-rose-50 text-rose-600 border-rose-100"
                          : lead.status === "NEGOTIATION"
                          ? "bg-amber-50 text-amber-600 border-amber-100"
                          : lead.status === "QUALIFIED"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : "bg-blue-50 text-blue-600 border-blue-100"
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Side Widget column */}
        <div className="space-y-6">
          {/* Knowledge base status */}
          <motion.div variants={itemVariants} className="glass-card rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Knowledge Coverage</h4>
              <h3 className="text-base font-black text-slate-800">RAG Database Status</h3>
              <p className="text-xs text-slate-500 font-medium mb-4">Vectorization health of property briefs and pricing catalog.</p>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Index Optimization</span>
                    <span>94%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full gradient-primary rounded-full" style={{ width: '94%' }}></div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                    <span className="material-symbols-outlined text-sm">database</span>
                    <span>Token Count</span>
                  </div>
                  <span className="font-mono font-bold text-slate-800">14.2M tokens</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setActiveTab("knowledge")}
              className="mt-6 w-full py-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-indigo-600 text-xs font-bold transition-all flex items-center justify-center gap-1 text-slate-600 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">settings_input_component</span>
              Manage RAG Index
            </button>
          </motion.div>

          {/* AI Optimizer Suggestions */}
          <motion.div variants={itemVariants} className="glass-card rounded-xl p-6 bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <span className="material-symbols-outlined text-base font-bold">auto_awesome</span>
              </div>
              <h4 className="text-sm font-extrabold text-slate-800">Riga AI Copilot Optimizer</h4>
            </div>

            <ul className="space-y-3 text-xs">
              <li className="flex gap-2.5 items-start bg-white p-3 rounded-lg border border-slate-200/80">
                <span className="material-symbols-outlined text-amber-500 text-sm mt-0.5">warning</span>
                <div>
                  <p className="font-bold text-slate-800">Unindexed Location detected</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Pune Bot received 14 rentals requests in Hinjewadi. Index a Hinjewadi property brief to increase capture rate by 22%.</p>
                </div>
              </li>

              <li className="flex gap-2.5 items-start bg-white p-3 rounded-lg border border-slate-200/80">
                <span className="material-symbols-outlined text-emerald-500 text-sm mt-0.5">check_circle</span>
                <div>
                  <p className="font-bold text-slate-800">Latency looking optimal</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Average LLM generation response latency is stabilized at 310ms.</p>
                </div>
              </li>
            </ul>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
