export interface Shot {
  id: string;
  kind: 'performance' | 'map' | 'metric' | 'title';
  startSeconds: number;
  endSeconds: number;
  purpose: string;
  onScreenText: string[];
  factIds: string[];
  assets: string[];
  performanceDirection?: string;
}

export interface Manifest {
  project: string;
  render: {width: number; height: number; fps: number; durationSeconds: number};
  style: {palette: string[]; typefaces: string[]; texture: string};
  shots: Shot[];
}

export interface FactPack {
  claims: Array<{id: string; text: string; status: 'draft' | 'verified'}>;
}

export interface GeoJson {
  features?: Array<{geometry?: {type?: string; coordinates?: number[][]}}>;
}
