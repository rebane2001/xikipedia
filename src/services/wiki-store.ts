import { Database } from "bun:sqlite";
import type { Article, FeedPost } from "../types";

export class WikiStore {
  private db: Database;

  /** All article IDs for random sampling */
  articleIds: Int32Array;

  /** Set of article IDs that have a thumbnail */
  hasImageSet: Set<number>;

  /** Category name → integer ID */
  catNameToId: Map<string, number>;

  /** Category ID → name */
  catIdToName: Map<number, string>;

  /**
   * Packed flat arrays for article → category IDs.
   * categoryOffsets[i] = start index in categoryData for article at index i in articleIds.
   * categoryOffsets[i+1] - categoryOffsets[i] = number of categories for that article.
   */
  private categoryOffsets: Int32Array;
  private categoryData: Int32Array;

  /**
   * Packed flat arrays for article → link target IDs.
   */
  private linkOffsets: Int32Array;
  private linkData: Int32Array;

  /** article ID → index in articleIds (for offset lookups) */
  private articleIdToIndex: Map<number, number>;

  /** Prepared statements */
  private stmtGetArticle: ReturnType<Database["prepare"]>;
  private stmtGetArticles: ReturnType<Database["prepare"]>;
  private stmtSearchCategories: ReturnType<Database["prepare"]>;
  private stmtPopularCategories: ReturnType<Database["prepare"]>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });
    this.db.exec("PRAGMA mmap_size=268435456"); // 256MB mmap

    // Load article IDs
    const rows = this.db.query("SELECT id, thumb FROM articles").all() as {
      id: number;
      thumb: string | null;
    }[];
    this.articleIds = new Int32Array(rows.length);
    this.hasImageSet = new Set();
    this.articleIdToIndex = new Map();

    for (let i = 0; i < rows.length; i++) {
      this.articleIds[i] = rows[i].id;
      this.articleIdToIndex.set(rows[i].id, i);
      if (rows[i].thumb) this.hasImageSet.add(rows[i].id);
    }

    console.log(`  Loaded ${this.articleIds.length} article IDs`);

    // Load category maps
    this.catNameToId = new Map();
    this.catIdToName = new Map();
    const cats = this.db.query("SELECT id, name FROM categories").all() as {
      id: number;
      name: string;
    }[];
    for (const cat of cats) {
      this.catNameToId.set(cat.name, cat.id);
      this.catIdToName.set(cat.id, cat.name);
    }
    console.log(`  Loaded ${cats.length} categories`);

    // Load article → category_ids into flat packed arrays
    this.loadCategoryArrays();

    // Load article → link_ids into flat packed arrays
    this.loadLinkArrays();

    // Prepare statements
    this.stmtGetArticle = this.db.prepare(
      "SELECT id, title, excerpt, thumb FROM articles WHERE id = ?"
    );
    this.stmtGetArticles = this.db.prepare(
      "SELECT id, title, excerpt, thumb FROM articles WHERE id IN (SELECT value FROM json_each(?))"
    );
    this.stmtSearchCategories = this.db.prepare(
      "SELECT name FROM categories WHERE name LIKE ? LIMIT 50"
    );
    this.stmtPopularCategories = this.db.prepare(`
      SELECT c.name, COUNT(*) as cnt
      FROM article_categories ac
      JOIN categories c ON c.id = ac.category_id
      GROUP BY ac.category_id
      ORDER BY cnt DESC
      LIMIT ?
    `);
  }

  private loadCategoryArrays() {
    const n = this.articleIds.length;
    // First pass: count categories per article
    const counts = new Int32Array(n);
    let totalCats = 0;

    const allAC = this.db
      .query("SELECT article_id, category_id FROM article_categories ORDER BY article_id")
      .all() as { article_id: number; category_id: number }[];

    for (const row of allAC) {
      const idx = this.articleIdToIndex.get(row.article_id);
      if (idx !== undefined) {
        counts[idx]++;
        totalCats++;
      }
    }

    // Build offsets
    this.categoryOffsets = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      this.categoryOffsets[i + 1] = this.categoryOffsets[i] + counts[i];
    }

    // Fill data
    this.categoryData = new Int32Array(totalCats);
    const pos = new Int32Array(n); // current write position per article
    for (const row of allAC) {
      const idx = this.articleIdToIndex.get(row.article_id);
      if (idx !== undefined) {
        const offset = this.categoryOffsets[idx] + pos[idx];
        this.categoryData[offset] = row.category_id;
        pos[idx]++;
      }
    }

    console.log(`  Loaded ${totalCats} article-category pairs`);
  }

  private loadLinkArrays() {
    const n = this.articleIds.length;
    const counts = new Int32Array(n);
    let totalLinks = 0;

    const allAL = this.db
      .query("SELECT article_id, target_page_id FROM article_links ORDER BY article_id")
      .all() as { article_id: number; target_page_id: number }[];

    for (const row of allAL) {
      const idx = this.articleIdToIndex.get(row.article_id);
      if (idx !== undefined) {
        counts[idx]++;
        totalLinks++;
      }
    }

    this.linkOffsets = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      this.linkOffsets[i + 1] = this.linkOffsets[i] + counts[i];
    }

    this.linkData = new Int32Array(totalLinks);
    const pos = new Int32Array(n);
    for (const row of allAL) {
      const idx = this.articleIdToIndex.get(row.article_id);
      if (idx !== undefined) {
        const offset = this.linkOffsets[idx] + pos[idx];
        this.linkData[offset] = row.target_page_id;
        pos[idx]++;
      }
    }

    console.log(`  Loaded ${totalLinks} article-link pairs`);
  }

  hasImage(articleId: number): boolean {
    return this.hasImageSet.has(articleId);
  }

  getCategoryIds(articleId: number): Int32Array | null {
    const idx = this.articleIdToIndex.get(articleId);
    if (idx === undefined) return null;
    const start = this.categoryOffsets[idx];
    const end = this.categoryOffsets[idx + 1];
    return this.categoryData.subarray(start, end);
  }

  getLinkIds(articleId: number): Int32Array | null {
    const idx = this.articleIdToIndex.get(articleId);
    if (idx === undefined) return null;
    const start = this.linkOffsets[idx];
    const end = this.linkOffsets[idx + 1];
    return this.linkData.subarray(start, end);
  }

  getArticle(id: number): Article | null {
    return this.stmtGetArticle.get(id) as Article | null;
  }

  getArticles(ids: number[]): Article[] {
    return this.stmtGetArticles.all(JSON.stringify(ids)) as Article[];
  }

  searchCategories(query: string): string[] {
    const results = this.stmtSearchCategories.all(`%${query}%`) as {
      name: string;
    }[];
    return results.map((r) => r.name);
  }

  getPopularCategories(limit: number = 50): string[] {
    const results = this.stmtPopularCategories.all(limit) as {
      name: string;
      cnt: number;
    }[];
    return results.map((r) => r.name);
  }

  getRandomArticleIds(count: number): Int32Array {
    const result = new Int32Array(count);
    const len = this.articleIds.length;
    for (let i = 0; i < count; i++) {
      result[i] = this.articleIds[(Math.random() * len) | 0];
    }
    return result;
  }
}
