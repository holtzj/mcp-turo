#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { searchCars } from "./tools/search_cars.js";
import { getCarDetails } from "./tools/get_car_details.js";
import { getHostProfile } from "./tools/get_host_profile.js";
import { createBooking } from "./tools/create_booking.js";
import { manageBooking } from "./tools/manage_booking.js";
import { closeBrowser } from "./browser.js";

const tools: Tool[] = [
  {
    name: "search_cars",
    description:
      "Search for available rental cars on Turo by location, dates, and optional filters such as price range and vehicle type.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "The pickup location (city, address, or airport code). Example: 'San Francisco, CA' or 'SFO'",
        },
        start_date: {
          type: "string",
          description: "Rental start date in YYYY-MM-DD format. Example: '2025-06-15'",
        },
        end_date: {
          type: "string",
          description: "Rental end date in YYYY-MM-DD format. Example: '2025-06-20'",
        },
        min_price: {
          type: "number",
          description: "Minimum daily price filter in USD (optional)",
        },
        max_price: {
          type: "number",
          description: "Maximum daily price filter in USD (optional)",
        },
        vehicle_type: {
          anyOf: [
            {
              type: "string",
              enum: ["car", "suv", "truck", "van", "minivan", "convertible", "luxury", "electric"],
            },
            {
              type: "array",
              items: {
                type: "string",
                enum: ["car", "suv", "truck", "van", "minivan", "convertible", "luxury", "electric"],
              },
              minItems: 1,
              uniqueItems: true,
            },
          ],
          description:
            "Filter by one or more vehicle types: 'car', 'suv', 'truck', 'van', 'minivan', 'convertible', 'luxury', 'electric' (optional)",
        },
        vehicle_types: {
          type: "array",
          items: {
            type: "string",
            enum: ["car", "suv", "truck", "van", "minivan", "convertible", "luxury", "electric"],
          },
          minItems: 1,
          uniqueItems: true,
          description:
            "Filter by multiple vehicle types. Prefer this for multi-type searches; vehicle_type also accepts an array for backward compatibility.",
        },
        min_seats: {
          type: "number",
          description: "Minimum number of seats required (optional)",
        },
      },
      required: ["location", "start_date", "end_date"],
    },
  },
  {
    name: "get_car_details",
    description:
      "Retrieve detailed information about a specific Turo car listing, including specs, features, reviews, cancellation policy, and host info.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: {
          type: "string",
          description:
            "The Turo listing ID (numeric string). Found in the listing URL: turo.com/us/en/car-rental/.../vehicles/{listing_id}",
        },
      },
      required: ["listing_id"],
    },
  },
  {
    name: "get_host_profile",
    description:
      "View a Turo host's profile including their ratings, reviews, response rate, and all their vehicle listings.",
    inputSchema: {
      type: "object",
      properties: {
        host_id: {
          type: "string",
          description:
            "The Turo host/driver ID. Found in the host profile URL: turo.com/us/en/drivers/{host_id}",
        },
      },
      required: ["host_id"],
    },
  },
  {
    name: "create_booking",
    description:
      "Create a new car booking/reservation on Turo. Requires the user to be logged in to their Turo account. Returns booking confirmation details and price breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: {
          type: "string",
          description: "The Turo listing ID to book",
        },
        start_date: {
          type: "string",
          description: "Rental start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "Rental end date in YYYY-MM-DD format",
        },
        message_to_host: {
          type: "string",
          description: "Optional message to send to the host with your booking request",
        },
      },
      required: ["listing_id", "start_date", "end_date"],
    },
  },
  {
    name: "manage_booking",
    description:
      "View, modify, or cancel an existing Turo booking. Use action='view' to see booking details, 'cancel' to cancel, or 'modify' to change dates.",
    inputSchema: {
      type: "object",
      properties: {
        booking_id: {
          type: "string",
          description: "The Turo booking/reservation ID",
        },
        action: {
          type: "string",
          description: "The action to perform: 'view', 'cancel', or 'modify'",
          enum: ["view", "cancel", "modify"],
        },
        new_start_date: {
          type: "string",
          description:
            "New rental start date in YYYY-MM-DD format (required for 'modify' action)",
        },
        new_end_date: {
          type: "string",
          description:
            "New rental end date in YYYY-MM-DD format (required for 'modify' action)",
        },
        message: {
          type: "string",
          description:
            "Optional message to include with a modification or cancellation request",
        },
      },
      required: ["booking_id", "action"],
    },
  },
];

const server = new Server(
  {
    name: "mcp-turo",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_cars": {
        const params = args as {
          location: string;
          start_date: string;
          end_date: string;
          min_price?: number;
          max_price?: number;
          vehicle_type?: string | string[];
          vehicle_types?: string[];
          min_seats?: number;
        };
        const results = await searchCars(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case "get_car_details": {
        const { listing_id } = args as { listing_id: string };
        const details = await getCarDetails(listing_id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(details, null, 2),
            },
          ],
        };
      }

      case "get_host_profile": {
        const { host_id } = args as { host_id: string };
        const profile = await getHostProfile(host_id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(profile, null, 2),
            },
          ],
        };
      }

      case "create_booking": {
        const params = args as {
          listing_id: string;
          start_date: string;
          end_date: string;
          message_to_host?: string;
        };
        const booking = await createBooking(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(booking, null, 2),
            },
          ],
        };
      }

      case "manage_booking": {
        const params = args as {
          booking_id: string;
          action: "view" | "cancel" | "modify";
          new_start_date?: string;
          new_end_date?: string;
          message?: string;
        };
        const result = await manageBooking(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean up browser on process exit
  process.on("SIGINT", async () => {
    await closeBrowser();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
