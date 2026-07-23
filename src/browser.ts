import { chromium, BrowserContext, Page } from "patchright";

let context: BrowserContext | null = null;

function getUserDataDir(): string {
  return process.env.TURO_USER_DATA_DIR || "/tmp/mcp-turo-profile";
}

export async function getContext(): Promise<BrowserContext> {
  if (!context) {
    context = await chromium.launchPersistentContext(getUserDataDir(), {
      headless: process.env.TURO_HEADLESS !== "0",
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--window-size=1920,1080",
      ],
    });

    // Inject stealth scripts
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });
  }
  return context;
}

export async function newPage(): Promise<Page> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForNavigation(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await sleep(1000);
}
