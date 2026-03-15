import { newPage, waitForNavigation, sleep } from "../browser.js";
import type { SearchCarsParams, CarListing } from "../types.js";

export async function searchCars(params: SearchCarsParams): Promise<CarListing[]> {
  const page = await newPage();

  try {
    // Build Turo search URL
    const baseUrl = "https://turo.com/us/en/search";
    const searchParams = new URLSearchParams();
    searchParams.set("location", params.location);
    searchParams.set("startDate", params.start_date);
    searchParams.set("endDate", params.end_date);
    searchParams.set("startTime", "10:00");
    searchParams.set("endTime", "10:00");

    if (params.vehicle_type) {
      searchParams.set("vehicleType", params.vehicle_type);
    }

    const url = `${baseUrl}?${searchParams.toString()}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForNavigation(page);

    // Wait for search results to load
    await page.waitForSelector('[data-testid="vehicle-card"], .vehicle-card, [class*="vehicleCard"]', {
      timeout: 15000,
    }).catch(() => null);

    await sleep(2000);

    // Extract car listings from search results
    const listings = await page.evaluate(
      ({ minPrice, maxPrice }: { minPrice?: number; maxPrice?: number }) => {
        const cards: NodeListOf<Element> = document.querySelectorAll(
          '[data-testid="vehicle-card"], [class*="vehicleCard"], [class*="vehicle-card"]'
        );

        const results: {
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
        }[] = [];

        cards.forEach((card) => {
          try {
            const link = card.querySelector("a") as HTMLAnchorElement | null;
            const href = link?.href || "";
            const idMatch = href.match(/\/vehicles\/(\d+)/);
            const id = idMatch ? idMatch[1] : Math.random().toString(36).slice(2);

            const titleEl = card.querySelector(
              '[class*="title"], [class*="name"], h2, h3'
            ) as HTMLElement | null;
            const titleText = titleEl?.textContent?.trim() || "";
            const yearMatch = titleText.match(/(\d{4})/);
            const year = yearMatch ? parseInt(yearMatch[1]) : 0;
            const nameParts = titleText.replace(/\d{4}\s*/, "").trim().split(" ");
            const make = nameParts[0] || "Unknown";
            const model = nameParts.slice(1).join(" ") || "Unknown";

            const priceEl = card.querySelector(
              '[class*="price"], [class*="rate"]'
            ) as HTMLElement | null;
            const priceText = priceEl?.textContent || "";
            const priceMatch = priceText.match(/\$?([\d,]+)/);
            const daily_rate = priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : 0;

            if (minPrice !== undefined && daily_rate < minPrice) return;
            if (maxPrice !== undefined && daily_rate > maxPrice) return;

            const ratingEl = card.querySelector(
              '[class*="rating"], [aria-label*="rating"]'
            ) as HTMLElement | null;
            const ratingText = ratingEl?.textContent || ratingEl?.getAttribute("aria-label") || "0";
            const ratingMatch = ratingText.match(/([\d.]+)/);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

            const tripEl = card.querySelector(
              '[class*="trip"], [class*="count"]'
            ) as HTMLElement | null;
            const tripText = tripEl?.textContent || "";
            const tripMatch = tripText.match(/([\d,]+)/);
            const trip_count = tripMatch ? parseInt(tripMatch[1].replace(",", "")) : 0;

            const locationEl = card.querySelector(
              '[class*="location"], [class*="distance"]'
            ) as HTMLElement | null;
            const location = locationEl?.textContent?.trim() || "";

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

            const typeEl = card.querySelector('[class*="type"], [class*="category"]') as HTMLElement | null;
            const vehicle_type = typeEl?.textContent?.trim() || "Car";

            results.push({
              id,
              make,
              model,
              year,
              daily_rate,
              rating,
              trip_count,
              location,
              listing_url: href,
              host_name,
              features,
              vehicle_type,
            });
          } catch {
            // Skip malformed cards
          }
        });

        return results;
      },
      { minPrice: params.min_price, maxPrice: params.max_price }
    );

    return listings as CarListing[];
  } finally {
    await page.close();
  }
}
