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

    console.log("Petición recibida. Mensajes:", messages?.length);

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

    const cuerpo = JSON.stringify({
      systemInstruction: systemMessage
        ? {
            parts: [{ text: systemMessage.content }]
          }
        : undefined,
      contents: conversation,
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 1000,
        thinkingConfig: {
          thinkingLevel: "low"
        }
      }
    });

    async function llamarGemini() {
      return fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: cuerpo
        }
      );
    }

    let response = await llamarGemini();
    let data = await response.json();

    console.log("Primer intento. Estado:", response.status);

    // Reintento si Gemini está saturado
    if (response.status === 503 || response.status === 429) {
      console.log("Gemini está saturado. Esperando 2 segundos...");

      await new Promise((resolver) => setTimeout(resolver, 2000));

      response = await llamarGemini();
      data = await response.json();

      console.log("Segundo intento. Estado:", response.status);
    }

    console.log(
      "Respuesta de Gemini:",
      JSON.stringify(data).slice(0, 2000)
    );

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

    const candidato = data?.candidates?.[0];
    const motivo = candidato?.finishReason;
    const texto =
      candidato?.content?.parts
        ?.map((parte) => parte.text)
        .filter(Boolean)
        .join("\n") || "";

    console.log("Motivo de finalización:", motivo);

    if (!texto) {
      return new Response(
        JSON.stringify({
          error: "Gemini no devolvió texto.",
          motivo,
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
    console.log("Error del servidor:", String(error));

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
