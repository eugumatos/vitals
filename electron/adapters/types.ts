export interface Snapshot {
  source: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface Anomaly {
  source: string;
  severity: 'warning' | 'critical';
  label: string;
  detail: string;
  timestamp: number;
}

export interface Adapter {
  name: string;
  isConfigured(): boolean;
  fetchSnapshot(): Promise<Snapshot>;
  detectAnomalies(history: Snapshot[]): Anomaly[];
}
