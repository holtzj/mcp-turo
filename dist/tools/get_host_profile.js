import { newPage, waitForNavigation, sleep } from "../browser.js";
export async function getHostProfile(hostId) {
    const page = await newPage();
    try {
        const url = `https://turo.com/us/en/drivers/${hostId}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await waitForNavigation(page);
        await sleep(2000);
        const profile = await page.evaluate((id) => {
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || "";
            };
            // Name
            const nameEl = document.querySelector('h1, [class*="driverName"], [class*="profileName"]');
            const name = nameEl?.textContent?.trim() || "Host";
            // Joined date
            const joinedEl = document.querySelector('[class*="joined"], [class*="member"]');
            const joinedText = joinedEl?.textContent?.trim() || "";
            const joined_date = joinedText || "Unknown";
            // Rating
            const ratingEl = document.querySelector('[class*="rating"], [aria-label*="rating"]');
            const ratingText = ratingEl?.getAttribute("aria-label") || ratingEl?.textContent || "0";
            const ratingMatch = ratingText.match(/([\d.]+)/);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
            // Trip count
            const tripEl = document.querySelector('[class*="trip"], [class*="count"]');
            const tripText = tripEl?.textContent || "";
            const tripMatch = tripText.match(/([\d,]+)/);
            const trip_count = tripMatch ? parseInt(tripMatch[1].replace(",", "")) : 0;
            // Response rate & time
            const responseEls = document.querySelectorAll('[class*="response"]');
            let response_rate = "N/A";
            let response_time = "N/A";
            responseEls.forEach((el) => {
                const text = el.textContent?.trim() || "";
                if (text.includes("%"))
                    response_rate = text;
                else if (text.includes("hour") || text.includes("minute"))
                    response_time = text;
            });
            // About
            const aboutEl = document.querySelector('[class*="about"], [class*="bio"]');
            const about = aboutEl?.textContent?.trim() || undefined;
            // All-star host / verified
            const allStarEl = document.querySelector('[class*="allStar"], [class*="all-star"]');
            const all_star_host = !!allStarEl;
            const verifiedEl = document.querySelector('[class*="verified"], [aria-label*="verified"]');
            const verified = !!verifiedEl;
            // Listings
            const listings = [];
            document
                .querySelectorAll('[class*="vehicleCard"], [class*="vehicle-card"], [class*="listing"]')
                .forEach((card, idx) => {
                if (idx >= 20)
                    return;
                try {
                    const link = card.querySelector("a");
                    const href = link?.href || "";
                    const idMatch = href.match(/\/vehicles\/(\d+)/);
                    const listingId = idMatch ? idMatch[1] : `listing-${idx}`;
                    const titleEl2 = card.querySelector('[class*="title"], [class*="name"], h2, h3');
                    const titleText = titleEl2?.textContent?.trim() || "";
                    const yearMatch = titleText.match(/(\d{4})/);
                    const yr = yearMatch ? parseInt(yearMatch[1]) : 0;
                    const parts = titleText.replace(/\d{4}\s*/, "").trim().split(" ");
                    const priceEl = card.querySelector('[class*="price"]');
                    const priceText = priceEl?.textContent || "";
                    const priceMatch = priceText.match(/\$?([\d,]+)/);
                    const dr = priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : 0;
                    const rEl = card.querySelector('[class*="rating"]');
                    const rText = rEl?.textContent || "0";
                    const rMatch = rText.match(/([\d.]+)/);
                    listings.push({
                        id: listingId,
                        make: parts[0] || "Unknown",
                        model: parts.slice(1).join(" ") || "Unknown",
                        year: yr,
                        daily_rate: dr,
                        rating: rMatch ? parseFloat(rMatch[1]) : 0,
                        trip_count: 0,
                        location: "",
                        listing_url: href,
                        host_name: name,
                        features: [],
                        vehicle_type: "Car",
                    });
                }
                catch {
                    // skip
                }
            });
            // Reviews
            const reviews = [];
            document
                .querySelectorAll('[class*="review"], [class*="Review"]')
                .forEach((reviewEl, idx) => {
                if (idx >= 10)
                    return;
                const authorEl = reviewEl.querySelector('[class*="author"], [class*="name"]');
                const ratingEl2 = reviewEl.querySelector('[class*="rating"]');
                const dateEl = reviewEl.querySelector('[class*="date"], time');
                const commentEl = reviewEl.querySelector('[class*="comment"], [class*="text"], p');
                const rText = ratingEl2?.getAttribute("aria-label") || ratingEl2?.textContent || "0";
                const rMatch = rText.match(/([\d.]+)/);
                reviews.push({
                    id: `host-review-${idx}`,
                    author: authorEl?.textContent?.trim() || "Guest",
                    rating: rMatch ? parseFloat(rMatch[1]) : 0,
                    date: dateEl?.getAttribute("datetime") || dateEl?.textContent?.trim() || "",
                    comment: commentEl?.textContent?.trim() || "",
                });
            });
            return {
                id,
                name,
                joined_date,
                rating,
                trip_count,
                response_rate,
                response_time,
                about,
                all_star_host,
                verified,
                listings,
                reviews,
            };
        }, hostId);
        return profile;
    }
    finally {
        await page.close();
    }
}
//# sourceMappingURL=get_host_profile.js.map