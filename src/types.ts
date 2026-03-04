export interface Article {
  id: number;
  title: string;
  excerpt: string;
  thumb: string | null;
}

export interface FeedPost extends Article {
  categories: string[];
  links: number[];
}

export interface FeedRequest {
  scores: Record<string, number>;
  seen: number[];
  batchSize?: number;
}

export interface FeedResponse {
  posts: FeedPost[];
}

export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  wikipediaDomain: string;
  defaultCategories: string[];
}
