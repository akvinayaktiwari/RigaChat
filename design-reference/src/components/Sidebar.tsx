import React from "react";
import { UserProfile } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userProfile: UserProfile;
}

export default function Sidebar({ activeTab, setActiveTab, userProfile }: SidebarProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "chatbots", label: "Chatbots", icon: "smart_toy" },
    { id: "leads", label: "Leads", icon: "group" },
    { id: "knowledge", label: "Knowledge Base", icon: "menu_book" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  return (
    <aside className="h-screen w-64 fixed left-0 top-0 glass-sidebar shadow-xl flex flex-col py-8 px-4 z-50">
      {/* Brand Identity */}
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-inner">
          <span className="material-symbols-outlined text-[#6366F1] text-2xl font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>
            chat_bubble
          </span>
        </div>
        <div>
          <h1 className="font-sans text-xl font-bold text-white tracking-tight leading-tight">RigaChat<span className="text-[#6366F1]">.ai</span></h1>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Real Estate AI</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-left hover:bg-slate-800/60 hover:translate-x-1 ${
                isActive
                  ? "active-nav-link shadow-sm"
                  : "text-slate-400 font-medium hover:text-white"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive ? "'FILL' 1" : undefined }}>
                {item.icon}
              </span>
              <span className="text-sm tracking-wide font-sans">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="mt-auto pt-4 border-t border-[#1E293B]">
        <div className="bg-[#1E293B] border border-[#334155]/60 rounded-2xl p-4 flex items-center gap-3 hover:bg-[#2e3b4e] transition-colors">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#334155] shadow-sm flex-shrink-0">
            <img className="w-full h-full object-cover" src={userProfile.avatar} alt={userProfile.name} />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold text-white truncate">{userProfile.name}</p>
            <p className="text-[10px] text-slate-400 font-semibold uppercase">{userProfile.plan}</p>
          </div>
          <button onClick={() => setActiveTab("settings")} className="text-slate-400 hover:text-white transition-colors" title="View Profile Settings">
            <span className="material-symbols-outlined text-[20px]">more_vert</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
