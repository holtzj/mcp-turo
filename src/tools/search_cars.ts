import { appendFileSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { newPage, waitForNavigation, sleep } from "../browser.js";
import type { SearchCarsParams, CarListing } from "../types.js";

const VEHICLE_CARD_SELECTOR =
  '[data-testid="SearchResultWrapper"], [data-testid="vehicle-card"], .vehicle-card, [class*="vehicleCard"], [class*="vehicle-card"]';

const VEHICLE_LINK_SELECTOR =
  '[data-testid="vehicle-card-link-box"], a[href*="/vehicles/"]';

const VEHICLE_TYPES = new Set([
  "car",
  "suv",
  "truck",
  "van",
  "minivan",
  "convertible",
  "luxury",
  "electric",
]);

function isDebugEnabled(): boolean {
  return process.env.TURO_DEBUG === "1";
}

function getDebugDir(): string {
  return process.env.TURO_DEBUG_DIR || "/tmp/mcp-turo-debug";
}

function debugLog(message: string, details?: unknown): void {
  if (!isDebugEnabled()) return;
  const suffix = details === undefined ? "" : ` ${JSON.stringify(details)}`;
  const line = `[mcp-turo:search_cars] ${message}${suffix}`;
  console.error(line);

  try {
    mkdirSync(getDebugDir(), { recursive: true });
    appendFileSync(join(getDebugDir(), "search.log"), `${line}\n`, "utf8");
  } catch {
    // Keep debug logging best-effort so it never breaks the MCP tool call.
  }
}

async function writeDebugArtifacts(pageUrl: string, html: string, screenshot: Buffer): Promise<void> {
  const dir = getDebugDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeUrl = pageUrl.replace(/[^a-z0-9]+/gi, "-").slice(0, 80);
  const base = `${stamp}-${safeUrl}`;

  await writeFile(join(dir, `${base}.html`), html, "utf8");
  await writeFile(join(dir, `${base}.png`), screenshot);
  debugLog("wrote debug artifacts", {
    html: join(dir, `${base}.html`),
    screenshot: join(dir, `${base}.png`),
  });
}

function getVehicleTypes(params: SearchCarsParams): string[] {
  const requestedTypes = [
    ...(Array.isArray(params.vehicle_type)
      ? params.vehicle_type
      : params.vehicle_type
        ? [params.vehicle_type]
        : []),
    ...(params.vehicle_types || []),
  ];

  return Array.from(
    new Set(
      requestedTypes
        .map((type) => type.toLowerCase())
        .filter((type) => VEHICLE_TYPES.has(type))
    )
  );
}

export async function searchCars(params: SearchCarsParams): Promise<CarListing[]> {
  const vehicleTypes = getVehicleTypes(params);

  if (vehicleTypes.length > 1) {
    const listingsById = new Map<string, CarListing>();

    for (const vehicleType of vehicleTypes) {
      const results = await searchCarsForVehicleType(params, vehicleType);
      results.forEach((listing) => listingsById.set(listing.id, listing));
    }

    return Array.from(listingsById.values());
  }

  return searchCarsForVehicleType(params, vehicleTypes[0]);
}

async function searchCarsForVehicleType(
  params: SearchCarsParams,
  vehicleType?: string
): Promise<CarListing[]> {
  const page = await newPage();

  try {
    if (isDebugEnabled()) {
      page.on("console", (msg) => debugLog(`browser console ${msg.type()}`, msg.text()));
      page.on("pageerror", (error) => debugLog("browser pageerror", error.message));
      page.on("requestfailed", (request) =>
        debugLog("request failed", {
          url: request.url(),
          failure: request.failure()?.errorText,
        })
      );
    }

    // Build Turo search URL
    const baseUrl = "https://turo.com/us/en/search";
    const searchParams = new URLSearchParams();
    searchParams.set("location", params.location);
    searchParams.set("deliveryLocationType", "airport");
    searchParams.set("locationType", "AIRPORT");
    searchParams.set("startDate", params.start_date);
    searchParams.set("endDate", params.end_date);
    searchParams.set("startTime", "14:00");
    searchParams.set("endTime", "14:00");
    searchParams.set("pickupType","PICKUP_AT")

    if (vehicleType) {
      searchParams.set("type", vehicleType.toUpperCase());
    }

    const url = `${baseUrl}?${searchParams.toString()}`;
    debugLog("navigating", { url, vehicleType });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForNavigation(page);
    debugLog("navigation complete", {
      status: response?.status(),
      requestedUrl: url,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
    });

    // Wait for search results to load
    const foundResultsSelector = await page.waitForSelector(VEHICLE_CARD_SELECTOR, {
      timeout: 120000,
    }).then(() => true).catch(() => false);

    await sleep(2000);
    const selectorCounts = await page.evaluate(({ vehicleCardSelector, vehicleLinkSelector }) => {
      const selectors = [
        vehicleCardSelector,
        vehicleLinkSelector,
        '[data-testid="vehicle-card-link-box"]',
        'a[href*="-rental/"][href*="?"]',
        "a[href*='/vehicles/']",
        "[data-testid]",
        "[class*='vehicle']",
        "[class*='Vehicle']",
        "[class*='search']",
      ];

      return Object.fromEntries(
        selectors.map((selector) => [selector, document.querySelectorAll(selector).length])
      );
    }, { vehicleCardSelector: VEHICLE_CARD_SELECTOR, vehicleLinkSelector: VEHICLE_LINK_SELECTOR });
    debugLog("selector counts", { foundResultsSelector, selectorCounts });

    // Extract car listings from search results
    const listings = await page.evaluate(
      ({
        minPrice,
        maxPrice,
        vehicleCardSelector,
        vehicleLinkSelector,
      }: {
        minPrice?: number;
        maxPrice?: number;
        vehicleCardSelector: string;
        vehicleLinkSelector: string;
      }) => {
        type ExtractedListing = {
          id: string;
          make: string;
          model: string;
          year: number;
          daily_rate: number;
          rating: number;
          trip_count: number;
          location: string;
          listing_url: string;
          host_name: string;
          features: string[];
          vehicle_type: string;
        };

        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        function getScrollContainer(): HTMLElement | Window {
          return (
            document.querySelector('[data-testid="virtuoso-scroller"]') as HTMLElement | null
          ) || window;
        }

        function getScrollState(container: HTMLElement | Window): {
          scrollTop: number;
          scrollHeight: number;
          clientHeight: number;
        } {
          if (container === window) {
            const element = document.scrollingElement || document.documentElement;
            return {
              scrollTop: window.scrollY,
              scrollHeight: element.scrollHeight,
              clientHeight: window.innerHeight,
            };
          }

          const element = container as HTMLElement;
          return {
            scrollTop: element.scrollTop,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          };
        }

        function scrollByPage(container: HTMLElement | Window): void {
          const { clientHeight } = getScrollState(container);
          const distance = Math.max(400, Math.floor(clientHeight * 0.85));

          if (container === window) {
            window.scrollBy(0, distance);
          } else {
            container.scrollBy(0, distance);
          }
        }

        function isAtBottom(container: HTMLElement | Window): boolean {
          const { scrollTop, scrollHeight, clientHeight } = getScrollState(container);
          return scrollTop + clientHeight >= scrollHeight - 8;
        }

        function extractVisibleListings(): ExtractedListing[] {
          const cardSet = new Set<Element>(Array.from(document.querySelectorAll(vehicleCardSelector)));

          document.querySelectorAll(vehicleLinkSelector).forEach((link) => {
            cardSet.add(link.closest('[data-testid="SearchResultWrapper"]') || link);
          });

          const cards = Array.from(cardSet);
          const results: ExtractedListing[] = [];

          cards.forEach((card) => {
            try {
              const link = card.matches("a")
                ? (card as HTMLAnchorElement)
                : (card.querySelector(vehicleLinkSelector) as HTMLAnchorElement | null);
              const href = link?.href || "";
              if (!href) return;
              const idMatch = href.match(/\/vehicles\/(\d+)/) || href.match(/\/(\d+)(?:\?|$)/);
              if (!idMatch) return;
              const id = idMatch[1];

              const cardText = (card as HTMLElement).innerText?.replace(/\s+/g, " ").trim() || "";
              const image = card.querySelector("img") as HTMLImageElement | null;
              const imageAlt = image?.alt?.trim() || "";
              const listingUrl = new URL(href, window.location.origin);

              const titleEl = card.querySelector(
                '[class*="title"], [class*="name"], h2, h3'
              ) as HTMLElement | null;
              const titleText = titleEl?.textContent?.trim() || imageAlt.replace(/\s+\d{4}$/, "");
              const yearMatch = `${imageAlt} ${cardText}`.match(/(\d{4})/);
              const year = yearMatch ? parseInt(yearMatch[1]) : 0;

              const urlParts = listingUrl.pathname.split("/").filter(Boolean);
              const makeFromUrl = urlParts.at(-3);
              const modelFromUrl = urlParts.at(-2);
              const nameParts = titleText.replace(/\d{4}\s*/, "").trim().split(" ").filter(Boolean);
              const make = nameParts[0] || (makeFromUrl ? makeFromUrl.replace(/-/g, " ") : "Unknown");
              const model = nameParts.slice(1).join(" ") || (modelFromUrl ? modelFromUrl.replace(/-/g, " ") : "Unknown");

              const priceEl = card.querySelector(
                '[class*="price"], [class*="rate"]'
              ) as HTMLElement | null;
              const priceText = `${priceEl?.textContent || ""} ${cardText}`;
              const totalMatch = priceText.match(/\$([\d,]+)\s+total/i);
              const priceMatch = totalMatch || priceText.match(/\$?([\d,]+)/);
              const totalPrice = priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : 0;
              const startDate = new URL(window.location.href).searchParams.get("startDate");
              const endDate = new URL(window.location.href).searchParams.get("endDate");
              const tripDays = startDate && endDate
                ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
                : 1;
              const daily_rate = totalMatch ? Math.round((totalPrice / tripDays) * 100) / 100 : totalPrice;

              if (minPrice !== undefined && daily_rate < minPrice) return;
              if (maxPrice !== undefined && daily_rate > maxPrice) return;

              const ratingEl = card.querySelector(
                '[class*="rating"], [aria-label*="rating"]'
              ) as HTMLElement | null;
              const ratingText = ratingEl?.textContent || ratingEl?.getAttribute("aria-label") || cardText || "0";
              const ratingMatch = ratingText.match(/\b([1-5](?:\.\d+)?)\s*\(/) || ratingText.match(/rating[^0-9]*([1-5](?:\.\d+)?)/i);
              const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

              const tripEl = card.querySelector(
                '[class*="trip"], [class*="count"]'
              ) as HTMLElement | null;
              const tripText = tripEl?.textContent || cardText;
              const tripMatch = tripText.match(/\(([\d,]+)\)/) || tripText.match(/([\d,]+)\s+trips?/i);
              const trip_count = tripMatch ? parseInt(tripMatch[1].replace(",", "")) : 0;

              const locationEl = card.querySelector(
                '[class*="location"], [class*="distance"]'
              ) as HTMLElement | null;
              const locationMatch = cardText.replace(/\bAll-Star Host\b\s*/i, "").match(/([A-Z][A-Za-z .'-]+)\s*•\s*[\d.]+\s*mi/);
              const location = locationEl?.textContent?.trim() || locationMatch?.[1]?.trim() || "";

              const hostEl = card.querySelector(
                '[class*="host"], [class*="owner"]'
              ) as HTMLElement | null;
              const host_name = hostEl?.textContent?.trim() || "Host";

              const featureEls = card.querySelectorAll('[class*="feature"], [class*="badge"]');
              const features: string[] = [];
              featureEls.forEach((el) => {
                const text = (el as HTMLElement).textContent?.trim();
                if (text) features.push(text);
              });
              if (/All-Star Host/i.test(cardText)) features.push("All-Star Host");

              const typeEl = card.querySelector('[class*="type"], [class*="category"]') as HTMLElement | null;
              const rentalType = listingUrl.pathname.match(/\/([^/]+)-rental\//)?.[1];
              const vehicle_type = typeEl?.textContent?.trim() || rentalType || "car";

              results.push({
                id,
                make,
                model,
                year,
                daily_rate,
                rating,
                trip_count,
                location,
                listing_url: listingUrl.href,
                host_name,
                features,
                vehicle_type,
              });
            } catch {
              // Skip malformed cards
            }
          });

          return results;
        }

        return (async () => {
          const listingsById = new Map<string, ExtractedListing>();
          const container = getScrollContainer();
          let attemptsWithoutNewListings = 0;
          let previousScrollTop = -1;
          const maxScrollAttempts = 80;

          for (let attempt = 0; attempt < maxScrollAttempts; attempt += 1) {
            const visibleListings = extractVisibleListings();
            let newListings = 0;

            visibleListings.forEach((listing) => {
              if (!listingsById.has(listing.id)) {
                listingsById.set(listing.id, listing);
                newListings += 1;
              }
            });

            attemptsWithoutNewListings = newListings === 0 ? attemptsWithoutNewListings + 1 : 0;

            const before = getScrollState(container);
            const pageText = document.body.innerText || "";
            if (/No more cars available/i.test(pageText) && isAtBottom(container)) break;
            if (attemptsWithoutNewListings >= 5 && isAtBottom(container)) break;
            if (attemptsWithoutNewListings >= 8 && before.scrollTop === previousScrollTop) break;

            previousScrollTop = before.scrollTop;
            scrollByPage(container);
            await sleep(900);
          }

          return Array.from(listingsById.values());
        })();
      },
      {
        minPrice: params.min_price,
        maxPrice: params.max_price,
        vehicleCardSelector: VEHICLE_CARD_SELECTOR,
        vehicleLinkSelector: VEHICLE_LINK_SELECTOR,
      }
    );
    debugLog("extracted listings", { count: listings.length, vehicleType });

    if (isDebugEnabled() && listings.length === 0) {
      const html = await page.content();
      const screenshot = await page.screenshot({ fullPage: true });
      await writeDebugArtifacts(page.url(), html, screenshot);
    }

    return listings as CarListing[];
  } finally {
    await page.close();
  }
}
