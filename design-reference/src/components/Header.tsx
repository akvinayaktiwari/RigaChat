import React from "react";
import { UserProfile } from "../types";

interface HeaderProps {
  userProfile: UserProfile;
  onNewBot: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  placeholderText?: string;
}

export default function Header({
  userProfile,
  onNewBot,
  searchQuery,
  setSearchQuery,
  placeholderText = "Search conversations, bots, or leads..."
}: HeaderProps) {
  return (
    <header className="h-16 fixed top-0 right-0 left-64 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-8 z-40">
      {/* Search Bar */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-sm font-sans placeholder-slate-400 text-slate-800 transition-all outline-none"
            placeholder={placeholderText}
          />
        </div>
      </div>

      {/* Utility Actions & User CTA */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button 
            className="relative w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all active:scale-90"
            title="Notifications"
          >
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white animate-pulse"></span>
          </button>
          
          {/* Help center */}
          <button 
            className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all active:scale-90"
            title="Help Center"
          >
            <span className="material-symbols-outlined">help_outline</span>
          </button>
        </div>

        {/* Divider */}
        <div className="h-6 w-[1px] bg-slate-200"></div>

        {/* User Status / Info */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-slate-800 leading-tight">{userProfile.name}</p>
            <p className="text-[10px] text-slate-500 font-semibold uppercase">{userProfile.plan}</p>
          </div>
          <div className="w-10 h-10 rounded-full border-2 border-slate-100 p-0.5 overflow-hidden shadow-sm">
            <img className="w-full h-full object-cover rounded-full" src={userProfile.avatar} alt={userProfile.name} />
          </div>
        </div>

        {/* primary Action CTA: New Bot */}
        <button
          onClick={onNewBot}
          className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm hover:scale-[1.01] active:scale-95 transition-all flex items-center gap-2 cursor-pointer text-xs uppercase tracking-wide"
        >
          <span className="material-symbols-outlined text-sm font-bold">add</span>
          <span>New bot</span>
        </button>
      </div>
    </header>
  );
}
