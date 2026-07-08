import React, { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, ShoppingBag, ArrowRight } from "lucide-react";

export default function FeatureOne() {
  const [activeItem, setActiveItem] = useState<"outreach" | "recommendation">("outreach");

  return (
    <section className="py-24 px-6 lg:px-8 bg-background scroll-mt-20" id="features">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Left Side: Content Column */}
        <div className="flex flex-col gap-6 order-2 lg:order-1">
          {/* Section Indicator */}
          <div className="inline-flex items-center gap-3 text-secondary font-bold text-xs uppercase tracking-widest">
            <span className="w-10 h-[2px] bg-secondary" />
            Sales &amp; Engagement
          </div>

          {/* Title */}
          <h2 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight">
            Engage with AI, sell with ease.
          </h2>

          {/* Description */}
          <p className="text-lg text-on-surface-variant leading-relaxed">
            Start conversations with pre-set messages, recommend products, and guide visitors to the ideal purchase without lifting a finger.
          </p>

          {/* Interactive Bullet Items */}
          <div className="flex flex-col gap-4 mt-2">
            <div
              onMouseEnter={() => setActiveItem("outreach")}
              onClick={() => setActiveItem("outreach")}
              className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                activeItem === "outreach"
                  ? "bg-secondary-container/10 border-secondary/30 shadow-sm"
                  : "bg-transparent border-transparent hover:bg-surface-container-low"
              }`}
              id="feature-item-outreach"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${activeItem === "outreach" ? "bg-secondary text-white" : "bg-surface-container text-on-surface-variant"}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-on-surface">Proactive Outreach</h4>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Trigger automated chatbot greetings based on specific user behaviors, visit duration, and intent signals.
                  </p>
                </div>
              </div>
            </div>

            <div
              onMouseEnter={() => setActiveItem("recommendation")}
              onClick={() => setActiveItem("recommendation")}
              className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                activeItem === "recommendation"
                  ? "bg-secondary-container/10 border-secondary/30 shadow-sm"
                  : "bg-transparent border-transparent hover:bg-surface-container-low"
              }`}
              id="feature-item-recommendation"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${activeItem === "recommendation" ? "bg-secondary text-white" : "bg-surface-container text-on-surface-variant"}`}>
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-on-surface">Product Recommendation</h4>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Delight buyers with intelligent AI suggestions tailored precisely to active browsed pages or shopping carts.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stat Box */}
          <div className="bg-surface-container-low/60 p-6 rounded-2xl border-l-4 border-secondary mt-4 shadow-sm relative overflow-hidden">
            <div className="absolute right-4 top-4 opacity-5 text-secondary">
              <ShoppingBag className="w-24 h-24" />
            </div>
            <motion.p
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              key={activeItem}
              className="text-4xl font-black text-secondary leading-none"
            >
              {activeItem === "outreach" ? "25%" : "38%"}
            </motion.p>
            <p className="text-[11px] font-bold text-on-surface-variant mt-2 uppercase tracking-wider">
              {activeItem === "outreach" ? "Increase in Average Order Value" : "Higher Lead Capturing Rate"}
            </p>
          </div>
        </div>

        {/* Right Side: Graphic Illustration */}
        <div className="order-1 lg:order-2 flex justify-center relative">
          {/* Absolute interactive labels overlaid */}
          <div className="absolute -top-4 -left-4 bg-surface-container-lowest p-3 rounded-xl shadow-lg border border-outline-variant/30 max-w-xs z-10 hidden sm:block">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[10px] font-bold uppercase text-outline">Targeted Outreach</p>
            </div>
            <p className="text-xs text-on-surface leading-tight font-medium">
              {activeItem === "outreach"
                ? "Hey! Need help finding the perfect style? 👋"
                : "Great choice! This pairs nicely with our linen blazer."}
            </p>
          </div>

          {/* Wrapper for hover lift */}
          <motion.div
            whileHover={{ y: -8 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="rounded-3xl shadow-2xl overflow-hidden max-w-lg border border-outline-variant/20 relative"
            id="features-illustration-one"
          >
            <img
              src="https://lh3.googleusercontent.com/aida/AP1WRLu5-Du1rkiENfdTiEgY-RzmGQjYLJA2h4OBhtci8LKRPSbnkxtrddOaegOF33gQJi8-KoEuht30SjruHePTvH-XGhfCYcqAz9yPnJikkNkL-_UGHIDzuU4wj4KVU9n4eE-rFwT4haUSwewQyBfn7MTGt3ATh5ZT40oJ0N7JdhhKr6GeGhN3Du4HUjDzsmD2Or1DHzjIqCWtzTA_iBeAM2rmpz7SKCjcD6R4RsAoRQbxBvjZXnSh5JKv_Q"
              alt="High-fidelity preview of RigaChat Sales and Proactive Outreach UI, showing an active agent chat with live product card previews."
              className="w-full h-auto object-cover select-none pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
