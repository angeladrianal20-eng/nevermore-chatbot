import { getStore } from "@netlify/blobs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  try {
    const store = getStore("nevermore-chats");
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      const chat = await store.get(`chat:${id}`, { type: "json" });

      if (!chat) {
        return new Response(
          JSON.stringify({ error: "Chat no encontrado" }),
          { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(chat),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const indice = (await store.get("indice", { type: "json" })) || [];

    return new Response(
      JSON.stringify(indice),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
};
