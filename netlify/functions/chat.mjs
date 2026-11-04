import { getStore } from "@netlify/blobs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const MODELO = "gemini-3.6-flash";
const MENSAJES_RECIENTES = 20;

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages, chatId } = await req.json();

    console.log("Petición recibida. Mensajes:", messages?.length);

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No se recibieron mensajes" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Netlify.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Falta GEMINI_API_KEY" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const systemMessage = messages.find((m) => m.role === "system");

    const conversacion = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

    let contextoFinal = conversacion;

    // MEMORIA DE LARGO PLAZO
    if (conversacion.length > MENSAJES_RECIENTES && chatId) {
      const store = getStore("nevermore-memory");
      const clave = `mem:${chatId}`;

      const memoria = (await store.get(clave, { type: "json" })) || {
        resumen: "",
        hasta: 0
      };

      const mensajesAntiguos = conversacion.slice(
        0,
        conversacion.length - MENSAJES_RECIENTES
      );

      const mensajesRecientes = conversacion.slice(-MENSAJES_RECIENTES);

      if (mensajesAntiguos.length > memoria.hasta) {
        const nuevos = mensajesAntiguos.slice(memoria.hasta);

        const textoNuevos = nuevos
          .map((m) => `${m.role}: ${m.parts[0].text}`)
          .join("\n");

        const promptResumen = `Actualiza el resumen de esta historia de rol.

Resumen anterior:
${memoria.resumen || "(No hay resumen anterior)"}

Nuevos acontecimientos:
${textoNuevos}

Escribe un resumen en español que conserve:
- Hechos importantes y canon establecido.
- Decisiones y promesas de los personajes.
- Secretos, conflictos, alianzas y relaciones.
- Objetos, lugares y consecuencias pendientes.
- El estado actual de la historia.

No incluyas pensamientos de Angel Vale. Sé conciso pero completo.`;

        const respuestaResumen = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: promptResumen }]
                }
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 800,
                thinkingConfig: { thinkingLevel: "low" }
              }
            })
          }
        );

        const dataResumen = await respuestaResumen.json();

        const textoResumen =
          dataResumen?.candidates?.[0]?.content?.parts
            ?.map((p) => p.text)
            .filter(Boolean)
            .join("\n") || memoria.resumen;

        if (textoResumen) {
          memoria.resumen = textoResumen;
          memoria.hasta = mensajesAntiguos.length;

          await store.setJSON(clave, memoria);
        }
      }

      contextoFinal = [
        {
          role: "user",
          parts: [
            {
              text: `RESUMEN DE LA HISTORIA HASTA AHORA:\n${memoria.resumen}`
            }
          ]
        },
        ...mensajesRecientes
      ];
    }

    const cuerpo = JSON.stringify({
      systemInstruction: systemMessage
        ? { parts: [{ text: systemMessage.content }] }
        : undefined,
      contents: contextoFinal,
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingLevel: "low" }
      }
    });

    async function llamarGemini() {
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
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

    if (response.status === 503 || response.status === 429) {
      console.log("Gemini está saturado. Esperando 2 segundos...");
      await new Promise((r) => setTimeout(r, 2000));

      response = await llamarGemini();
      data = await response.json();
      console.log("Segundo intento. Estado:", response.status);
    }

    console.log("Respuesta de Gemini:", JSON.stringify(data).slice(0, 1500));

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Gemini devolvió un error", detalle: data }),
        { status: response.status, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const candidato = data?.candidates?.[0];
    const texto =
      candidato?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join("\n") || "";

    if (!texto) {
      return new Response(
        JSON.stringify({
          error: "Gemini no devolvió texto.",
          motivo: candidato?.finishReason
        }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ reply: texto }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.log("Error del servidor:", String(error));

    return new Response(
      JSON.stringify({ error: "Error del servidor", detalle: String(error) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
};
