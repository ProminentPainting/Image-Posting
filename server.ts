import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as cron from "node-cron";
import { GoogleGenAI } from "@google/genai";
import { ARTISTS, MOVEMENTS, PALETTES, SUBJECTS } from "./artData";

const app = express();
const PORT = 3000;
const CONFIG_FILE = path.join(process.cwd(), "agent-config.json");
const HISTORY_FILE = path.join(process.cwd(), "agent-history.json");

app.use(express.json({ limit: "50mb" }));

// Defaults
const DEFAULT_CONFIG = {
  scheduleTime: "09:00", // 9 AM everyday
  promptTemplate:
    "A {subject}, in the style of {movement} by {artist}, using a {palette} color palette.",
  webhookUrl: "https://prominentpainting.com/wp-json/wp/v2/media",
  wpUsername: "howardfarmer",
  webhookToken: "6cVL Anvv cINh 6671 KS2p GX52",
  isActive: false,
};

// Utils for storage
function readJSON(file: string, defaultVal: any) {
  let data = defaultVal;
  if (fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      // ignore
    }
  }
  if (Array.isArray(defaultVal)) {
    return Array.isArray(data) ? data : defaultVal;
  }
  // Migrate old config values dynamically
  if (data.wpUsername === "admin") data.wpUsername = "howardfarmer";
  if (data.webhookUrl && data.webhookUrl.endsWith("/posts"))
    data.webhookUrl = data.webhookUrl.replace("/posts", "/media");
  return { ...defaultVal, ...data };
}

function writeJSON(file: string, data: any) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function logToHistory(
  status: "success" | "error",
  details: string,
  imageUrl?: string,
) {
  const history = readJSON(HISTORY_FILE, []);
  history.unshift({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    status,
    details,
    imageUrl,
  });
  // Keep only last 50
  writeJSON(HISTORY_FILE, history.slice(0, 50));
}

let activeTask: cron.ScheduledTask | null = null;

// Core Agent Logic
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function runAutoPoster(isManual = false) {
  console.log(`[Agent] Starting run (Manual: ${isManual})...`);
  const config = readJSON(CONFIG_FILE, DEFAULT_CONFIG);

  // Migration fallback
  if (config.prompt && !config.promptTemplate) {
    config.promptTemplate = config.prompt;
  }

  if (!config.webhookUrl) {
    logToHistory("error", "No webhook URL configured. Aborting task.");
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logToHistory("error", "GEMINI_API_KEY environment variable is missing.");
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const subject = randomElement(SUBJECTS);
    const artist = randomElement(ARTISTS);
    const movement = randomElement(MOVEMENTS);
    const palette = randomElement(PALETTES);

    const template = config.promptTemplate || DEFAULT_CONFIG.promptTemplate;
    const finalPrompt = template
      .replace(/{subject}/gi, subject)
      .replace(/{artist}/gi, artist)
      .replace(/{movement}/gi, movement)
      .replace(/{palette}/gi, palette);

    const seed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
    console.log(
      `[Agent] Generating image using Pollinations: "${pollinationsUrl}"`,
    );

    // We fetch a generated image freely using Pollinations since Gemini image models are out of quota
    const imageRes = await fetch(pollinationsUrl);
    if (!imageRes.ok) {
      throw new Error(
        `Pollinations API returned ${imageRes.status}: ${await imageRes.text()}`,
      );
    }
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    if (!base64Image || arrayBuffer.byteLength === 0) {
      logToHistory(
        "error",
        "Failed to extract image from generator API response",
      );
      return;
    }

    console.log(
      `[Agent] Image generated. Preparing to upload to media library...`,
    );

    let authHeader = "";
    const username = config.wpUsername || "howardfarmer";
    if (config.webhookToken) {
      authHeader = `Basic ${Buffer.from(`${username}:${config.webhookToken}`).toString("base64")}`;
    }

    let mediaEndpoint = config.webhookUrl;
    if (mediaEndpoint.endsWith("/posts")) {
      mediaEndpoint = mediaEndpoint.replace("/posts", "/media");
    }

    console.log(`[Agent] Attempting POST to: ${mediaEndpoint}`);
    const imageBuffer = Buffer.from(base64Image, "base64");
    const mediaRes = await fetch(mediaEndpoint, {
      method: "POST",
      headers: {
        "Content-Disposition": `attachment; filename="daily-art-${Date.now()}.jpg"`,
        "Content-Type": "image/jpeg",
        Authorization: authHeader,
      },
      body: imageBuffer,
    });

    if (!mediaRes.ok) {
      const text = await mediaRes.text();
      throw new Error(`Media upload failed: ${mediaRes.status} ${text}`);
    }

    const mediaData = await mediaRes.json();
    const mediaId = mediaData.id;
    const mediaUrl = mediaData.source_url;

    console.log(`[Agent] Generating title from description using Gemini...`);
    let generatedTitle = `${subject} by ${artist}`;
    try {
      const titleRes = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Compress this image description into a short, catchy title (max 5 words). Return ONLY the title text without quotes: ${finalPrompt}`,
      });
      if (titleRes.text) {
        generatedTitle = titleRes.text.trim();
      }
    } catch (titleErr) {
      console.log(
        `[Agent] Failed to generate title, using fallback.`,
        titleErr,
      );
    }

    // Update alt text to "Daily art"
    console.log(`[Agent] Updating attachment metadata for ID: ${mediaId}`);
    await fetch(`${mediaEndpoint}/${mediaId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        alt_text: `${finalPrompt} - Daily Art`,
        caption: finalPrompt,
        title: generatedTitle,
        description: finalPrompt,
      }),
    });

    logToHistory(
      "success",
      `Image added to Media Library successfully (ID: ${mediaId})`,
      mediaUrl || `data:image/jpeg;base64,${base64Image}`,
    );
    console.log("[Agent] Run completed successfully.");
  } catch (error: any) {
    console.error("[Agent Error]", error);
    logToHistory(
      "error",
      `Exception during execution: ${error.message || error}`,
    );
  }
}

