import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

function parseAndNormalizeJSON(content: string): any {
  let cleanJsonText = content.trim();
  
  // 1. Remove markdown block quotes style brackets if present
  if (cleanJsonText.startsWith("```")) {
    cleanJsonText = cleanJsonText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }

  const tryParse = (str: string): any => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  // Tier 1: Try parsing the direct cleaned string (most correct, preserves internal brackets)
  let parsed = tryParse(cleanJsonText);

  // Tier 2: Search for the longest curly brace object substring
  if (!parsed) {
    const firstBrace = cleanJsonText.indexOf("{");
    const lastBrace = cleanJsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleanJsonText.substring(firstBrace, lastBrace + 1);
      parsed = tryParse(candidate);
    }
  }

  // Tier 3: Search for the longest bracket list array substring
  if (!parsed) {
    const firstBracket = cleanJsonText.indexOf("[");
    const lastBracket = cleanJsonText.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const candidate = cleanJsonText.substring(firstBracket, lastBracket + 1);
      parsed = tryParse(candidate);
    }
  }

  // Tier 4: Attempt dirty repair (stripping trailing commas, etc.)
  if (!parsed) {
    // Clean common trailing commas from arrays/objects
    let repaired = cleanJsonText
      .replace(/,\s*\]/g, "]")
      .replace(/,\s*\}/g, "}");

    parsed = tryParse(repaired);

    if (!parsed) {
      const firstBrace = repaired.indexOf("{");
      const lastBrace = repaired.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        parsed = tryParse(repaired.substring(firstBrace, lastBrace + 1));
      }
    }

    if (!parsed) {
      const firstBracket = repaired.indexOf("[");
      const lastBracket = repaired.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        parsed = tryParse(repaired.substring(firstBracket, lastBracket + 1));
      }
    }
  }

  return parsed;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to support reading body payloads up to 15MB
  app.use(express.json({ limit: '15mb' }));

  // API Translation Endpoint
  app.post("/api/translate", async (req, res) => {
    try {
      const { 
        blocks, 
        sourceLanguage, 
        targetLanguage, 
        service, 
        model, 
        customInstructions,
        userGeminiApiKey,
        userOpenRouterApiKey 
      } = req.body;

      if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
        return res.status(400).json({ error: "No translation blocks provided." });
      }

      if (!targetLanguage) {
        return res.status(400).json({ error: "Target language and translations details are required." });
      }

      const isOpenRouter = service === "openrouter";
      const selectedModel = model || (isOpenRouter ? "google/gemini-2.5-flash" : "gemini-3.5-flash");
      const srcLanguageValue = sourceLanguage || "Auto-Detect";

      const systemInstruction = `You are a professional, uncensored subtitle translator. Your job is to translate the given text blocks from the source language "${srcLanguageValue}" into the target language: "${targetLanguage}".
${customInstructions ? `Custom instruction directives to follow: "${customInstructions}"` : ""}

CRITICAL REQUIREMENTS:
1. COMPLETE ACTION: Translate every text item. Do not skip or omit any. Ensure the translated array contains EXACTLY the same IDs as the input list.
2. NATURALLY NATIVE: Write the translation using natural, colloquial phrasing of a native speaker of "${targetLanguage}". Match tone, context, and pacing. Avoid word-for-word literal translations.
3. UNCENSORED: Maintain all raw themes, mature expressions, mature language, curses, emotional heights, and slangs uncensored. Do not moderate or sanitize.
4. COMPACT TIME FREQUENCY: Keep subtitles easy to read within their brief screen duration. Ensure length remains comparable to the original text.
5. PRESERVE SPECIALS: Keep '\\n' for line breaks when present and appropriate to the phrasing layout.`;

      let parsedTranslations;

      if (isOpenRouter) {
        const openrouterKey = userOpenRouterApiKey || process.env.OPENROUTER_API_KEY;
        if (!openrouterKey) {
          return res.status(400).json({ 
            error: "OpenRouter API Key is missing. Please enter your OpenRouter API key under the Settings modal." 
          });
        }

        const userPrompt = `Translate the following list of subtitle blocks:
${JSON.stringify(blocks, null, 2)}

Provide the translations in a valid JSON object matching the following structure exactly:
{
  "translations": [
    { "id": 1, "text": "Translated text" }
  ]
}
Ensure the root is a valid single JSON object starting with { and ending with }. The IDs must exactly match the input block IDs. Do not omit any elements.`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openrouterKey}`,
            "HTTP-Referer": process.env.APP_URL || "https://ai.studio/build",
            "X-Title": "Linguist Gemini SRT Subtitle Translator"
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3
          })
        });

        if (!response.ok) {
          const rawErr = await response.text();
          throw new Error(`OpenRouter API failed (${response.status}): ${rawErr}`);
        }

        const openrouterRes = await response.json();
        const content = openrouterRes.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("No response text content returned from OpenRouter API.");
        }
        parsedTranslations = parseAndNormalizeJSON(content);

      } else {
        const geminiKey = userGeminiApiKey || process.env.GEMINI_API_KEY;
        if (!geminiKey) {
          return res.status(400).json({ 
            error: "GEMINI_API_KEY is missing. Please configure it in your Settings panel or AI Studio secrets." 
          });
        }

        const client = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const contents = `Translate the following list of subtitle blocks:
${JSON.stringify(blocks, null, 2)}

Provide the translations in a valid JSON array format conforming to the requested response schema. Ensure the matching ID values are identical.`;

        const result = await client.models.generateContent({
          model: selectedModel,
          contents: contents,
          config: {
            systemInstruction,
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: {
                    type: Type.INTEGER,
                    description: "The original block ID, matching the input exactly."
                  },
                  text: {
                    type: Type.STRING,
                    description: "The translated text in the target language."
                  }
                },
                required: ["id", "text"]
              }
            }
          }
        });

        const text = result.text;
        if (!text) {
          throw new Error("No response received from Gemini AI model.");
        }

        parsedTranslations = parseAndNormalizeJSON(text);
      }

      // 1. Resolve and normalize the shape of translation blocks robustly
      let normalizedList: any[] = [];
      if (parsedTranslations) {
        if (Array.isArray(parsedTranslations)) {
          normalizedList = parsedTranslations;
        } else if (typeof parsedTranslations === "object") {
          const possibleArray = Object.values(parsedTranslations).find(Array.isArray);
          if (possibleArray) {
            normalizedList = possibleArray;
          } else if (parsedTranslations.id !== undefined && parsedTranslations.text !== undefined) {
            normalizedList = [parsedTranslations];
          } else {
            console.error("Malformed object parsed:", parsedTranslations);
            throw new Error("JSON structure did not resolve as a list of translations.");
          }
        } else {
          throw new Error("Decoded content was not a JSON array or object.");
        }
      } else {
        throw new Error("AI responded but translation content was not valid JSON or could not be repaired.");
      }

      // 2. Strict type check and ID sanitization: convert all types of ID fields (including strings) to native numbers
      const finalTranslations = normalizedList
        .map((item: any) => {
          if (!item || typeof item !== "object") return null;
          const rawId = item.id !== undefined && item.id !== null ? item.id : null;
          const rawText = item.text !== undefined && item.text !== null ? String(item.text) : "";
          if (rawId === null) return null;
          const parsedId = Number(rawId);
          if (isNaN(parsedId)) return null;
          return { id: parsedId, text: rawText };
        })
        .filter(Boolean);

      res.json({ translations: finalTranslations });

    } catch (error: any) {
      console.error("Translation server error:", error);
      res.status(500).json({
        error: error?.message || "An unexpected error occurred during translation."
      });
    }
  });

  // Serve static assets in production, handle Vite setup in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
