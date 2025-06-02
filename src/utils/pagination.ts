export const ITEMS_PER_PAGE = 100;

export interface PaginationArgs {
  index: number;
}

export interface PaginationParams {
  offset?: number;
  limit?: number;
  [key: string]: any; // Allow additional filter properties
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export function getPaginationParams(index: number): {
  offset: number;
  limit: number;
} {
  return {
    offset: index * ITEMS_PER_PAGE,
    limit: ITEMS_PER_PAGE
  };
}

export function createPaginatedResult<T>(
  items: T[],
  total: number,
  index: number
): PaginatedResult<T> {
  const offset = index * ITEMS_PER_PAGE;
  return {
    items,
    total,
    hasMore: offset + ITEMS_PER_PAGE < total
  };
}