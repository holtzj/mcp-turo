import { newPage, waitForNavigation, sleep } from "../browser.js";
import type { CreateBookingParams, BookingResult, PriceBreakdown } from "../types.js";

export async function createBooking(params: CreateBookingParams): Promise<BookingResult> {
  const page = await newPage();

  try {
    // Navigate to the listing page
    const listingUrl = `https://turo.com/us/en/car-rental/united-states/vehicles/${params.listing_id}`;
    await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForNavigation(page);
    await sleep(2000);

    // Check if user is logged in
    const isLoggedIn = await page.evaluate(() => {
      const loginEl = document.querySelector(
        '[class*="login"], [class*="sign-in"], [href*="/login"]'
      );
      return !loginEl;
    });

    if (!isLoggedIn) {
      return {
        booking_id: "",
        status: "error",
        listing_id: params.listing_id,
        start_date: params.start_date,
        end_date: params.end_date,
        total_price: 0,
        breakdown: {
          daily_rate: 0,
          days: 0,
          subtotal: 0,
          turo_fee: 0,
          taxes: 0,
          total: 0,
        },
        confirmation_url: undefined,
      };
    }

    // Set booking dates via URL parameters
    const bookingUrl = new URL(listingUrl);
    bookingUrl.searchParams.set("startDate", params.start_date);
    bookingUrl.searchParams.set("endDate", params.end_date);
    bookingUrl.searchParams.set("startTime", "10:00");
    bookingUrl.searchParams.set("endTime", "10:00");

    await page.goto(bookingUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitForNavigation(page);
    await sleep(2000);

    // Extract price breakdown before booking
    const priceInfo = await page.evaluate(() => {
      const getText = (selector: string): string => {
        const el = document.querySelector(selector) as HTMLElement | null;
        return el?.textContent?.trim() || "";
      };

      const parsePrice = (text: string): number => {
        const match = text.match(/\$?([\d,]+\.?\d*)/);
        return match ? parseFloat(match[1].replace(",", "")) : 0;
      };

      // Try to extract breakdown items
      const breakdownItems: Record<string, number> = {};
      document
        .querySelectorAll('[class*="breakdown"] li, [class*="price"] li, [class*="summary"] li')
        .forEach((item) => {
          const labelEl = item.querySelector(
            '[class*="label"], [class*="name"], span:first-child'
          ) as HTMLElement | null;
          const valueEl = item.querySelector(
            '[class*="value"], [class*="amount"], span:last-child'
          ) as HTMLElement | null;
          if (labelEl && valueEl) {
            const label = labelEl.textContent?.trim().toLowerCase() || "";
            const value = parsePrice(valueEl.textContent || "");
            breakdownItems[label] = value;
          }
        });

      const dailyRateEl = document.querySelector(
        '[class*="dailyRate"], [class*="daily-rate"]'
      ) as HTMLElement | null;
      const daily_rate = parsePrice(dailyRateEl?.textContent || "") || breakdownItems["daily rate"] || 0;

      const totalEl = document.querySelector(
        '[class*="total"], [class*="Total"]'
      ) as HTMLElement | null;
      const total = parsePrice(totalEl?.textContent || "") || 0;

      return { breakdownItems, daily_rate, total };
    });

    // Look for the Book button
    const bookButton = await page.$(
      '[data-testid="book-button"], [class*="bookButton"], button[class*="book"]'
    );

    if (!bookButton) {
      return {
        booking_id: "",
        status: "unavailable",
        listing_id: params.listing_id,
        start_date: params.start_date,
        end_date: params.end_date,
        total_price: priceInfo.total,
        breakdown: buildBreakdown(priceInfo),
      };
    }

    // Add message to host if provided
    if (params.message_to_host) {
      const messageBox = await page.$(
        'textarea[class*="message"], textarea[placeholder*="message"], [class*="messageHost"] textarea'
      );
      if (messageBox) {
        await messageBox.click();
        await messageBox.fill(params.message_to_host);
      }
    }

    // Click book button
    await bookButton.click();
    await waitForNavigation(page);
    await sleep(3000);

    // Extract confirmation details
    const confirmation = await page.evaluate(() => {
      const urlMatch = window.location.href.match(/\/reservations\/([a-zA-Z0-9-]+)/);
      const bookingId = urlMatch ? urlMatch[1] : "";

      const statusEl = document.querySelector(
        '[class*="status"], [class*="confirmation"]'
      ) as HTMLElement | null;
      const status = statusEl?.textContent?.trim() || (bookingId ? "confirmed" : "pending");

      return { booking_id: bookingId, status, url: window.location.href };
    });

    const startDate = new Date(params.start_date);
    const endDate = new Date(params.end_date);
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const breakdown = buildBreakdown(priceInfo, days);

    return {
      booking_id: confirmation.booking_id,
      status: confirmation.status || "pending",
      listing_id: params.listing_id,
      start_date: params.start_date,
      end_date: params.end_date,
      total_price: breakdown.total || priceInfo.total,
      breakdown,
      confirmation_url: confirmation.url,
    };
  } finally {
    await page.close();
  }
}

function buildBreakdown(
  priceInfo: {
    breakdownItems: Record<string, number>;
    daily_rate: number;
    total: number;
  },
  days?: number
): PriceBreakdown {
  const items = priceInfo.breakdownItems;
  const daily_rate = priceInfo.daily_rate;
  const numDays = days || items["days"] || 1;
  const subtotal = items["subtotal"] || daily_rate * numDays;
  const turo_fee = items["turo fee"] || items["service fee"] || 0;
  const insurance_fee = items["insurance"] || items["protection"] || undefined;
  const taxes = items["taxes"] || items["tax"] || 0;
  const total = priceInfo.total || subtotal + turo_fee + (insurance_fee || 0) + taxes;

  return {
    daily_rate,
    days: numDays,
    subtotal,
    turo_fee,
    insurance_fee,
    taxes,
    total,
  };
}
