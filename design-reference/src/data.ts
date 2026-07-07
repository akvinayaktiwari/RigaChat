import { Chatbot, Lead, KnowledgeSource, TrainingLog, UserProfile } from "./types";

export const DEFAULT_USER: UserProfile = {
  name: "Evan Parker",
  email: "evan.parker@rigachat.com",
  plan: "Pro Plan",
  avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDZpuYf73X02q_D3i2f4IgWSv0gHKCMIVf8hBqRn2nYHc_V3V-gLpRCZ9Aect3E_nmrV_D_wl6a7NmnK1K4HvaVleE9BrUfbOeecParqojya2xLe-mI0Jv1p3x0KK26iJ-ssmvASeJGvf7Kbgl_Uz0smnUy8c-xWi5LeR6XjqDhUfUz3xETRIIu0S6gdAJmXorN3lWyIUtoxiH-cIgg9Grbe-dn20ZyKORb47p56D31m5XAHEPppcS51g"
};

export const DEFAULT_CHATBOTS: Chatbot[] = [
  {
    id: "bot-1",
    name: "South Delhi Concierge",
    status: "ACTIVE",
    url: "skyline-realty.in/concierge",
    leadsToday: 1284,
    satisfaction: 94,
    greetingMessage: "Namaste! Welcome to Skyline South Delhi Concierge. How can I help you find your dream luxury property or commercial space in Saket, Vasant Kunj, or GK today?",
    timing: "Immediately",
    systemInstruction: "You are South Delhi Concierge, a high-end luxury real estate assistant. Guide buyers through ultra-luxury apartments, villas, and penthouses in premium areas like Greater Kailash (GK), Vasant Vihar, Saket, and Hauz Khas. Keep your tone highly professional, courteous, and elite. Ask about BHK preferences and budget ranges (above 2 Crores).",
    icon: "apartment",
    leadsCount: 820
  },
  {
    id: "bot-2",
    name: "Pune Rental Bot",
    status: "SYNCING",
    url: "pune-stays.com/rentals",
    leadsToday: 0,
    satisfaction: 0,
    greetingMessage: "Hello! Looking for budget-friendly rental apartments or shared co-living spaces in Hinjewadi, Kothrud, or Koregaon Park? Let me know!",
    timing: "Mid-conversation",
    systemInstruction: "You are Pune Rental Bot, a friendly and energetic assistant specializing in rental flats, PG hostels, and co-living arrangements in Pune (Hinjewadi IT park, Viman Nagar, Kothrud, Koregaon Park). Focus on rental pricing, deposit norms, and immediate move-in timelines. Budget range should be focused on 15,000 to 45,000 INR per month.",
    icon: "key",
    leadsCount: 124
  },
  {
    id: "bot-3",
    name: "Mumbai Hub Bot",
    status: "ACTIVE",
    url: "mumbai-commercial.biz/bot",
    leadsToday: 432,
    satisfaction: 91,
    greetingMessage: "Namaste! Welcome to Mumbai Commercial Hub. Looking for premium office spaces, retail showrooms, or co-working desks in BKC, Lower Parel, or Worli?",
    timing: "Upon Exit",
    systemInstruction: "You are Mumbai Hub Bot, a sharp and professional commercial leasing expert in Mumbai. Help businesses find commercial offices, retail shops, warehouses, and flexible desks in Bandra Kurla Complex (BKC), Worli, Nariman Point, and Lower Parel. Highlight proximity to metro links and major highways. Negotiate lease periods professionally.",
    icon: "store",
    leadsCount: 538
  }
];

