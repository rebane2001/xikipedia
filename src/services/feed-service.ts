import type { WikiStore } from "./wiki-store";
import type { FeedPost } from "../types";

/**
 * Direct port of getNextPost() from index.html ~line 1075.
 * Runs server-side with in-memory data for fast scoring.
 */
export function generateFeed(
  store: WikiStore,
  scores: Record<string, number>,
  seen: number[],
  batchSize: number = 20
): FeedPost[] {
  // Map category name scores to integer IDs for fast lookup
  const catIdScores = new Map<number, number>();
  const pseudoCatScores = new Map<string, number>(); // p:{id} scores
  for (const [name, score] of Object.entries(scores)) {
    if (name.startsWith("p:")) {
      pseudoCatScores.set(name, score);
    } else {
      const catId = store.catNameToId.get(name);
      if (catId !== undefined) {
        catIdScores.set(catId, score);
      }
    }
  }

  // Build seen count map
  const seenCounts = new Map<number, number>();
  for (const id of seen) {
    seenCounts.set(id, (seenCounts.get(id) ?? 0) + 1);
  }

  // Track batch-local exclusions
  const excluded = new Set<number>();
  const selectedIds: number[] = [];

  for (let batch = 0; batch < batchSize; batch++) {
    // Sample 10,000 random article IDs
    const candidates = store.getRandomArticleIds(10000);

    // Score each candidate
    const scored: { id: number; score: number }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i];
      if (excluded.has(id)) continue;

      // Base score: has image? +5
      let score = store.hasImage(id) ? 5 : 0;

      // Seen penalty: (3^count - 1) * -50000
      const seenCount = seenCounts.get(id) ?? 0;
      if (seenCount > 0) {
        score += (Math.pow(3, seenCount) - 1) * -50000;
      }

      // Category scores
      const catIds = store.getCategoryIds(id);
      if (catIds) {
        for (let j = 0; j < catIds.length; j++) {
          const catScore = catIdScores.get(catIds[j]);
          if (catScore !== undefined) score += catScore;
        }
      }

      // Pseudo-category scores (p:{id} for self + p:{linkTarget})
      const selfScore = pseudoCatScores.get(`p:${id}`);
      if (selfScore !== undefined) score += selfScore;

      const linkIds = store.getLinkIds(id);
      if (linkIds) {
        for (let j = 0; j < linkIds.length; j++) {
          const linkScore = pseudoCatScores.get(`p:${linkIds[j]}`);
          if (linkScore !== undefined) score += linkScore;
        }
      }

      scored.push({ id, score });
    }

    if (scored.length === 0) continue;

    let bestId: number;

    // Selection: 40% weighted random, 42% highest score, 18% pure random
    const rand = Math.random();
    if (rand < 0.4) {
      // Weighted random selection
      const minScore = scored.reduce(
        (min, s) => Math.min(min, s.score),
        Infinity
      );
      const totalWeight = scored.reduce(
        (sum, s) => sum + (s.score - minScore),
        0
      );

      if (totalWeight === 0) {
        bestId = scored[(Math.random() * scored.length) | 0].id;
      } else {
        const target = Math.random() * totalWeight;
        let cumulative = 0;
        bestId = scored[scored.length - 1].id;
        for (let i = scored.length - 1; i >= 0; i--) {
          cumulative += scored[i].score - minScore;
          bestId = scored[i].id;
          if (cumulative >= target) break;
        }
      }
    } else if (rand < 0.82) {
      // Highest score
      let highestScore = -Infinity;
      bestId = scored[0].id;
      for (const s of scored) {
        if (s.score > highestScore) {
          highestScore = s.score;
          bestId = s.id;
        }
      }
    } else {
      // Pure random
      bestId = scored[(Math.random() * scored.length) | 0].id;
    }

    excluded.add(bestId);
    selectedIds.push(bestId);
    // Update seen count for batch-local penalty
    seenCounts.set(bestId, (seenCounts.get(bestId) ?? 0) + 1);
  }

  // Fetch article details
  const articles = store.getArticles(selectedIds);
  const articleMap = new Map(articles.map((a) => [a.id, a]));

  // Build response with category names and links resolved
  const posts: FeedPost[] = [];
  for (const id of selectedIds) {
    const article = articleMap.get(id);
    if (!article) continue;

    // Resolve category names
    const catIds = store.getCategoryIds(id);
    const categories: string[] = [];
    if (catIds) {
      for (let i = 0; i < catIds.length; i++) {
        const name = store.catIdToName.get(catIds[i]);
        if (name) categories.push(name);
      }
    }

    // Get link IDs
    const linkIds = store.getLinkIds(id);
    const links: number[] = linkIds ? Array.from(linkIds) : [];

    posts.push({
      id: article.id,
      title: article.title,
      excerpt: article.excerpt,
      thumb: article.thumb,
      categories,
      links,
    });
  }

  return posts;
}
