import { newPage, waitForNavigation, sleep } from "../browser.js";
import type { CarDetails, Review } from "../types.js";

export async function getCarDetails(listingId: string): Promise<CarDetails> {
  const page = await newPage();

  try {
    const url = `https://turo.com/us/en/car-rental/united-states/vehicles/${listingId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForNavigation(page);
    await sleep(2000);

    const details = await page.evaluate((id: string) => {
      const getText = (selector: string): string => {
        const el = document.querySelector(selector) as HTMLElement | null;
        return el?.textContent?.trim() || "";
      };

      const getAttr = (selector: string, attr: string): string => {
        const el = document.querySelector(selector);
        return el?.getAttribute(attr) || "";
      };

      // Title / name
      const titleEl = document.querySelector(
        'h1, [class*="vehicleName"], [class*="vehicle-name"]'
      ) as HTMLElement | null;
      const titleText = titleEl?.textContent?.trim() || "";
      const yearMatch = titleText.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;
      const nameParts = titleText.replace(/\d{4}\s*/, "").trim().split(" ");
      const make = nameParts[0] || "Unknown";
      const model = nameParts.slice(1).join(" ") || "Unknown";

      // Price
      const priceEl = document.querySelector(
        '[class*="price"], [class*="dailyRate"]'
      ) as HTMLElement | null;
      const priceText = priceEl?.textContent || "";
      const priceMatch = priceText.match(/\$?([\d,]+)/);
      const daily_rate = priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : 0;

      // Rating
      const ratingEl = document.querySelector(
        '[class*="rating"], [aria-label*="rating"]'
      ) as HTMLElement | null;
      const ratingText = ratingEl?.textContent || ratingEl?.getAttribute("aria-label") || "0";
      const ratingMatch = ratingText.match(/([\d.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

      // Trip count
      const tripEl = document.querySelector('[class*="trip"]') as HTMLElement | null;
      const tripText = tripEl?.textContent || "";
      const tripMatch = tripText.match(/([\d,]+)/);
      const trip_count = tripMatch ? parseInt(tripMatch[1].replace(",", "")) : 0;

      // Location
      const locationEl = document.querySelector(
        '[class*="location"], [class*="address"]'
      ) as HTMLElement | null;
      const location = locationEl?.textContent?.trim() || "";

      // Description
      const descEl = document.querySelector(
        '[class*="description"], [class*="about"]'
      ) as HTMLElement | null;
      const description = descEl?.textContent?.trim() || "";

      // Host
      const hostNameEl = document.querySelector(
        '[class*="hostName"], [class*="host-name"]'
      ) as HTMLElement | null;
      const host_name = hostNameEl?.textContent?.trim() || "Host";

      const hostLinkEl = document.querySelector(
        'a[href*="/profile/"]'
      ) as HTMLAnchorElement | null;
      const hostHref = hostLinkEl?.href || "";
      const hostIdMatch = hostHref.match(/\/profile\/(\d+)/);
      const host_id = hostIdMatch ? hostIdMatch[1] : "";

      // Vehicle specs
      const specsMap: Record<string, string> = {};
      document.querySelectorAll('[class*="spec"], [class*="detail"]').forEach((el) => {
        const labelEl = el.querySelector('[class*="label"], dt') as HTMLElement | null;
        const valueEl = el.querySelector('[class*="value"], dd') as HTMLElement | null;
        if (labelEl && valueEl) {
          specsMap[labelEl.textContent?.trim().toLowerCase() || ""] =
            valueEl.textContent?.trim() || "";
        }
      });

      // Photos
      const photos: string[] = [];
      document.querySelectorAll('img[src*="turo"], img[src*="cdn"]').forEach((img) => {
        const src = (img as HTMLImageElement).src;
        if (src && !photos.includes(src)) photos.push(src);
      });

      // Features / badges
      const features: string[] = [];
      document
        .querySelectorAll('[class*="feature"], [class*="badge"], [class*="amenity"]')
        .forEach((el) => {
          const text = (el as HTMLElement).textContent?.trim();
          if (text && !features.includes(text)) features.push(text);
        });

      // Guidelines
      const guidelines: string[] = [];
      document
        .querySelectorAll('[class*="guideline"], [class*="rule"], [class*="policy"] li')
        .forEach((el) => {
          const text = (el as HTMLElement).textContent?.trim();
          if (text && !guidelines.includes(text)) guidelines.push(text);
        });

      // Reviews
      const reviews: Review[] = [];
      document
        .querySelectorAll('[class*="review"], [class*="Review"]')
        .forEach((reviewEl, idx) => {
          if (idx >= 10) return;
          const authorEl = reviewEl.querySelector(
            '[class*="author"], [class*="name"]'
          ) as HTMLElement | null;
          const ratingEl2 = reviewEl.querySelector(
            '[class*="rating"]'
          ) as HTMLElement | null;
          const dateEl = reviewEl.querySelector(
            '[class*="date"], time'
          ) as HTMLElement | null;
          const commentEl = reviewEl.querySelector(
            '[class*="comment"], [class*="text"], p'
          ) as HTMLElement | null;

          const rText = ratingEl2?.getAttribute("aria-label") || ratingEl2?.textContent || "0";
          const rMatch = rText.match(/([\d.]+)/);

          reviews.push({
            id: `review-${idx}`,
            author: authorEl?.textContent?.trim() || "Guest",
            rating: rMatch ? parseFloat(rMatch[1]) : 0,
            date:
              dateEl?.getAttribute("datetime") || dateEl?.textContent?.trim() || "",
            comment: commentEl?.textContent?.trim() || "",
          });
        });

      // Cancellation policy
      const cancelEl = document.querySelector(
        '[class*="cancellation"], [class*="cancel"]'
      ) as HTMLElement | null;
      const cancellation_policy = cancelEl?.textContent?.trim() || "See listing for details";

      // Minimum age
      const ageEl = document.querySelector('[class*="age"]') as HTMLElement | null;
      const ageText = ageEl?.textContent || "";
      const ageMatch = ageText.match(/(\d+)/);
      const minimum_age = ageMatch ? parseInt(ageMatch[1]) : 21;

      const listing_url = window.location.href;

      return {
        id,
        make,
        model,
        year,
        daily_rate,
        rating,
        trip_count,
        location,
        listing_url,
        host_name,
        host_id,
        description,
        features,
        guidelines,
        photos,
        reviews,
        cancellation_policy,
        minimum_age,
        vehicle_type: specsMap["type"] || specsMap["category"] || "Car",
        engine: specsMap["engine"] || undefined,
        transmission: specsMap["transmission"] || undefined,
        fuel_type: specsMap["fuel type"] || specsMap["fuel"] || undefined,
        mpg: specsMap["mpg"] ? parseFloat(specsMap["mpg"]) : undefined,
        odometer: specsMap["odometer"]
          ? parseInt(specsMap["odometer"].replace(/,/g, ""))
          : undefined,
      };
    }, listingId);

    return details as CarDetails;
  } finally {
    await page.close();
  }
}
