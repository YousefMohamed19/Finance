/** The seven default jars. `remainder: true` marks the jar that receives rounding leftovers. */
export interface JarDefinition {
  key: string;
  name: string;
  icon: string;
  percentBp: number; // basis points: 100% = 10000
  remainder?: boolean;
}

export const DEFAULT_JARS: JarDefinition[] = [
  { key: 'god', name: 'For God', icon: '🤲', percentBp: 1000 },
  { key: 'future', name: 'Future Project', icon: '🚀', percentBp: 1500 },
  { key: 'big', name: 'Big Purchases', icon: '🚗', percentBp: 1500 },
  { key: 'fun', name: 'Fun', icon: '🎉', percentBp: 1000 },
  { key: 'transport', name: 'Transport', icon: '🚕', percentBp: 1000 },
  { key: 'emergency', name: 'Emergency', icon: '🛟', percentBp: 1000 },
  { key: 'me', name: 'For Me', icon: '🙂', percentBp: 3000, remainder: true },
];

export const TOTAL_BP = 10000;