export const DEFAULT_LEADS: Lead[] = [
  {
    id: "lead-1",
    name: "Arjun Mehta",
    email: "arjun.m@gmail.com",
    phone: "+91 98765 43210",
    botId: "bot-1",
    botName: "South Delhi Concierge",
    propertyInterest: "3 BHK Mumbai",
    budget: "₹1.8 Crores",
    status: "HOT LEAD",
    region: "Mumbai",
    timestamp: "2 hours ago"
  },
  {
    id: "lead-2",
    name: "Priya Sharma",
    email: "priya.sha@outlook.com",
    phone: "+91 99001 12233",
    botId: "bot-3",
    botName: "Mumbai Hub Bot",
    propertyInterest: "Villa in Goa",
    budget: "₹5.2 Crores",
    status: "HOT LEAD",
    region: "Goa",
    timestamp: "5 hours ago"
  },
  {
    id: "lead-3",
    name: "Rajesh Khanna",
    email: "rajesh_k@yahoo.co.in",
    phone: "+91 88776 65544",
    botId: "bot-1",
    botName: "South Delhi Concierge",
    propertyInterest: "Penthouse Gurgaon",
    budget: "₹2.4 Crores",
    status: "HOT LEAD",
    region: "Gurgaon",
    timestamp: "1 day ago"
  },
  {
    id: "lead-4",
    name: "Ananya Desai",
    email: "a.desai@tata.com",
    phone: "+91 77665 44332",
    botId: "bot-2",
    botName: "Pune Rental Bot",
    propertyInterest: "Studio Bangalore",
    budget: "₹1.2 Crores",
    status: "HOT LEAD",
    region: "Bangalore",
    timestamp: "2 days ago"
  },
  {
    id: "lead-5",
    name: "Rohan Verma",
    email: "rohan.verma@gmail.com",
    phone: "+91 98123 45678",
    botId: "bot-1",
    botName: "South Delhi Concierge",
    propertyInterest: "3BHK Flat, Whitefield",
    budget: "₹1.8 Crores",
    status: "HOT LEAD",
    region: "Bangalore",
    timestamp: "3 hours ago"
  },
  {
    id: "lead-6",
    name: "Ananya Kapoor",
    email: "ananya.kapoor@gmail.com",
    phone: "+91 99001 88776",
    botId: "bot-3",
    botName: "Mumbai Hub Bot",
    propertyInterest: "Luxury Villa, Gurgaon",
    budget: "₹5.2 Crores",
    status: "NEGOTIATION",
    region: "Gurgaon",
    timestamp: "1 day ago"
  },
  {
    id: "lead-7",
    name: "Suresh Nair",
    email: "suresh.nair@rediffmail.com",
    phone: "+91 88776 11223",
    botId: "bot-1",
    botName: "South Delhi Concierge",
    propertyInterest: "Studio Apt, Bandra",
    budget: "₹85 Lakhs",
    status: "INTERESTED",
    region: "Mumbai",
    timestamp: "2 days ago"
  },
  {
    id: "lead-8",
    name: "Deepak Patel",
    email: "deepak_patel@tcs.com",
    phone: "+91 77665 99887",
    botId: "bot-2",
    botName: "Pune Rental Bot",
    propertyInterest: "Commercial Office",
    budget: "₹2.4 Crores",
    status: "QUALIFIED",
    region: "Navi Mumbai",
    timestamp: "3 days ago"
  },
  {
    id: "lead-9",
    name: "Priya Mishra",
    email: "priya.mishra@wipro.com",
    phone: "+91 91234 11223",
    botId: "bot-1",
    botName: "South Delhi Concierge",
    propertyInterest: "2BHK, Gachibowli",
    budget: "₹1.2 Crores",
    status: "HOT LEAD",
    region: "Hyderabad",
    timestamp: "4 days ago"
  }
];

export const DEFAULT_KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    id: "ks-1",
    name: "Property Listings PDF",
    type: "PDF",
    size: "1.2MB",
    percentageAnalyzed: 85,
    status: "Synced",
    category: "Property Details",
    description: "Contains Worli projects, rooftop swimming pool details, floorplans and 24/7 premium security measures."
  },
  {
    id: "ks-2",
    name: "riga-properties.com",
    type: "URL",
    syncFrequency: "Daily",
    percentageAnalyzed: 100,
    status: "Synced",
    category: "Property Details",
    description: "Brochure and website content covering eco-friendly garden-facing premium properties in Bangalore."
  },
  {
    id: "ks-3",
    name: "RERA Maharashtra Compliance FAQ",
    type: "PDF",
    size: "820KB",
    percentageAnalyzed: 100,
    status: "Synced",
    category: "Legal & Tax",
    description: "Detailed booklet on builder delivery timelines, compensation rates, and buyer security rules under RERA."
  },
  {
    id: "ks-4",
    name: "GST Rates for Residential Buildings",
    type: "PDF",
    size: "350KB",
    percentageAnalyzed: 100,
    status: "Synced",
    category: "Legal & Tax",
    description: "Explanation of the 1% GST rate for affordable units vs 5% standard GST rate on properties under-construction."
  },
  {
    id: "ks-5",
    name: "Home Loan Partner Banks List",
    type: "CSV",
    size: "linked_docs_v2.csv",
    percentageAnalyzed: 100,
    status: "Synced",
    category: "FAQs & Pricing",
    description: "Direct reference table linking pre-approved banks like ICICI, HDFC, SBI to respective project codes."
  },
  {
    id: "ks-6",
    name: "Standard Maintenance Calculator",
    type: "CSV",
    size: "120KB",
    percentageAnalyzed: 100,
    status: "Synced",
    category: "FAQs & Pricing",
    description: "Excel sheets with per sq ft maintenance rules for housing complexes across Navi Mumbai and Thane."
  }
];

export const DEFAULT_TRAINING_LOGS: TrainingLog[] = [
  {
    id: "log-1",
    title: "Knowledge Base Re-indexed",
    description: "Model updated with 4 new legal documents regarding Mumbai Stamp Duty hikes. RAG retrieval performance improved by 12%.",
    timestamp: "Oct 24, 2023 • 14:20 PM",
    type: "success"
  },
  {
    id: "log-2",
    title: "Scheduled Auto-Sync Completed",
    description: "Fetched latest property prices from the internal inventory API. 124 entries modified.",
    timestamp: "Oct 23, 2023 • 09:00 AM",
    type: "info"
  }
];
