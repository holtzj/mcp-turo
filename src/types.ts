export interface SearchCarsParams {
  location: string;
  start_date: string;
  end_date: string;
  min_price?: number;
  max_price?: number;
  vehicle_type?: string;
  min_seats?: number;
}

export interface CarListing {
  id: string;
  make: string;
  model: string;
  year: number;
  daily_rate: number;
  rating: number;
  trip_count: number;
  location: string;
  image_url?: string;
  listing_url: string;
  host_name: string;
  features: string[];
  vehicle_type: string;
}

export interface CarDetails extends CarListing {
  description: string;
  host_id: string;
  odometer?: number;
  engine?: string;
  transmission?: string;
  fuel_type?: string;
  mpg?: number;
  minimum_age: number;
  cancellation_policy: string;
  guidelines: string[];
  photos: string[];
  reviews: Review[];
  availability_calendar?: AvailabilitySlot[];
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
}

export interface HostProfile {
  id: string;
  name: string;
  joined_date: string;
  rating: number;
  trip_count: number;
  response_rate: string;
  response_time: string;
  about?: string;
  all_star_host: boolean;
  verified: boolean;
  listings: CarListing[];
  reviews: Review[];
}

export interface AvailabilitySlot {
  date: string;
  available: boolean;
}

export interface CreateBookingParams {
  listing_id: string;
  start_date: string;
  end_date: string;
  message_to_host?: string;
}

export interface BookingResult {
  booking_id: string;
  status: string;
  listing_id: string;
  start_date: string;
  end_date: string;
  total_price: number;
  breakdown: PriceBreakdown;
  confirmation_url?: string;
}

export interface PriceBreakdown {
  daily_rate: number;
  days: number;
  subtotal: number;
  turo_fee: number;
  insurance_fee?: number;
  taxes: number;
  total: number;
}

export interface ManageBookingParams {
  booking_id: string;
  action: "view" | "cancel" | "modify";
  new_start_date?: string;
  new_end_date?: string;
  message?: string;
}

export interface BookingDetails {
  booking_id: string;
  status: string;
  listing: CarListing;
  start_date: string;
  end_date: string;
  total_price: number;
  breakdown: PriceBreakdown;
  host_name: string;
  host_phone?: string;
  pickup_instructions?: string;
  created_at: string;
  modified_at?: string;
}
