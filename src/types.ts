export type Scalar = string | number | boolean | null;
export type JsonValue = Scalar | JsonValue[] | { [key: string]: JsonValue };

export interface ProviderConfig {
  adapter: string;
  env?: string;
  options?: Record<string, JsonValue>;
}

export interface PropDefinition {
  id: string;
  kind: string;
  capability?: string;
  prompt: string;
  provider: string;
  model?: string;
  variants: number;
  input: Record<string, JsonValue>;
  output?: {
    extension?: string;
    mediaType?: string;
  };
  checks?: {
    audio?: AudioChecks;
  };
  tags: string[];
}

export interface AudioChecks {
  durationSeconds?: { min?: number; max?: number };
  sampleRates?: number[];
  channels?: number[];
  minRmsDbfs?: number;
  maxPeakDbfs?: number;
  maxClippedRatio?: number;
  maxLeadingSilenceSeconds?: number;
  maxTrailingSilenceSeconds?: number;
}

export interface Propfile {
  version: 1;
  project: string;
  description?: string;
  outputDir: string;
  style?: {
    description?: string;
    references: string[];
    palette: string[];
  };
  providers: Record<string, ProviderConfig>;
  props: PropDefinition[];
}

export interface GeneratedOutput {
  bytes: Uint8Array;
  extension: string;
  mediaType: string;
  providerMetadata?: Record<string, JsonValue>;
}

export interface GenerateContext {
  projectRoot: string;
  runId: string;
  prop: PropDefinition;
  capability: string;
  parameters: Record<string, JsonValue>;
  providerName: string;
  provider: ProviderConfig;
  variant: number;
  style?: Propfile["style"];
}

export interface Adapter {
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly string[];
  check(config: ProviderConfig): Promise<{ ok: boolean; message: string }>;
  generate(context: GenerateContext): Promise<GeneratedOutput[]>;
}

export interface ArtifactRecord {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  variant: number;
  inspection?: Record<string, JsonValue>;
  checks?: ArtifactCheck[];
  providerMetadata?: Record<string, JsonValue>;
}

export interface ArtifactCheck {
  name: string;
  status: "passed" | "failed";
  message: string;
  actual?: JsonValue;
  expected?: JsonValue;
}

export interface PropRunRecord {
  id: string;
  kind: string;
  capability: string;
  prompt: string;
  provider: string;
  adapter: string;
  adapterVersion: string;
  model?: string;
  status: "planned" | "running" | "succeeded" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  artifacts: ArtifactRecord[];
}

export interface RunRecord {
  schemaVersion: 1;
  runId: string;
  project: string;
  propfile: string;
  propfileSha256: string;
  startedAt: string;
  completedAt?: string;
  status: "planned" | "running" | "succeeded" | "partial" | "failed";
  props: PropRunRecord[];
  tool: {
    name: "propshop";
    version: string;
    node: string;
    platform: string;
  };
}
