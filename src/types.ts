export type RemotePost = {
  id: string;
  displayName: string;
  body: string;
  lat: number;
  lng: number;
  createdAt: string;
  locked?: number | boolean;
};

export type Reply = {
  id: string;
  displayName: string;
  body: string;
  createdAt: string;
};

export type Cluster = {
  key: string;
  lat: number;
  lng: number;
  count: number;
  /** Representative preview when zoomed enough */
  preview?: string;
  postIds: string[];
  intensity: number; // posts per coarse cell, for “heat” visuals
};
