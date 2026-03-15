import { newPage, waitForNavigation, sleep } from "../browser.js";
import type { ManageBookingParams, BookingDetails, CarListing, PriceBreakdown } from "../types.js";

export async function manageBooking(params: ManageBookingParams): Promise<BookingDetails | { success: boolean; message: string }> {
  const page = await newPage();

  try {
    const reservationUrl = `https://turo.com/us/en/reservation/${params.booking_id}`;
    await page.goto(reservationUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForNavigation(page);
    await sleep(2000);

    if (params.action === "view") {
      const details = await page.evaluate((bookingId: string) => {
        const getText = (selector: string): string => {
          const el = document.querySelector(selector) as HTMLElement | null;
          return el?.textContent?.trim() || "";
        };

        const parsePrice = (text: string): number => {
          const match = text.match(/\$?([\d,]+\.?\d*)/);
          return match ? parseFloat(match[1].replace(",", "")) : 0;
        };

        // Status
        const statusEl = document.querySelector('[class*="status"]') as HTMLElement | null;
        const status = statusEl?.textContent?.trim() || "unknown";

        // Car details
        const titleEl = document.querySelector('h1, h2, [class*="vehicleName"]') as HTMLElement | null;
        const titleText = titleEl?.textContent?.trim() || "";
        const yearMatch = titleText.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;
        const nameParts = titleText.replace(/\d{4}\s*/, "").trim().split(" ");

        const carLinkEl = document.querySelector('a[href*="/vehicles/"]') as HTMLAnchorElement | null;
        const carHref = carLinkEl?.href || "";
        const carIdMatch = carHref.match(/\/vehicles\/(\d+)/);
        const carId = carIdMatch ? carIdMatch[1] : "";

        const priceEl = document.querySelector('[class*="dailyRate"], [class*="daily-rate"]') as HTMLElement | null;
        const daily_rate = parsePrice(priceEl?.textContent || "");

        // Dates
        const dateEls = document.querySelectorAll('[class*="date"], time');
        let start_date = "";
        let end_date = "";
        if (dateEls.length >= 2) {
          start_date = (dateEls[0] as HTMLElement).getAttribute("datetime") || (dateEls[0] as HTMLElement).textContent?.trim() || "";
          end_date = (dateEls[1] as HTMLElement).getAttribute("datetime") || (dateEls[1] as HTMLElement).textContent?.trim() || "";
        }

        // Total price
        const totalEl = document.querySelector('[class*="total"]') as HTMLElement | null;
        const total_price = parsePrice(totalEl?.textContent || "");

        // Price breakdown
        const breakdownItems: Record<string, number> = {};
        document.querySelectorAll('[class*="breakdown"] li, [class*="price"] li').forEach((item) => {
          const labelEl = item.querySelector('span:first-child') as HTMLElement | null;
          const valueEl = item.querySelector('span:last-child') as HTMLElement | null;
          if (labelEl && valueEl) {
            const label = labelEl.textContent?.trim().toLowerCase() || "";
            breakdownItems[label] = parsePrice(valueEl.textContent || "");
          }
        });

        const breakdown: {
          daily_rate: number;
          days: number;
          subtotal: number;
          turo_fee: number;
          insurance_fee?: number;
          taxes: number;
          total: number;
        } = {
          daily_rate,
          days: breakdownItems["days"] || 1,
          subtotal: breakdownItems["subtotal"] || total_price,
          turo_fee: breakdownItems["turo fee"] || breakdownItems["service fee"] || 0,
          insurance_fee: breakdownItems["insurance"] || breakdownItems["protection"] || undefined,
          taxes: breakdownItems["taxes"] || breakdownItems["tax"] || 0,
          total: total_price,
        };

        // Host info
        const hostEl = document.querySelector('[class*="hostName"], [class*="host-name"]') as HTMLElement | null;
        const host_name = hostEl?.textContent?.trim() || "Host";

        const hostPhoneEl = document.querySelector('[class*="phone"], [href^="tel:"]') as HTMLElement | null;
        const host_phone = hostPhoneEl?.textContent?.trim() || hostPhoneEl?.getAttribute("href")?.replace("tel:", "") || undefined;

        // Pickup instructions
        const pickupEl = document.querySelector('[class*="pickup"], [class*="instruction"]') as HTMLElement | null;
        const pickup_instructions = pickupEl?.textContent?.trim() || undefined;

        // Created/modified dates
        const createdEl = document.querySelector('[class*="created"], [class*="booked"]') as HTMLElement | null;
        const created_at = createdEl?.getAttribute("datetime") || createdEl?.textContent?.trim() || new Date().toISOString();

        const modifiedEl = document.querySelector('[class*="modified"], [class*="updated"]') as HTMLElement | null;
        const modified_at = modifiedEl?.getAttribute("datetime") || modifiedEl?.textContent?.trim() || undefined;

        const listing: {
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
        } = {
          id: carId,
          make: nameParts[0] || "Unknown",
          model: nameParts.slice(1).join(" ") || "Unknown",
          year,
          daily_rate,
          rating: 0,
          trip_count: 0,
          location: "",
          listing_url: carHref,
          host_name,
          features: [],
          vehicle_type: "Car",
        };

        return {
          booking_id: bookingId,
          status,
          listing,
          start_date,
          end_date,
          total_price,
          breakdown,
          host_name,
          host_phone,
          pickup_instructions,
          created_at,
          modified_at,
        };
      }, params.booking_id);

      return details as BookingDetails;
    }

    if (params.action === "cancel") {
      // Find cancel button
      const cancelButton = await page.$(
        '[data-testid="cancel-button"], button[class*="cancel"], a[class*="cancel"]'
      );

      if (!cancelButton) {
        return { success: false, message: "Cancel option not found. Booking may not be cancellable at this time." };
      }

      await cancelButton.click();
      await waitForNavigation(page);
      await sleep(2000);

      // Confirm cancellation if a confirmation dialog appears
      const confirmButton = await page.$(
        '[data-testid="confirm-cancel"], button[class*="confirm"]'
      );
      if (confirmButton) {
        await confirmButton.click();
        await waitForNavigation(page);
        await sleep(2000);
      }

      const result = await page.evaluate(() => {
        const successEl = document.querySelector('[class*="success"], [class*="cancelled"]') as HTMLElement | null;
        return { success: !!successEl, message: successEl?.textContent?.trim() || "Cancellation processed" };
      });

      return result;
    }

    if (params.action === "modify") {
      if (!params.new_start_date || !params.new_end_date) {
        return { success: false, message: "new_start_date and new_end_date are required for modify action" };
      }

      // Find modify/change dates button
      const modifyButton = await page.$(
        '[data-testid="modify-button"], button[class*="modify"], button[class*="change"], a[class*="modify"]'
      );

      if (!modifyButton) {
        return { success: false, message: "Modify option not found. Booking may not be modifiable at this time." };
      }

      await modifyButton.click();
      await waitForNavigation(page);
      await sleep(2000);

      // Try to update dates in the modification form
      const startInput = await page.$(
        'input[name*="start"], input[placeholder*="start"], input[type="date"]'
      );
      if (startInput) {
        await startInput.fill(params.new_start_date);
      }

      const endInput = await page.$(
        'input[name*="end"], input[placeholder*="end"], input[type="date"]:last-of-type'
      );
      if (endInput) {
        await endInput.fill(params.new_end_date);
      }

      if (params.message) {
        const messageBox = await page.$('textarea[class*="message"], textarea[placeholder*="message"]');
        if (messageBox) {
          await messageBox.fill(params.message);
        }
      }

      // Submit modification
      const submitButton = await page.$(
        'button[type="submit"], [data-testid="submit-modify"], button[class*="submit"]'
      );
      if (submitButton) {
        await submitButton.click();
        await waitForNavigation(page);
        await sleep(2000);
      }

      const result = await page.evaluate(() => {
        const successEl = document.querySelector('[class*="success"], [class*="modified"], [class*="confirmed"]') as HTMLElement | null;
        return {
          success: !!successEl,
          message: successEl?.textContent?.trim() || "Modification request submitted",
        };
      });

      return result;
    }

    return { success: false, message: `Unknown action: ${params.action}` };
  } finally {
    await page.close();
  }
}
