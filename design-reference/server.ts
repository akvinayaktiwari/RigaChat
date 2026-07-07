import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Shared Gemini API Client initialized server-side
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  
  if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
    try {
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      console.log("Gemini API client successfully initialized.");
    } catch (e) {
      console.error("Error initializing Gemini API:", e);
    }
  } else {
    console.log("No valid GEMINI_API_KEY environment variable found. Running in demo fallback mode.");
  }

  // API endpoint for chatbot simulation
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, systemInstruction } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (!ai) {
        // Safe interactive mockup fallback if no API key is set
        const fallbackAnswers = [
          "That sounds like a wonderful location! In that area, we have premium properties ranging from 1.5 Crores to 5 Crores. Are you interested in high-rise apartments or gated villas?",
          "Yes, we can definitely coordinate a virtual walkthrough or a site visit for you this weekend. What is your contact number so our relationship manager can schedule it?",
          "RERA guidelines for this project ensure delivery by mid-2027 with full amenities. Would you like me to email you the complete brochure and pricing table?",
          "Our partner banks (HDFC, SBI, ICICI) are offering pre-approved loans with competitive interest rates for this listing. Let me know if you want loan assistance details.",
          "I can help with that. Could you please clarify if you are looking for ready-to-move-in units or under-construction projects?"
        ];
        const answer = fallbackAnswers[Math.floor(Math.random() * fallbackAnswers.length)];
        
        // Return response with a slight delay to simulate thinking
        await new Promise((resolve) => setTimeout(resolve, 800));
        return res.json({ text: `[AI Demo] ${answer}` });
      }

      // Convert history list to Gemini's expected multi-turn format
      const contents = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          contents.push({
            role: msg.sender === "user" ? "user" : "model",
            parts: [{ text: msg.text }]
          });
        }
      }

      // Append latest message
      contents.push({
        role: "user",
        parts: [{ text: message }]
      });

      // Query the model
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction: systemInstruction || "You are RigaChat Assistant, an expert Real Estate AI bot guiding users on property listings, pricing, and amenities.",
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API error in /api/chat:", error);
      res.status(500).json({ 
        error: "Failed to generate AI response", 
        details: error.message || "Unknown error" 
      });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Static production assets configured.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
