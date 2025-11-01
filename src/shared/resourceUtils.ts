export type FlatResourceMap = Record<string, string>;

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
