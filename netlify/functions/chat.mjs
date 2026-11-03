export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      {
        status: 405,
        headers: { ...cors, "Content-Type": "application/json" }
      }
    );
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No se recibieron mensajes" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" }
        }
      );
    }

    const apiKey = Netlify.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Falta GEMINI_API_KEY" }),
        {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" }
        }
      );
    }

    const systemMessage = messages.find(
      (message) => message.role === "system"
    );

    const conversation = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      }));

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: systemMessage
            ? {
                parts: [{ text: systemMessage.content }]
              }
            : undefined,
          contents: conversation,
          generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 1500
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "Gemini devolvió un error",
          detalle: data
        }),
        {
          status: response.status,
          headers: { ...cors, "Content-Type": "application/json" }
        }
      );
    }

    const texto =
      data?.candidates?.[0]?.content?.parts
        ?.map((parte) => parte.text)
        .filter(Boolean)
        .join("\n") || "";

    if (!texto) {
      return new Response(
        JSON.stringify({
          error: "Gemini no devolvió texto.",
          motivo: data?.candidates?.[0]?.finishReason,
          detalle: data
        }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        reply: texto
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Error del servidor",
        detalle: String(error)
      }),
      {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" }
      }
    );
  }
};
