const express = require('express');
const path = require('path');
try { require('dotenv').config(); } catch(e) {}
const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════
//   הגדרות
// ═══════════════════════════════════════════════════════════════
const PASSWORD = process.env.PASSWORD || "207503426";

const API_KEYS = process.env.API_KEYS
  ? process.env.API_KEYS.split(",")
  : [];

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemma-4-31b"
];

const SYSTEM_PROMPT = `אתה "מענה יהודי" — מערכת בינה מלאכותית מתקדמת לשירות תלמידי ישיבות, אברכי כוללים, ראשי ישיבות ורמים.
תחומי עיסוקך: כתיבה תורנית, מציאת מקורות, עזרה בקוד, מענה לשאלות כלליות.
כללים: כתוב בעברית, בשפת עולם הישיבות, מדויק ומעמיק. אל תוסיף סיכום. אסור טבלאות אלא אם ביקשו במפורש.`;

// ═══════════════════════════════════════════════════════════════
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// בדיקת סיסמה middleware
function checkAuth(req, res, next) {
  const pass = req.headers['x-password'] || req.body.password;
  if (pass !== PASSWORD) return res.status(401).json({ error: "סיסמה שגויה" });
  next();
}

// ═══════════════════════════════════════════════════════════════
//   API — שאלה ל-Gemini
// ═══════════════════════════════════════════════════════════════
app.post('/api/ask', checkAuth, async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "אין שאלה" });

  // מנסה כל מודל עם כל מפתח
  for (const model of MODELS) {
    for (const apiKey of API_KEYS) {
      try {
        const result = await callGemini(question.trim(), model, apiKey);
        if (result) return res.json({ answer: result, model });
      } catch (e) {
        continue;
      }
    }
  }

  // fallback — Groq
  try {
    const groqResult = await callGroq(question.trim());
    if (groqResult) return res.json({ answer: groqResult.text, model: groqResult.model });
  } catch (e) {}

  res.status(500).json({ error: "כל המודלים נכשלו" });
});

// ═══════════════════════════════════════════════════════════════
//   Gemini API
// ═══════════════════════════════════════════════════════════════
async function callGemini(question, model, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: question }] }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 65536 }
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("אין תוצאה");
  let text = "";
  (candidate.content?.parts || []).forEach(p => { if (p.text && !p.thought) text += p.text; });
  if (!text.trim()) throw new Error("ריק");
  return text.trim();
}

// ═══════════════════════════════════════════════════════════════
//   Groq API (fallback)
// ═══════════════════════════════════════════════════════════════
async function callGroq(question) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_API_KEY },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: question }],
      temperature: 0.7, max_tokens: 8192
    })
  });
  if (!resp.ok) throw new Error("Groq " + resp.status);
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("ריק");
  return { text, model: "groq/gpt-oss-120b" };
}

// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`✅ מענה יהודי רץ על פורט ${PORT}`);
});
