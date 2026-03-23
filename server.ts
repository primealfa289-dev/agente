import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

// Initialize AI Agent
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  let qrCodeData: string | null = null;
  let connectionStatus: "connecting" | "open" | "close" | "qr" = "connecting";
  let sock: any = null;

  // We'll store the automated contacts in a local variable for fast lookup, 
  // but they should be synced from Firestore.
  let automatedContacts: string[] = [];

  async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: "silent" }),
    });

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCodeData = await qrcode.toDataURL(qr);
        connectionStatus = "qr";
      }

      if (connection === "close") {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log("connection closed due to ", lastDisconnect?.error, ", reconnecting ", shouldReconnect);
        connectionStatus = "close";
        if (shouldReconnect) {
          connectToWhatsApp();
        }
      } else if (connection === "open") {
        console.log("opened connection");
        connectionStatus = "open";
        qrCodeData = null;
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m: any) => {
      if (m.type !== "notify") return;

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const sender = jidNormalizedUser(msg.key.remoteJid!);
        const phoneNumber = sender.split("@")[0];
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) continue;

        // Check if contact is automated
        if (automatedContacts.includes(phoneNumber)) {
          console.log(`Responding to ${phoneNumber}: ${text}`);
          
          try {
            const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: `Você é um assistente de IA prestativo respondendo mensagens no WhatsApp. 
              Responda de forma natural e amigável.
              Mensagem do cliente: "${text}"`,
            });
            
            const responseText = response.text;

            if (responseText) {
              await sock.sendMessage(sender, { text: responseText });
            }
          } catch (error) {
            console.error("Error generating AI response:", error);
          }
        }
      }
    });
  }

  connectToWhatsApp();

  // API Routes
  app.get("/api/status", (req, res) => {
    res.json({ status: connectionStatus, qr: qrCodeData });
  });

  app.post("/api/contacts/sync", (req, res) => {
    const { contacts } = req.body;
    if (Array.isArray(contacts)) {
      automatedContacts = contacts.map(c => c.replace(/\D/g, ''));
      console.log("Synced contacts:", automatedContacts);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Invalid contacts format" });
    }
  });

  app.post("/api/logout", async (req, res) => {
    if (sock) {
      await sock.logout();
      // Clear auth folder
      if (fs.existsSync("auth_info_baileys")) {
        fs.rmSync("auth_info_baileys", { recursive: true, force: true });
      }
      connectToWhatsApp();
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "No active session" });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
