# mcp-turo

An MCP (Model Context Protocol) server for automating Turo peer-to-peer car rental interactions. Built with stealth browser automation via [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright).

## Tools

| Tool | Description |
|------|-------------|
| `search_cars` | Search available cars by location, dates, and optional filters (price range, vehicle type) |
| `get_car_details` | Get detailed info about a specific listing: specs, photos, reviews, policies |
| `get_host_profile` | View a host's ratings, reviews, response rate, and all their vehicles |
| `create_booking` | Reserve a car (requires active Turo session) |
| `manage_booking` | View, modify, or cancel an existing booking |

## Requirements

- Node.js 18+
- A Turo account (required for `create_booking` and `manage_booking`)

## Installation

```bash
npm install
npm run build
```

Install Playwright browsers (required by patchright):

```bash
npx patchright install chromium
```

## Usage

### Run directly

```bash
node dist/index.js
```

### Claude Desktop configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "turo": {
      "command": "node",
      "args": ["/path/to/mcp-turo/dist/index.js"]
    }
  }
}
```

Or if installed globally via npm:

```json
{
  "mcpServers": {
    "turo": {
      "command": "striderlabs-mcp-turo"
    }
  }
}
```

## Tool Reference

### `search_cars`

Search for available Turo rentals.

**Parameters:**
- `location` (required): Pickup location — city, address, or airport code (e.g. `"San Francisco, CA"`, `"SFO"`)
- `start_date` (required): Rental start date in `YYYY-MM-DD` format
- `end_date` (required): Rental end date in `YYYY-MM-DD` format
- `min_price` (optional): Minimum daily price in USD
- `max_price` (optional): Maximum daily price in USD
- `vehicle_type` (optional): One of `car`, `suv`, `truck`, `van`, `minivan`, `convertible`, `luxury`, `electric`
- `min_seats` (optional): Minimum number of seats

**Returns:** Array of car listings with ID, make/model/year, daily rate, rating, trip count, and host info.

---

### `get_car_details`

Get full details for a specific listing.

**Parameters:**
- `listing_id` (required): Numeric listing ID from the Turo URL (`/vehicles/{id}`)

**Returns:** Detailed listing object including description, vehicle specs, photos, reviews, guidelines, and cancellation policy.

---

### `get_host_profile`

View a host's public profile.

**Parameters:**
- `host_id` (required): Host ID from the Turo profile URL (`/drivers/{id}`)

**Returns:** Host profile with ratings, reviews, response rate/time, verified status, all-star status, and their vehicle listings.

---

### `create_booking`

Book a car on Turo.

> **Note:** Requires an active authenticated Turo session in the browser. The server uses your local browser profile if configured.

**Parameters:**
- `listing_id` (required): The listing to book
- `start_date` (required): Start date in `YYYY-MM-DD` format
- `end_date` (required): End date in `YYYY-MM-DD` format
- `message_to_host` (optional): Message to send to the host

**Returns:** Booking confirmation with ID, status, price breakdown, and confirmation URL.

---

### `manage_booking`

View or modify an existing booking.

**Parameters:**
- `booking_id` (required): Your Turo reservation ID
- `action` (required): One of `view`, `cancel`, `modify`
- `new_start_date` (optional, required for `modify`): New start date
- `new_end_date` (optional, required for `modify`): New end date
- `message` (optional): Message to include with the request

**Returns:** For `view`: full booking details. For `cancel`/`modify`: success status and message.

## License

MIT — Strider Labs <hello@striderlabs.ai>
