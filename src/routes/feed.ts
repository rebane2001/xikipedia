import { Hono } from "hono";
import type { WikiStore } from "../services/wiki-store";
import { generateFeed } from "../services/feed-service";
import type { FeedRequest } from "../types";

export function createFeedRoutes(stores: Map<string, WikiStore>) {
  const app = new Hono();

  // POST /api/:lang/feed
  app.post("/:lang/feed", async (c) => {
    const lang = c.req.param("lang");
    const store = stores.get(lang);
    if (!store) return c.json({ error: "Language not found" }, 404);

    const body = (await c.req.json()) as FeedRequest;
    const scores = body.scores ?? {};
    const seen = body.seen ?? [];
    const batchSize = Math.min(body.batchSize ?? 20, 50);

    const posts = generateFeed(store, scores, seen, batchSize);
    return c.json({ posts });
  });

  // GET /api/:lang/categories/search?q=
  app.get("/:lang/categories/search", (c) => {
    const lang = c.req.param("lang");
    const store = stores.get(lang);
    if (!store) return c.json({ error: "Language not found" }, 404);

    const query = c.req.query("q") ?? "";
    if (!query) return c.json({ categories: [] });

    const categories = store.searchCategories(query);
    return c.json({ categories });
  });

  // GET /api/:lang/categories/popular
  app.get("/:lang/categories/popular", (c) => {
    const lang = c.req.param("lang");
    const store = stores.get(lang);
    if (!store) return c.json({ error: "Language not found" }, 404);

    const categories = store.getPopularCategories(50);
    return c.json({ categories });
  });

  return app;
}
