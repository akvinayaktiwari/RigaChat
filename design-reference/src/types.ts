export type BotStatus = "ACTIVE" | "SYNCING";
export type LeadStatus = "HOT LEAD" | "INTERESTED" | "NEGOTIATION" | "QUALIFIED";
export type CaptureTiming = "Immediately" | "Mid-conversation" | "Upon Exit";

export interface Chatbot {
  id: string;
  name: string;
  status: BotStatus;
  url: string;
  leadsToday: number;
  satisfaction: number;
  greetingMessage: string;
  timing: CaptureTiming;
  systemInstruction: string;
  icon: string; // Material symbols name
  avatar?: string;
  leadsCount: number;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  botId: string;
  botName: string;
  propertyInterest: string;
  budget: string;
  status: LeadStatus;
  region: string;
  timestamp: string;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  type: "PDF" | "URL" | "CSV";
  syncFrequency?: string;
  size?: string;
  percentageAnalyzed: number;
  status: "Synced" | "Analyzing";
  category: "Property Details" | "Legal & Tax" | "FAQs & Pricing";
  description?: string;
}

export interface TrainingLog {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: "success" | "info";
}

export interface UserProfile {
  name: string;
  email: string;
  plan: string;
  avatar: string;
}

export interface ChatMessage {
  sender: "user" | "bot";
  text: string;
}
