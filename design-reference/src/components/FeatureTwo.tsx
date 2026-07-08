import React, { useState } from "react";
import { motion } from "motion/react";
import { Inbox, LineChart, CheckSquare, MessageSquare } from "lucide-react";

export default function FeatureTwo() {
  const [activeCard, setActiveCard] = useState<"inbox" | "insights">("inbox");

  return (
    <section className="py-24 px-6 lg:px-8 bg-surface-container-lowest" id="support">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Left Column: Graphic Illustration */}
        <div className="flex justify-center relative">
          {/* Decorative circular element */}
          <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />

          {/* Floating Widget Mock */}
          <div className="absolute bottom-6 left-6 bg-surface-container-lowest p-4 rounded-xl shadow-xl border border-outline-variant/30 max-w-xs hidden sm:block z-10">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-1.5 bg-primary/10 text-primary rounded-lg">
                <LineChart className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-on-surface">RigaChat Insights</span>
            </div>
            <p className="text-[11px] text-on-surface-variant font-medium leading-normal">
              {activeCard === "inbox"
                ? "Unified ticket queues: Facebook Messenger, WhatsApp, Email and Web Chat resolved instantly!"
                : "Customer conversion is up 30% after implementing automated instant answers."}
            </p>
          </div>

          {/* Wrapper for hover Lift */}
          <motion.div
            whileHover={{ y: -8 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="rounded-3xl shadow-2xl overflow-hidden max-w-lg border border-outline-variant/20 relative"
            id="features-illustration-two"
          >
            <img
              src="https://lh3.googleusercontent.com/aida/AP1WRLu8KgdsGSzybP33OK1aY6CyS3L9yBDpJFAk7mNwIDH2UQqiOulflrTJSXjb1Qqh9z7sBvztPn-SojhoFBWJ9O59_tV6HGvPVQRY4OERykF_mpvGTQL-5VvmA8rXtsY2nxLLvu3viNZmoKt5FdaizXLqSNMHTUugQq9bK_cxEZB3iiyuBmsUAnp0lp1RbroZzChRqUh5AzIcP0kUM6RcLBYg_4thEt51BRhGVPpk7AM6NemUsB3oINVv4Ok"
              alt="High-fidelity preview of support representative assisting customer, and a coffee brewer device indicating clean service and commerce setups."
              className="w-full h-auto object-cover select-none pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </div>

        {/* Right Column: Content Column */}
        <div className="flex flex-col gap-6">
          {/* Section tag */}
          <div className="inline-flex items-center gap-3 text-primary font-bold text-xs uppercase tracking-widest">
            <span className="w-10 h-[2px] bg-primary" />
            Premium Support
          </div>

          {/* Headline */}
          <h2 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight">
            Make premium support your new standard.
          </h2>

          {/* Description */}
          <p className="text-lg text-on-surface-variant leading-relaxed">
            Streamline communication with instant access to customer info. Deliver top-notch service with AI-powered insights that anticipate user needs.
          </p>

          {/* Feature Grid Choices */}
          <div className="grid grid-cols-2 gap-4 mt-2">
            <button
              onClick={() => setActiveCard("inbox")}
              className={`flex flex-col gap-3 p-5 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                activeCard === "inbox"
                  ? "bg-white border-primary shadow-md scale-[1.02]"
                  : "bg-surface-container-low border-transparent hover:bg-surface-container"
              }`}
              id="feature-card-inbox"
            >
              <Inbox className={`w-8 h-8 ${activeCard === "inbox" ? "text-primary" : "text-outline"}`} />
              <div>
                <p className="font-bold text-on-surface">Unified Inbox</p>
                <p className="text-xs text-on-surface-variant mt-1">All channels integrated in a single layout.</p>
              </div>
            </button>

            <button
              onClick={() => setActiveCard("insights")}
              className={`flex flex-col gap-3 p-5 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                activeCard === "insights"
                  ? "bg-white border-primary shadow-md scale-[1.02]"
                  : "bg-surface-container-low border-transparent hover:bg-surface-container"
              }`}
              id="feature-card-insights"
            >
              <LineChart className={`w-8 h-8 ${activeCard === "insights" ? "text-primary" : "text-outline"}`} />
              <div>
                <p className="font-bold text-on-surface">Smart Insights</p>
                <p className="text-xs text-on-surface-variant mt-1">Data-driven automated decisions.</p>
              </div>
            </button>
          </div>

          {/* Conversion Improvement Card */}
          <div className="bg-surface-container-high/50 p-6 rounded-2xl border-l-4 border-primary mt-4 shadow-sm relative overflow-hidden">
            <div className="absolute right-4 top-4 opacity-5 text-primary">
              <CheckSquare className="w-24 h-24" />
            </div>
            <motion.p
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              key={activeCard}
              className="text-4xl font-black text-primary leading-none"
            >
              {activeCard === "inbox" ? "30%" : "45%"}
            </motion.p>
            <p className="text-[11px] font-bold text-on-surface-variant mt-2 uppercase tracking-wider">
              {activeCard === "inbox" ? "Increase in Customer Conversion" : "Faster Support Response Resolution"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
