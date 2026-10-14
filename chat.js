
export default async function handler(req, res) {
  // Hanya menerima POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Metode tidak diizinkan. Gunakan POST."
    });
  }

  try {
    const { provider, message, history = [], mode = "Default" } =
      req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Pesan tidak boleh kosong."
      });
    }

    const systemPrompt = `
Kamu adalah Adly's AI, asisten AI yang ramah,
cerdas, akurat, dan membantu dalam bahasa Indonesia.

Mode pengguna: ${mode}.
Berikan jawaban yang jelas, terstruktur, dan mudah dipahami.
`;

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              ["user", "assistant"].includes(item.role) &&
              typeof item.content === "string"
          )
          .slice(-20)
      : [];

    let answer = "";

    // =====================================
    // CHATGPT / OPENAI
    // =====================================
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;

      if (!key) {
        throw new Error(
          "OPENAI_API_KEY belum diatur di Vercel."
        );
      }

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...safeHistory,
              { role: "user", content: message }
            ],
            temperature: 0.7
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || "Permintaan OpenAI gagal."
        );
      }

      answer = data.choices?.[0]?.message?.content || "";
    }

    // =====================================
    // GOOGLE GEMINI
    // =====================================
    else if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY;

      if (!key) {
        throw new Error(
          "GEMINI_API_KEY belum diatur di Vercel."
        );
      }

      const model =
        process.env.GEMINI_MODEL || "gemini-2.5-flash";

      const contents = [
        ...safeHistory.map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: item.content }]
        })),
        {
          role: "user",
          parts: [{ text: message }]
        }
      ];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents,
            generationConfig: {
              temperature: 0.7
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || "Permintaan Gemini gagal."
        );
      }

      answer =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("") || "";
    }

    // =====================================
    // ANTHROPIC / CLAUDE
    // =====================================
    else if (provider === "claude") {
      const key = process.env.ANTHROPIC_API_KEY;

      if (!key) {
        throw new Error(
          "ANTHROPIC_API_KEY belum diatur di Vercel."
        );
      }

      const model =
        process.env.CLAUDE_MODEL ||
        "claude-3-7-sonnet-20250219";

      const response = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: systemPrompt,
            messages: [
              ...safeHistory,
              { role: "user", content: message }
            ]
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || "Permintaan Claude gagal."
        );
      }

      answer =
        data.content
          ?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n") || "";
    }

    // =====================================
    // PROVIDER TIDAK DIKENAL
    // =====================================
    else {
      return res.status(400).json({
        success: false,
        error: "Provider tidak dikenal: " + String(provider)
      });
    }

    if (!answer) {
      throw new Error(
        "AI tidak mengembalikan teks. Periksa model dan akses API."
      );
    }

    return res.status(200).json({
      success: true,
      provider,
      answer
    });

  } catch (error) {
    console.error("Adly AI API Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Terjadi kesalahan pada server."
    });
  }
}