// Scheduler Setup
function setupScheduler() {
  if (activeTask) {
    activeTask.stop();
    activeTask = null;
  }

  const config = readJSON(CONFIG_FILE, DEFAULT_CONFIG);
  if (config.isActive && config.scheduleTime) {
    try {
      let timeStr = config.scheduleTime.trim().toLowerCase();
      let isPM = timeStr.includes("pm") || timeStr.includes("p");
      let isAM = timeStr.includes("am") || timeStr.includes("a");

      timeStr = timeStr.replace(/[^0-9:]/g, "");
      let parts = timeStr.split(":");
      let hh = parseInt(parts[0] || "0", 10);
      let mm = parseInt(parts[1] || "0", 10);

      if (isNaN(hh)) hh = 0;
      if (isNaN(mm)) mm = 0;

      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;

      hh = Math.max(0, Math.min(23, hh));
      mm = Math.max(0, Math.min(59, mm));

      const cronExpression = `${mm} ${hh} * * *`;
      console.log(
        `[Scheduler] Setting up cron job with expression: ${cronExpression}`,
      );
      activeTask = cron.schedule(cronExpression, () => {
        runAutoPoster(false);
      });
    } catch (e: any) {
      console.error("[Scheduler] Error setting up cron:", e.message);
    }
  } else {
    console.log("[Scheduler] Automated task is currently disabled in config.");
  }
}

// --- API Routes ---

app.get("/api/config", (req, res) => {
  res.json(readJSON(CONFIG_FILE, DEFAULT_CONFIG));
});

app.post("/api/config", (req, res) => {
  try {
    const currentConfig = readJSON(CONFIG_FILE, DEFAULT_CONFIG);
    const newConfig = { ...currentConfig, ...req.body };
    writeJSON(CONFIG_FILE, newConfig);
    setupScheduler();
    res.json({ success: true, config: newConfig });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to save configuration" });
  }
});

app.get("/api/history", (req, res) => {
  res.json(readJSON(HISTORY_FILE, []));
});

app.all("/api/trigger", async (req, res) => {
  // Fire and forget for GET requests (cron jobs), wait for POST requests (UI)
  try {
    if (req.method === "GET") {
      runAutoPoster(true).catch(console.error);
      return res.json({ success: true, message: "Trigger started." });
    }
    
    await runAutoPoster(true);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/preview", async (req, res) => {
  try {
    const { promptTemplate } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const subject = randomElement(SUBJECTS);
    const artist = randomElement(ARTISTS);
    const movement = randomElement(MOVEMENTS);
    const palette = randomElement(PALETTES);

    const template = promptTemplate || DEFAULT_CONFIG.promptTemplate;
    const finalPrompt = template
      .replace(/{subject}/gi, subject)
      .replace(/{artist}/gi, artist)
      .replace(/{movement}/gi, movement)
      .replace(/{palette}/gi, palette);

    const seed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
    console.log(
      `[Preview] Generating preview prompt using free model: "${pollinationsUrl}"`,
    );

    // We fetch an image freely using Pollinations
    const imageRes = await fetch(pollinationsUrl);
    if (!imageRes.ok) {
      throw new Error(
        `Pollinations API returned ${imageRes.status}: ${await imageRes.text()}`,
      );
    }
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    if (!base64Image || arrayBuffer.byteLength === 0) {
      throw new Error("Failed to extract image from generator API response");
    }

    res.json({
      success: true,
      image: `data:image/jpeg;base64,${base64Image}`,
      prompt: finalPrompt,
    });
  } catch (error: any) {
    console.error("[Preview Error]", error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

// Setup Initial Scheduler on boot
setupScheduler();

async function startServer() {
  // Vite middleware for development
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
