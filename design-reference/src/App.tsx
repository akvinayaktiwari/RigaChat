import React, { useState } from "react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import SocialProof from "./components/SocialProof";
import FeatureOne from "./components/FeatureOne";
import FeatureTwo from "./components/FeatureTwo";
import Testimonials from "./components/Testimonials";
import FinalCTA from "./components/FinalCTA";
import Footer from "./components/Footer";
import ChatWidget from "./components/ChatWidget";
import TrialModal from "./components/TrialModal";
import DemoModal from "./components/DemoModal";

export default function App() {
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col selection:bg-primary/20" id="app-root">
      {/* Top navigation */}
      <Navbar
        onOpenTrial={() => setIsTrialOpen(true)}
        onOpenDemo={() => setIsDemoOpen(true)}
      />

      {/* Main body layouts */}
      <main className="flex-grow">
        {/* Hero Section */}
        <Hero
          onOpenTrial={() => setIsTrialOpen(true)}
          onOpenDemo={() => setIsDemoOpen(true)}
        />

        {/* Brand partners Social Proof */}
        <SocialProof />

        {/* Feature #1: Sales & Engagement */}
        <FeatureOne />

        {/* Feature #2: Premium Support */}
        <FeatureTwo />

        {/* Customer Testimonials reviews bento */}
        <Testimonials />

        {/* Final CTA callout banner */}
        <FinalCTA onOpenTrial={() => setIsTrialOpen(true)} />
      </main>

      {/* Footer bar */}
      <Footer />

      {/* Embedded Live Chatbot trigger widget (RigaBot) */}
      <ChatWidget />

      {/* Onboarding free trial signup interactive modal */}
      <TrialModal isOpen={isTrialOpen} onClose={() => setIsTrialOpen(false)} />

      {/* Live active chat interactive demo video simulation modal */}
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  );
}
