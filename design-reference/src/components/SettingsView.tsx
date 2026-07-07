import React, { useState } from "react";
import { UserProfile } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface SettingsViewProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
}

export default function SettingsView({ userProfile, onUpdateProfile }: SettingsViewProps) {
  // Local form states
  const [name, setName] = useState(userProfile.name);
  const [email, setEmail] = useState(userProfile.email);
  const [avatar, setAvatar] = useState(userProfile.avatar);
  const [plan, setPlan] = useState(userProfile.plan);

  // System settings
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
  const [temperature, setTemperature] = useState(0.7);
  const [voiceSupport, setVoiceSupport] = useState(false);
  const [emailDigest, setEmailDigest] = useState(true);
  const [whatsappSync, setWhatsappSync] = useState(false);

  // Toast confirmation
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({ name, email, avatar, plan });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div className="space-y-8 relative">
      {/* View Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight font-sans">
          Workspace Settings & Definitions
        </h2>
        <p className="text-sm text-slate-500 font-medium">
          Configure default AI models, notification parameters, and manage your Evan Parker administrator profile.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card & Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 sm:p-8 space-y-6">
            <h3 className="text-base font-black text-slate-800">Evan Parker Profile Details</h3>

            <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-slate-100">
              <div className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-slate-100 shadow-sm">
                <img className="w-full h-full object-cover" src={avatar} alt={name} />
              </div>
              <div className="space-y-2 flex-1 text-xs">
                <p className="font-extrabold text-slate-800">Administrator Avatar Icon</p>
                <input
                  type="text"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-semibold outline-none text-slate-800 transition-all"
                  placeholder="Paste direct image avatar URL..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              {/* Name */}
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-1.5">User Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-semibold outline-none text-slate-800 transition-all"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-1.5">Primary Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-semibold outline-none text-slate-800 transition-all"
                />
              </div>

              {/* Plan dropdown */}
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-1.5">Billing Membership Plan</label>
                <div className="relative">
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-bold outline-none cursor-pointer appearance-none text-slate-800"
                  >
                    <option value="Free Tier Plan">Free Tier Plan</option>
                    <option value="Standard Plan">Standard Plan</option>
                    <option value="Pro Plan">Pro Plan (Unlimited Sync)</option>
                    <option value="Enterprise Elite">Enterprise Elite Partnership</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">
                    expand_more
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 hover:scale-[1.01] transition-all cursor-pointer"
              >
                Save Profile Changes
              </button>
            </div>
          </form>

          {/* AI LLM Settings card */}
          <div className="glass-card rounded-xl p-6 sm:p-8 space-y-5 text-xs">
            <h3 className="text-base font-black text-slate-800">LLM Architecture Preferences</h3>
            <p className="text-slate-500 font-medium">Customize the core Gemini foundational neural config fueling responses.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Model select */}
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-400 mb-1.5">Primary Inference Model</label>
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-bold outline-none cursor-pointer appearance-none text-slate-800"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Fastest, Recommended)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep Reasoning)</option>
                    <option value="gemini-3.5-experimental">Gemini 3.5 Experimental (Next-Gen)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Temperature slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">AI Creativity Latency (Temperature)</label>
                  <span className="font-mono font-bold text-indigo-600">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1">
                  <span>Precise / Literal</span>
                  <span>Creative / Conversational</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System toggles column */}
        <div className="glass-card rounded-xl p-6 sm:p-8 space-y-6 h-fit">
          <h3 className="text-base font-black text-slate-800">Ecosystem Integrations</h3>
          <p className="text-xs text-slate-500 font-medium">Quick toggles for automatic background webhooks and alerts.</p>

          <div className="space-y-4 text-xs font-semibold text-slate-800">
            {/* Toggle 1 */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100/50 transition-colors">
              <div>
                <p className="font-bold">Weekly Digest Email Alert</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Recieve filtered leads list PDF in your inbox every Monday morning.</p>
              </div>
              <button
                onClick={() => setEmailDigest(!emailDigest)}
                className={`w-10 h-6 rounded-full p-1 transition-all cursor-pointer ${emailDigest ? "bg-indigo-600" : "bg-slate-200"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-all ${emailDigest ? "translate-x-4" : "translate-x-0"}`}></div>
              </button>
            </div>

            {/* Toggle 2 */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100/50 transition-colors">
              <div>
                <p className="font-bold">WhatsApp Direct CRM Sync</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Forward new hot leads immediately to relationship managers via SMS.</p>
              </div>
              <button
                onClick={() => setWhatsappSync(!whatsappSync)}
                className={`w-10 h-6 rounded-full p-1 transition-all cursor-pointer ${whatsappSync ? "bg-indigo-600" : "bg-slate-200"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-all ${whatsappSync ? "translate-x-4" : "translate-x-0"}`}></div>
              </button>
            </div>

            {/* Toggle 3 */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100/50 transition-colors">
              <div>
                <p className="font-bold">Enable Voice Dictation</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Allow prospective buyers to speak directly to the embed chat iframe widget.</p>
              </div>
              <button
                onClick={() => setVoiceSupport(!voiceSupport)}
                className={`w-10 h-6 rounded-full p-1 transition-all cursor-pointer ${voiceSupport ? "bg-indigo-600" : "bg-slate-200"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-all ${voiceSupport ? "translate-x-4" : "translate-x-0"}`}></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save popup toast notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 bg-slate-900 text-white px-5 py-3 rounded-lg shadow-xl z-50 flex items-center gap-2 text-xs font-bold border border-slate-800"
          >
            <span className="material-symbols-outlined text-indigo-400 text-base">check_circle</span>
            <span>Configuration changes saved successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
