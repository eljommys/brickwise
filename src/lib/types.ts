export interface PfImage {
  small: string;
  medium: string;
}

export interface PfLocation {
  id: string;
  full_name: string;
  coordinates?: { lat: number; lon: number };
  slug: string;
  path: string;
  type: string;
  name: string;
  path_name: string;
}

export interface PfProperty {
  id: string;
  title: string;
  price: { value: number; currency: string; period: string };
  size?: { value: number; unit: string } | number;
  bedrooms?: number | string;
  bathrooms?: number | string;
  property_type: string;
  images: PfImage[];
  share_url: string;
  details_path: string;
  location: PfLocation;
  location_tree?: PfLocation[];
  amenity_names?: string[];
  amenities?: string[];
  price_per_area?: number;
  description?: string;
  listed_date?: string;
  broker?: { name?: string };
  agent?: { name?: string };
  similar_price_transactions?: {
    buy: SimilarTransaction[];
    rent: SimilarTransaction[];
  };
}

export interface SimilarTransaction {
  date: string;
  amount: string;
  size: number;
}

export interface PfTransaction {
  id: string;
  transactionDate: string;
  price: number;
  propertySize: number;
  pricePerSqft: number;
  bedrooms: number | string;
  propertyNumber: string;
  propertyType: string;
  locationName: string;
  contractStartDate?: string;
  contractEndDate?: string;
}

export interface SearchFilters {
  locationId?: string;
  locationLabel?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  bedrooms?: string[];
  bathrooms?: string[];
  propertyTypeId?: string;
  amenities?: string[];
  maxGymDistanceM?: number;
  maxPages?: number;
}

export interface ListingRow {
  id: string;
  url: string;
  title: string;
  price: number;
  size_sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string;
  tower_id: string | null;
  tower_slug: string | null;
  tower_name: string | null;
  city_slug: string | null;
  lat: number | null;
  lon: number | null;
  images_json: string;
  amenities_json: string;
  agent_json: string;
  price_per_sqft: number | null;
  description: string | null;
  first_seen_at: string;
  last_scraped_at: string;
}

export interface AnalysisRow {
  listing_id: string;
  gross_yield: number | null;
  asking_yield: number | null;
  median_rent: number | null;
  median_sale_price: number | null;
  rent_p25: number | null;
  rent_p75: number | null;
  sale_p25: number | null;
  sale_p75: number | null;
  rent_n: number;
  buy_n: number;
  gym_distance_m: number | null;
  gym_name: string | null;
  computed_at: string;
}

export interface YieldResult {
  gross_yield: number | null;
  asking_yield: number | null;
  median_rent: number | null;
  median_sale_price: number | null;
  rent_p25: number | null;
  rent_p75: number | null;
  sale_p25: number | null;
  sale_p75: number | null;
  rent_n: number;
  buy_n: number;
}
