import { getStore } from "@netlify/blobs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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
    const { id, titulo, mensajes } = await req.json();

    if (!id || !Array.isArray(mensajes)) {
      return new Response(
        JSON.stringify({ error: "Datos incompletos" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const store = getStore("nevermore-chats");

    const chat = {
      id,
      titulo: titulo || "Nuevo chat",
      mensajes,
      actualizado: Date.now()
    };

    await store.setJSON(`chat:${id}`, chat);

    let indice = (await store.get("indice", { type: "json" })) || [];

    indice = indice.filter((item) => item.id !== id);
    indice.unshift({
      id: chat.id,
      titulo: chat.titulo,
      actualizado: chat.actualizado
    });

    await store.setJSON("indice", indice);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
};
