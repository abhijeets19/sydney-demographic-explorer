export type Weight = 'p' | 'd';

export interface SchemaColumn {
  key: string;
  index: number;
  label: string;
  weight: Weight;
  universe: string;
  role: 'value' | 'notstated';
  sources: { file: string; short: string; long: string }[];
  lo?: number;
  hi?: number | null;
  sex?: 'm' | 'f';
  parent?: string;
  landlord?: string;
  mode?: string;
}

export interface SchemaGroup {
  id: string;
  tab: string;
  table: string;
  label: string;
  weight: Weight;
  universe: string;
  kind: 'categorical' | 'pyramid' | 'brackets' | 'ranked';
  columns: string[];
  unit?: string;
  caveat?: string;
  exclude_from_rank?: string[];
}

export interface SchemaMetric {
  key: string;
  label: string;
  unit: string;
  level: 'mb' | 'sa1';
  scale: 'log' | 'linear';
  prop: string;
  domain: [number, number];
}

export interface Schema {
  columns: SchemaColumn[];
  blocks: { p: [number, number]; d: [number, number] };
  groups: SchemaGroup[];
  metrics: SchemaMetric[];
}

export interface Benchmark {
  label: string;
  source: string;
  values: Record<string, number>;
}
