export type FlatResourceMap = Record<string, string>;
import { distance } from 'fastest-levenshtein';
import type { InsertOrderStrategy } from './config';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isObjectNested(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (isPlainObject((value as Record<string, unknown>)[key])) {
      return true;
    }
  }

  return false;
}

export function flattenObject(value: unknown, prefix = '', separator = '.'): FlatResourceMap {
  const flattened: FlatResourceMap = {};

  if (!isPlainObject(value)) {
    return flattened;
  }

  for (const key of Object.keys(value)) {
    const next = (value as Record<string, unknown>)[key];
    const nextKey = prefix ? `${prefix}${separator}${key}` : key;

    if (isPlainObject(next)) {
      Object.assign(flattened, flattenObject(next, nextKey, separator));
    } else {
      flattened[nextKey] = String(next);
    }
  }

  return flattened;
}

export function unflattenObject(map: FlatResourceMap, separator = '.'): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const flatKey of Object.keys(map)) {
    const segments = flatKey.split(separator);
    let current: Record<string, unknown> = result;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!isPlainObject(current[segment])) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    current[segments[segments.length - 1]] = map[flatKey];
  }

  return result;
}

/**
 * Compute a final ordered list of keys based on:
 * - initialKeys: original key order from the file before modifications
 * - currentKeys: keys present after modifications
 * - createdKeys: keys that were newly created, in creation order
 * - strategy: how to place new keys (append | nearby | sort)
 */
export function orderKeys(
  initialKeys: string[],
  currentKeys: string[],
  createdKeys: string[],
  strategy: InsertOrderStrategy
): string[] {
  // Ensure uniqueness and preserve order of inputs
  const baseKeys = initialKeys.filter(k => currentKeys.includes(k));
  const newKeys = createdKeys.filter(k => currentKeys.includes(k));

  if (strategy === 'sort') {
    return [...currentKeys].sort((a, b) => a.localeCompare(b));
  }

  if (strategy === 'append') {
    // Keep base order, then append new keys by their creation order
    const appended = [...baseKeys];
    for (const k of newKeys) {
      if (!appended.includes(k)) appended.push(k);
    }
    // Include any remaining (unexpected) keys not in initial or created (defensive)
    for (const k of currentKeys) {
      if (!appended.includes(k)) appended.push(k);
    }
    return appended;
  }

  // nearby strategy
  const result: string[] = [...baseKeys];
  // Build a neighbor pool only from original keys to avoid chaining to other new keys
  const neighborPool = baseKeys.length ? baseKeys : []; // if empty, behave like append

  for (const k of newKeys) {
    if (!neighborPool.length) {
      result.push(k);
      continue;
    }
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < neighborPool.length; i++) {
      const candidate = neighborPool[i];
      const d = distance(k, candidate);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    // Insert after the closest neighbor's current position in result
    const anchor = neighborPool[bestIdx];
    const insertAt = Math.max(result.indexOf(anchor) + 1, 0);
    result.splice(insertAt, 0, k);
  }

  // Include any other keys not covered, preserving their current order
  for (const k of currentKeys) {
    if (!result.includes(k)) result.push(k);
  }
  return result;
}

/**
 * Rebuild a flat map object using the provided order strategy.
 * initialBefore: snapshot of file content before modifications
 * currentAfter: content after applying modifications
 */
export function reorderFlatMap(
  initialBefore: FlatResourceMap,
  currentAfter: FlatResourceMap,
  createdKeys: string[],
  strategy: InsertOrderStrategy
): FlatResourceMap {
  const initialKeys = Object.keys(initialBefore);
  const currentKeys = Object.keys(currentAfter);
  const orderedKeys = orderKeys(initialKeys, currentKeys, createdKeys, strategy);
  const out: FlatResourceMap = {};
  for (const k of orderedKeys) {
    out[k] = currentAfter[k];
  }
  return out;
}

export function setNestedValue(target: Record<string, unknown>, key: string, value: string, separator = '.'): void {
  const segments = key.split(separator);
  let current: Record<string, unknown> = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!isPlainObject(current[segment])) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}

export function deleteNestedKey(target: Record<string, unknown>, key: string, separator = '.'): void {
  const segments = key.split(separator);
  let current: Record<string, unknown> | undefined = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!isPlainObject(current?.[segment])) {
      return;
    }
    current = current?.[segment] as Record<string, unknown>;
  }

  if (isPlainObject(current)) {
    delete current[segments[segments.length - 1]];
  }
}
