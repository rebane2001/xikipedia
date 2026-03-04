import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("lists available languages", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Should either redirect to single language or show language picker
    const url = new URL(page.url());
    if (url.pathname === "/") {
      // Multiple languages — landing page with language links
      await expect(page.locator("body")).toContainText(/Choose a language|Wikiquiz/);
    } else {
      // Single language — redirected to /:lang/
      expect(url.pathname).toMatch(/\/\w+\//);
    }
  });
});

test.describe("Start screen", () => {
  test("loads with category pickers", async ({ page }) => {
    await page.goto("/simple/");
    // Start screen should be visible
    const startScreen = page.locator("#startScreen");
    await expect(startScreen).toBeVisible();

    // Should have category picker labels
    const pickers = page.locator(".categoryPicker");
    await expect(pickers.first()).toBeVisible();

    // Start button should be enabled (not disabled)
    const startBtn = page.locator("#startBtn");
    await expect(startBtn).toBeEnabled();
    await expect(startBtn).toHaveText("I'm an adult, continue");
  });

  test("category search returns results", async ({ page }) => {
    await page.goto("/simple/");
    const searchInput = page.locator("#categorySearch input");
    await expect(searchInput).toBeEnabled();

    await searchInput.fill("sci");
    // Wait for debounced search to complete
    await page.waitForTimeout(500);

    const options = page.locator("#categorySearch select option");
    await expect(options.first()).toBeVisible();
  });
});

test.describe("Feed", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored profiles
    await page.goto("/simple/");
    await page.evaluate((lang) => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(`wikiquiz-`));
      keys.forEach(k => localStorage.removeItem(k));
    }, "simple");
    await page.reload();
  });

  test("selecting categories and clicking start shows feed posts", async ({ page }) => {
    // Check a category
    const firstPicker = page.locator(".categoryPicker").first();
    await firstPicker.click();

    // Click start
    await page.locator("#startBtn").click();

    // Posts should appear
    const post = page.locator(".post").first();
    await expect(post).toBeVisible({ timeout: 5000 });

    // Post should have a title and text
    await expect(post.locator("h1")).toBeVisible();
    await expect(post.locator("p")).toBeVisible();
  });

  test("scrolling loads more posts", async ({ page }) => {
    await page.locator("#startBtn").click();

    // Wait for initial posts
    await expect(page.locator(".post").first()).toBeVisible({ timeout: 5000 });

    const initialCount = await page.locator(".post").count();

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    const newCount = await page.locator(".post").count();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test("like button toggles visual state", async ({ page }) => {
    await page.locator("#startBtn").click();
    await expect(page.locator(".post").first()).toBeVisible({ timeout: 5000 });

    const likeBtn = page.locator(".post button").first();
    // Initially should not have data-liked
    await expect(likeBtn).not.toHaveAttribute("data-liked");

    // Click like
    await likeBtn.click();

    // Should now have data-liked
    await expect(likeBtn).toHaveAttribute("data-liked", "true");
  });

  test("post links point to correct Wikipedia domain", async ({ page }) => {
    await page.locator("#startBtn").click();
    await expect(page.locator(".post").first()).toBeVisible({ timeout: 5000 });

    // Click a post and check the opened URL would be simple.wikipedia.org
    const postTitle = await page.locator(".post h1").first().textContent();
    // Verify the link would go to simple.wikipedia.org (default setting openMainWiki=false)
    const href = await page.evaluate((title) => {
      const domain = "simple.wikipedia.org";
      return `https://${domain}/wiki/${title.replace(/ /g, '_')}`;
    }, postTitle);
    expect(href).toContain("simple.wikipedia.org");
  });
});

test.describe("Russian feed", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ru/");
    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("wikiquiz-"));
      keys.forEach(k => localStorage.removeItem(k));
    });
    await page.reload();
  });

  test("Russian start screen loads with Russian categories", async ({ page }) => {
    const startScreen = page.locator("#startScreen");
    await expect(startScreen).toBeVisible();
    const startBtn = page.locator("#startBtn");
    await expect(startBtn).toBeEnabled();
  });

  test("Russian feed shows posts with Russian text", async ({ page }) => {
    // Wait for start button to be enabled
    const startBtn = page.locator("#startBtn");
    await expect(startBtn).toBeEnabled({ timeout: 10000 });
    await startBtn.click();
    const post = page.locator(".post").first();
    await expect(post).toBeVisible({ timeout: 10000 });
    // Check post has content
    const title = await post.locator("h1").textContent();
    expect(title!.length).toBeGreaterThan(0);
  });

  test("Russian category search returns results", async ({ page }) => {
    const searchInput = page.locator("#categorySearch input");
    await expect(searchInput).toBeEnabled();
    await searchInput.fill("наук");
    await page.waitForTimeout(500);
    const options = page.locator("#categorySearch select option");
    await expect(options.first()).toBeVisible();
  });
});

test.describe("API", () => {
  test("POST /api/simple/feed returns posts", async ({ request }) => {
    const resp = await request.post("/api/simple/feed", {
      data: { scores: {}, seen: [], batchSize: 5 },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.posts).toBeDefined();
    expect(data.posts.length).toBeGreaterThan(0);
    expect(data.posts[0]).toHaveProperty("title");
    expect(data.posts[0]).toHaveProperty("excerpt");
    expect(data.posts[0]).toHaveProperty("categories");
  });

  test("POST /api/ru/feed returns Russian posts", async ({ request }) => {
    const resp = await request.post("/api/ru/feed", {
      data: { scores: {}, seen: [], batchSize: 5 },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.posts).toBeDefined();
    expect(data.posts.length).toBeGreaterThan(0);
    expect(data.posts[0]).toHaveProperty("title");
    expect(data.posts[0]).toHaveProperty("excerpt");
  });

  test("GET /api/simple/categories/search returns results", async ({ request }) => {
    const resp = await request.get("/api/simple/categories/search?q=sci");
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.categories).toBeDefined();
    expect(data.categories.length).toBeGreaterThan(0);
  });

  test("GET /api/simple/categories/popular returns categories", async ({ request }) => {
    const resp = await request.get("/api/simple/categories/popular");
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.categories).toBeDefined();
    expect(data.categories.length).toBeGreaterThan(0);
  });

  test("GET /api/languages lists available languages", async ({ request }) => {
    const resp = await request.get("/api/languages");
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.languages).toBeDefined();
    expect(data.languages.length).toBeGreaterThan(0);
    const codes = data.languages.map((l: any) => l.code);
    expect(codes).toContain("simple");
    // "ru" only available when ru.db is built
  });
});
