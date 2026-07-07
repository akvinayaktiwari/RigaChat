import React, { useState, useEffect, useRef } from "react";
import { Chatbot, ChatMessage, CaptureTiming } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface BotWizardViewProps {
  existingBot?: Chatbot;
  onDeploy: (bot: Omit<Chatbot, "id" | "leadsToday" | "satisfaction" | "leadsCount">) => void;
  onCancel: () => void;
}

export default function BotWizardView({ existingBot, onDeploy, onCancel }: BotWizardViewProps) {
  const [step, setStep] = useState(1);

  // Form states
  const [botName, setBotName] = useState(existingBot?.name || "");
  const [botUrl, setBotUrl] = useState(existingBot?.url || "");
  const [botIcon, setBotIcon] = useState(existingBot?.icon || "apartment");
  const [greetingMessage, setGreetingMessage] = useState(
    existingBot?.greetingMessage || "Namaste! Welcome. How can I help you find your dream luxury property today?"
  );
  const [systemInstruction, setSystemInstruction] = useState(
    existingBot?.systemInstruction || "You are a professional real estate expert. Guide users to find properties, ask for their preferred budget, and gather contact details."
  );
  const [timing, setTiming] = useState<CaptureTiming>(existingBot?.timing || "Immediately");

  // Lead fields toggle
  const [leadFields, setLeadFields] = useState({
    name: true,
    email: true,
    phone: true,
    budget: true,
    location: true
  });

  // Sandbox Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Initialize sandbox with greeting when botName or greetingMessage updates
  useEffect(() => {
    setChatMessages([
      { sender: "bot", text: greetingMessage || "Hello! How can I assist you with real estate inquiries today?" }
    ]);
  }, [greetingMessage]);

  // Auto scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isBotTyping]);

  const handleSandboxSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userText = userInput;
    setUserInput("");

    // Append user message
    setChatMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setIsBotTyping(true);

    try {
      // API request to server-side Gemini endpoint
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history: chatMessages.slice(1), // Exclude first greeting
          systemInstruction: systemInstruction,
          greetingMessage: greetingMessage
        })
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with chat server");
      }

      const data = await response.json();
      setChatMessages((prev) => [...prev, { sender: "bot", text: data.text }]);
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        { sender: "bot", text: "[System Warning] Flipped to offline mode. Ready to book your property walk-through soon." }
      ]);
    } finally {
      setIsBotTyping(false);
    }
  };

  const handleNextStep = () => {
    if (step < 4) {
      setStep((s) => s + 1);
    } else {
      // Deploy bot
      onDeploy({
        name: botName || "Skyline Custom Assistant",
        url: botUrl || "skyline-realty.in/assistant",
        status: "ACTIVE",
        icon: botIcon,
        greetingMessage,
        systemInstruction,
        timing
      });
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((s) => s - 1);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-140px)] items-stretch">
      {/* Wizard Form Container */}
      <div className="lg:col-span-7 glass-card rounded-xl p-6 sm:p-8 flex flex-col justify-between overflow-y-auto custom-scrollbar">
        <div>
          {/* Step indicators */}
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
            <h3 className="font-sans text-lg font-black text-slate-800">
              {existingBot ? "Reconfigure Bot Agent" : "AI Agent Deployment Wizard"}
            </h3>

            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${
                      step >= s
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    {s}
                  </div>
                  {s < 4 && (
                    <div
                      className={`h-[2px] w-6 transition-all ${
                        step > s ? "bg-indigo-600" : "bg-slate-200"
                      }`}
                    ></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Steps Content inside AnimatePresence */}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-5 text-xs"
              >
                <div>
                  <h4 className="text-sm font-black text-slate-800 mb-1">Step 1: Brand Identity & Persona</h4>
                  <p className="text-slate-500 font-medium">Configure basic launcher identities, symbols and greeting prompts.</p>
                </div>

                {/* Bot Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-400 mb-1.5">Bot Launcher Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. South Delhi Concierge"
                      value={botName}
                      onChange={(e) => setBotName(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-semibold outline-none text-slate-800 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-400 mb-1.5">Embedding Host URL</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. skyline-realty.in/concierge"
                      value={botUrl}
                      onChange={(e) => setBotUrl(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-semibold outline-none text-slate-800 transition-all"
                    />
                  </div>
                </div>

                {/* Bot Icon */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-400 mb-2">Launcher Launcher Symbol Icon</label>
                  <div className="flex gap-4">
                    {[
                      { icon: "apartment", label: "Apartment" },
                      { icon: "key", label: "Rentals" },
                      { icon: "store", label: "Commercial" },
                      { icon: "chat_bubble", label: "Inquiries" }
                    ].map((symbol) => (
                      <button
                        type="button"
                        key={symbol.icon}
                        onClick={() => setBotIcon(symbol.icon)}
                        className={`py-3 px-4 rounded-lg border flex flex-col items-center gap-1 flex-1 cursor-pointer transition-all ${
                          botIcon === symbol.icon
                            ? "bg-indigo-50 border-indigo-600 text-indigo-600 font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <span className="material-symbols-outlined text-xl">{symbol.icon}</span>
                        <span className="text-[10px] uppercase tracking-wide font-semibold">{symbol.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Greeting Message */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-400 mb-1.5">First Proactive Greeting Message</label>
                  <textarea
                    rows={3}
                    placeholder="Type the message your bot proactively says when opening the page..."
                    value={greetingMessage}
                    onChange={(e) => setGreetingMessage(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-semibold outline-none resize-none leading-relaxed text-slate-800 transition-all"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic font-semibold">Make it welcoming and highlight the specific property location scope.</p>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-5 text-xs"
              >
                <div>
                  <h4 className="text-sm font-black text-slate-800 mb-1">Step 2: Prompt Directives (Training Instructions)</h4>
                  <p className="text-slate-500 font-medium">Describe how this AI agent should handle client questions and list requirements.</p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-400 mb-2">System AI Directives & Context</label>
                  <textarea
                    rows={8}
                    value={systemInstruction}
                    onChange={(e) => setSystemInstruction(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg font-mono text-xs outline-none leading-relaxed resize-none text-slate-800 transition-all"
                    placeholder="You are South Delhi Concierge, a luxury properties specialist. Be respectful and guide inquiries toward booking a call with real human property managers."
                  />
                  <div className="mt-2 p-3.5 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-800 font-semibold leading-relaxed">
                    💡 <strong>Protip:</strong> Give clear guidelines on pricing thresholds, property regions, and polite follow-up patterns. These instructions are injected directly into the Gemini model.
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-5 text-xs"
              >
                <div>
                  <h4 className="text-sm font-black text-slate-800 mb-1">Step 3: Lead Collection & Triggers</h4>
                  <p className="text-slate-500 font-medium">Decide when and how the lead collection form overlays inside the chat.</p>
                </div>

                {/* Timing selector */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-400 mb-2.5">Lead Capture Overlay Timing</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(["Immediately", "Mid-conversation", "Upon Exit"] as CaptureTiming[]).map((timeOpt) => (
                      <button
                        type="button"
                        key={timeOpt}
                        onClick={() => setTiming(timeOpt)}
                        className={`py-3 px-2 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                          timing === timeOpt
                            ? "bg-indigo-50 border-indigo-600 text-indigo-600 font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">
                          {timeOpt === "Immediately" ? "flash_on" : timeOpt === "Mid-conversation" ? "chat" : "exit_to_app"}
                        </span>
                        <span className="text-[10px] font-bold tracking-wide mt-1">{timeOpt}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fields toggle checklist */}
                <div className="p-5 bg-slate-50 border border-slate-100 rounded-lg">
                  <label className="block text-[10px] uppercase font-black text-slate-400 mb-3.5">
                    Lead Generation Fields to Collect
                  </label>

                  <div className="space-y-3 font-semibold text-xs text-slate-700">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leadFields.name}
                        disabled
                        className="rounded accent-indigo-600 w-4 h-4 cursor-not-allowed opacity-60"
                      />
                      <span>Customer Full Name (Required)</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leadFields.email}
                        onChange={(e) => setLeadFields((f) => ({ ...f, email: e.target.checked }))}
                        className="rounded accent-indigo-600 w-4 h-4 cursor-pointer"
                      />
                      <span>Email address (Recommended)</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leadFields.phone}
                        onChange={(e) => setLeadFields((f) => ({ ...f, phone: e.target.checked }))}
                        className="rounded accent-indigo-600 w-4 h-4 cursor-pointer"
                      />
                      <span>Phone number (Highly Recommended)</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leadFields.budget}
                        onChange={(e) => setLeadFields((f) => ({ ...f, budget: e.target.checked }))}
                        className="rounded accent-indigo-600 w-4 h-4 cursor-pointer"
                      />
                      <span>Target Budget Range (Real Estate Focused)</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leadFields.location}
                        onChange={(e) => setLeadFields((f) => ({ ...f, location: e.target.checked }))}
                        className="rounded accent-indigo-600 w-4 h-4 cursor-pointer"
                      />
                      <span>Property Location interest</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-5 text-xs text-slate-500"
              >
                <div>
                  <h4 className="text-sm font-black text-slate-800 mb-1">Step 4: Summary & Instant Deploy</h4>
                  <p className="text-slate-400 font-medium">Confirm configuration values and sync live to website assets.</p>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg space-y-3 font-semibold text-slate-600">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span>Chatbot Name:</span>
                    <strong className="text-indigo-600">{botName || "Custom Real Estate Bot"}</strong>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span>Launcher Host URL:</span>
                    <strong className="text-slate-800 font-mono">{botUrl || "skyline-realty.in/concierge"}</strong>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span>Active Symbol:</span>
                    <div className="flex items-center gap-1 text-slate-800">
                      <span className="material-symbols-outlined text-sm">{botIcon}</span>
                      <span className="capitalize">{botIcon}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span>Overlay trigger:</span>
                    <strong className="text-slate-800">{timing}</strong>
                  </div>
                  <div className="flex justify-between items-start">
                    <span>System Prompts Size:</span>
                    <strong className="text-slate-800 font-mono text-right truncate max-w-[200px]" title={systemInstruction}>
                      {systemInstruction.length} characters
                    </strong>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg flex gap-3">
                  <span className="material-symbols-outlined font-black">verified</span>
                  <div>
                    <p className="font-extrabold text-slate-800">Ready for Instant RAG Embedding</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-semibold">
                      Once deployed, this bot will leverage your complete Knowledge Base vectors to answer questions instantly.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Form controls button footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-6">
          <button
            onClick={step === 1 ? onCancel : handlePrevStep}
            className="px-6 py-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 font-bold transition-all text-slate-600 cursor-pointer"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          <button
            onClick={handleNextStep}
            disabled={step === 1 && (!botName || !botUrl)}
            className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{step === 4 ? "Deploy Agent" : "Continue"}</span>
            <span className="material-symbols-outlined text-sm font-bold">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* RIGHT SIDE: Chatbot preview sandbox (Interactive!) */}
      <div className="lg:col-span-5 glass-card rounded-xl p-6 flex flex-col justify-between h-full bg-gradient-to-b from-slate-50 to-indigo-50/20 border border-slate-100 relative overflow-hidden">
        {/* Sandbox Indicator */}
        <div className="absolute top-0 right-0 py-1.5 px-3 bg-indigo-50 border-b border-l border-indigo-100 rounded-bl-lg text-[9px] font-black tracking-widest text-indigo-600 uppercase">
          Agent Sandbox
        </div>

        <div className="flex flex-col flex-1 min-h-0">
          {/* Sandbox Header info */}
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <span className="material-symbols-outlined text-base">
                {botIcon || "smart_toy"}
              </span>
            </div>
            <div className="overflow-hidden">
              <h4 className="font-extrabold text-sm text-slate-800 truncate">
                {botName || "RigaChat AI Agent"}
              </h4>
              <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide">
                Preview Sandbox
              </p>
            </div>
          </div>

          {/* Sandbox Chat Feed */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1 mb-4 flex flex-col">
            {chatMessages.map((msg, idx) => {
              const isBot = msg.sender === "bot";
              return (
                <div key={idx} className={`flex flex-col ${isBot ? "items-start" : "items-end"}`}>
                  <div
                    className={`p-3 rounded-lg max-w-[85%] text-xs leading-relaxed font-semibold border shadow-sm ${
                      isBot
                        ? "bg-slate-50 border-slate-100 text-slate-800"
                        : "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    }`}
                  >
                    <p>{msg.text}</p>
                  </div>
                </div>
              );
            })}

            {/* Typing Loader animation */}
            {isBotTyping && (
              <div className="flex flex-col items-start">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg shadow-sm text-xs flex items-center gap-1 text-slate-400">
                  <span className="font-semibold italic">Thinking</span>
                  <div className="flex gap-0.5 mt-0.5">
                    <span className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatBottomRef}></div>
          </div>
        </div>

        {/* Sandbox Chat Input form */}
        <form onSubmit={handleSandboxSendMessage} className="relative mt-auto">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={isBotTyping}
            placeholder="Type a query to test your prompt directives..."
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-xs font-semibold placeholder-slate-400 text-slate-800 transition-all outline-none"
          />
          <button
            type="submit"
            disabled={!userInput.trim() || isBotTyping}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-base">send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
