export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface SyncPullResponse {
  changes: SyncChange[];
  serverTimestamp: string;
  hasMore: boolean;
}

export interface SyncChange {
  table: string;
  id: string;
  action: 'create' | 'update' | 'delete';
  data: Record<string, unknown> | null;
  timestamp: string;
}

export interface SyncPushRequest {
  changes: SyncChange[];
  clientTimestamp: string;
  deviceId: string;
}

export interface SyncPushResponse {
  accepted: number;
  rejected: number;
  conflicts: SyncConflict[];
  serverTimestamp: string;
}

export interface SyncConflict {
  table: string;
  id: string;
  clientValue: Record<string, unknown>;
  serverValue: Record<string, unknown>;
  resolution: 'server_wins' | 'client_wins' | 'merged';
}
