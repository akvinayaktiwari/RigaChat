import React, { useState, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import DashboardView from "./components/DashboardView";
import ChatbotsView from "./components/ChatbotsView";
import LeadsView from "./components/LeadsView";
import KnowledgeBaseView from "./components/KnowledgeBaseView";
import SettingsView from "./components/SettingsView";
import BotWizardView from "./components/BotWizardView";

import { 
  DEFAULT_USER, 
  DEFAULT_CHATBOTS, 
  DEFAULT_LEADS, 
  DEFAULT_KNOWLEDGE_SOURCES, 
  DEFAULT_TRAINING_LOGS 
} from "./data";

import { Chatbot, Lead, KnowledgeSource, TrainingLog, UserProfile, LeadStatus } from "./types";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_USER);
  const [bots, setBots] = useState<Chatbot[]>(DEFAULT_CHATBOTS);
  const [leads, setLeads] = useState<Lead[]>(DEFAULT_LEADS);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(DEFAULT_KNOWLEDGE_SOURCES);
  const [logs, setLogs] = useState<TrainingLog[]>(DEFAULT_TRAINING_LOGS);

  // Inspector and search states
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingBot, setEditingBot] = useState<Chatbot | undefined>(undefined);

  // Handler for creating/updating a chatbot via Wizard
  const handleDeployBot = (botData: Omit<Chatbot, "id" | "leadsToday" | "satisfaction" | "leadsCount">) => {
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    if (editingBot) {
      // Edit mode
      setBots((prev) =>
        prev.map((b) =>
          b.id === editingBot.id
            ? { ...b, ...botData, status: "ACTIVE" }
            : b
        )
      );

      // Append logs
      const newLog: TrainingLog = {
        id: `log-${Date.now()}`,
        title: `${botData.name} Re-deployed`,
        description: `Model prompts, triggers and greeting directives updated. Custom vectors synchronized.`,
        timestamp: `${dateStr} • ${timestampStr} PM`,
        type: "success"
      };
      setLogs((prev) => [newLog, ...prev]);
    } else {
      // Create mode
      const newBot: Chatbot = {
        ...botData,
        id: `bot-${Date.now()}`,
        status: "ACTIVE",
        leadsToday: 0,
        satisfaction: 92,
        leadsCount: 0
      };
      setBots((prev) => [newBot, ...prev]);

      // Append logs
      const newLog: TrainingLog = {
        id: `log-${Date.now()}`,
        title: `${botData.name} Deployed`,
        description: `A brand-new conversational agent is live at ${botData.url}. Index vector synchronization is completed.`,
        timestamp: `${dateStr} • ${timestampStr} PM`,
        type: "success"
      };
      setLogs((prev) => [newLog, ...prev]);
    }

    setEditingBot(undefined);
    setActiveTab("chatbots");
  };

  // Delete Chatbot
  const handleDeleteBot = (botId: string) => {
    setBots((prev) => prev.filter((b) => b.id !== botId));
    // Remove lead associations or references if needed
  };

  // Add Knowledge base Document
  const handleAddKnowledgeSource = (newSourceData: Omit<KnowledgeSource, "id" | "percentageAnalyzed" | "status">) => {
    const newId = `ks-${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    const newSource: KnowledgeSource = {
      ...newSourceData,
      id: newId,
      percentageAnalyzed: 20,
      status: "Analyzing"
    };

    setKnowledgeSources((prev) => [newSource, ...prev]);

    // Initial logs
    const startLog: TrainingLog = {
      id: `log-${Date.now()}-start`,
      title: "Index Sync Scheduled",
      description: `Analyzing ${newSourceData.name} (${newSourceData.type}). Scheduling embeddings generation.`,
      timestamp: `${dateStr} • ${timestampStr} PM`,
      type: "info"
    };
    setLogs((prev) => [startLog, ...prev]);

    // Simulate RAG synchronization loading state
    setTimeout(() => {
      setKnowledgeSources((prevSources) =>
        prevSources.map((s) =>
          s.id === newId
            ? { ...s, percentageAnalyzed: 100, status: "Synced" }
            : s
        )
      );

      const successLog: TrainingLog = {
        id: `log-${Date.now()}-done`,
        title: "Index Optimization Successful",
        description: `Ingested text structures from ${newSourceData.name}. Vector database optimized successfully.`,
        timestamp: `${dateStr} • ${timestampStr} PM`,
        type: "success"
      };
      setLogs((prev) => [successLog, ...prev]);
    }, 3000);
  };

  // Delete Knowledge base source
  const handleDeleteKnowledgeSource = (id: string) => {
    setKnowledgeSources((prev) => prev.filter((s) => s.id !== id));
  };

  // Manual Trigger Sync of Knowledge source
  const handleTriggerSyncSource = (id: string) => {
    const source = knowledgeSources.find((s) => s.id === id);
    if (!source) return;

    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    setKnowledgeSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "Analyzing", percentageAnalyzed: 45 } : s))
    );

    const reindexLog: TrainingLog = {
      id: `log-${Date.now()}-sync`,
      title: "Re-indexing Requested",
      description: `Forced vector update triggered for ${source.name}. Ingesting changed inventory records.`,
      timestamp: `${dateStr} • ${timestampStr} PM`,
      type: "info"
    };
    setLogs((prev) => [reindexLog, ...prev]);

    setTimeout(() => {
      setKnowledgeSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "Synced", percentageAnalyzed: 100 } : s))
      );

      const successLog: TrainingLog = {
        id: `log-${Date.now()}-done`,
        title: "Indexing Health Restored",
        description: `Vectors stabilized. Chunk indexes rebuilt for ${source.name}.`,
        timestamp: `${dateStr} • ${timestampStr} PM`,
        type: "success"
      };
      setLogs((prev) => [successLog, ...prev]);
    }, 2000);
  };

  // Update lead status stage classification
  const handleUpdateLeadStatus = (leadId: string, nextStatus: LeadStatus) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: nextStatus } : l))
    );
    setSelectedLead((prev) => (prev && prev.id === leadId ? { ...prev, status: nextStatus } : prev));
  };

  // Global search lookup cross-filter overlay
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    
    const matchedBots = bots.filter(
      (b) => b.name.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)
    );

    const matchedLeads = leads.filter(
      (l) => l.name.toLowerCase().includes(query) || l.email.toLowerCase().includes(query) || l.propertyInterest.toLowerCase().includes(query)
    );

    const matchedKnowledge = knowledgeSources.filter(
      (k) => k.name.toLowerCase().includes(query) || k.category.toLowerCase().includes(query)
    );

    return { matchedBots, matchedLeads, matchedKnowledge };
  }, [searchQuery, bots, leads, knowledgeSources]);

  // Main navigation action button trigger
  const handleTriggerWizard = (botToEdit?: Chatbot) => {
    setEditingBot(botToEdit);
    setActiveTab("wizard");
  };

  return (
    <div className="min-h-screen flex text-[#191c1c] font-sans antialiased">
      {/* 1. Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setSearchQuery(""); // Clear lookup on tab switch
        }} 
        userProfile={userProfile} 
      />

      {/* 2. Main Workstation Shell Container */}
      <div className="flex-1 ml-64 min-h-screen flex flex-col relative">
        
        {/* Top Header navbar */}
        <Header
          userProfile={userProfile}
          onNewBot={() => handleTriggerWizard()}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          placeholderText={
            activeTab === "leads" 
              ? "Search database by buyer name, email, or property specs..." 
              : activeTab === "knowledge" 
              ? "Search indexed RAG documents or categories..."
              : "Search RigaChat workspace..."
          }
        />

        {/* Content Pane container */}
        <main className="flex-1 pt-24 px-8 pb-12 overflow-y-auto max-w-7xl mx-auto w-full">
          
          <AnimatePresence mode="wait">
            {/* Global Search Matches view overlay */}
            {searchResults ? (
              <motion.div
                key="searchResults"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-xl font-black text-[#191c1c] tracking-tight">
                    Global Matches for "{searchQuery}"
                  </h2>
                  <p className="text-xs text-[#414845]/70 font-semibold mt-1">
                    Searched across conversational agents, buyers lists, and the vector index catalog.
                  </p>
                </div>

                {/* matched Bots */}
                {searchResults.matchedBots.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[#414845]/60 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm font-bold">smart_toy</span>
                      Chatbots ({searchResults.matchedBots.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {searchResults.matchedBots.map((bot) => (
                        <div key={bot.id} className="glass-card p-4 rounded-2xl flex items-center justify-between border border-white/60">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-[#47645a] text-xl">{bot.icon}</span>
                            <div>
                              <p className="text-xs font-bold text-[#191c1c]">{bot.name}</p>
                              <p className="text-[10px] text-[#414845]/60 font-mono truncate max-w-[150px]">{bot.url}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleTriggerWizard(bot)}
                            className="px-3 py-1.5 rounded-lg bg-[#47645a]/10 text-[#47645a] text-[10px] font-black tracking-wide uppercase hover:bg-[#47645a]/25 transition-all"
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* matched Leads */}
                {searchResults.matchedLeads.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[#414845]/60 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm font-bold">group</span>
                      Captured Leads ({searchResults.matchedLeads.length})
                    </h4>
                    <div className="glass-card rounded-2xl p-4 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#414845]/10 text-[9px] font-black uppercase tracking-widest text-[#414845]/50 pb-2">
                            <th className="pb-2">Name</th>
                            <th className="pb-2">Interest</th>
                            <th className="pb-2">Budget</th>
                            <th className="pb-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#414845]/5">
                          {searchResults.matchedLeads.map((lead) => (
                            <tr
                              key={lead.id}
                              onClick={() => {
                                setSelectedLead(lead);
                                setActiveTab("leads");
                                setSearchQuery("");
                              }}
                              className="hover:bg-white/20 transition-colors cursor-pointer"
                            >
                              <td className="py-2.5 font-bold text-[#191c1c]">{lead.name}</td>
                              <td className="py-2.5 font-semibold text-[#414845]">{lead.propertyInterest}</td>
                              <td className="py-2.5 font-black text-[#47645a]">{lead.budget}</td>
                              <td className="py-2.5">
                                <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-[#47645a]/10 text-[#47645a]">
                                  {lead.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* matched Knowledge */}
                {searchResults.matchedKnowledge.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[#414845]/60 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm font-bold">menu_book</span>
                      Knowledge Index Catalog ({searchResults.matchedKnowledge.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {searchResults.matchedKnowledge.map((ks) => (
                        <div key={ks.id} className="glass-card p-4 rounded-2xl flex items-center justify-between border border-white/60 text-xs">
                          <div className="flex gap-2.5">
                            <span className="material-symbols-outlined text-[#414845]/60">article</span>
                            <div>
                              <p className="font-bold text-[#191c1c]">{ks.name}</p>
                              <p className="text-[9px] text-[#414845]/60 font-semibold mt-0.5">{ks.category}</p>
                            </div>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                            {ks.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.matchedBots.length === 0 && searchResults.matchedLeads.length === 0 && searchResults.matchedKnowledge.length === 0 && (
                  <div className="h-64 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-3xl text-[#414845]/20 mb-2">find_in_page</span>
                    <p className="text-sm font-bold text-[#191c1c]">No matches found across the ecosystem</p>
                    <p className="text-xs text-[#414845]/60 mt-1">Verify spelling coordinates or reset search keywords.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              /* Standard Tab Routing Views */
              <>
                {activeTab === "dashboard" && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <DashboardView
                      bots={bots}
                      leads={leads}
                      knowledgeSources={knowledgeSources}
                      setActiveTab={setActiveTab}
                      onOpenWizard={() => handleTriggerWizard()}
                      onSelectLead={(lead) => {
                        setSelectedLead(lead);
                        setActiveTab("leads");
                      }}
                    />
                  </motion.div>
                )}

                {activeTab === "chatbots" && (
                  <motion.div
                    key="chatbots"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <ChatbotsView
                      bots={bots}
                      onOpenWizard={(bot) => handleTriggerWizard(bot)}
                      onDeleteBot={handleDeleteBot}
                    />
                  </motion.div>
                )}

                {activeTab === "leads" && (
                  <motion.div
                    key="leads"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <LeadsView
                      leads={leads}
                      bots={bots}
                      selectedLead={selectedLead}
                      onSelectLead={setSelectedLead}
                      onUpdateLeadStatus={handleUpdateLeadStatus}
                    />
                  </motion.div>
                )}

                {activeTab === "knowledge" && (
                  <motion.div
                    key="knowledge"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <KnowledgeBaseView
                      sources={knowledgeSources}
                      logs={logs}
                      onAddSource={handleAddKnowledgeSource}
                      onDeleteSource={handleDeleteKnowledgeSource}
                      onTriggerSync={handleTriggerSyncSource}
                    />
                  </motion.div>
                )}

                {activeTab === "settings" && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <SettingsView 
                      userProfile={userProfile} 
                      onUpdateProfile={setUserProfile} 
                    />
                  </motion.div>
                )}

                {activeTab === "wizard" && (
                  <motion.div
                    key="wizard"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                  >
                    <BotWizardView
                      existingBot={editingBot}
                      onDeploy={handleDeployBot}
                      onCancel={() => {
                        setEditingBot(undefined);
                        setActiveTab("chatbots");
                      }}
                    />
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>

        </main>
      </div>
    </div>
  );
}
