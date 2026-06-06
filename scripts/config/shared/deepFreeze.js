const FREEZABLE_TYPES = new Set(['object', 'function']);

function isFreezableValue(value) {
  return value !== null && FREEZABLE_TYPES.has(typeof value);
}

export function deepFreeze(target) {
  if (!isFreezableValue(target)) {
    return target;
  }

  if (Object.isFrozen(target)) {
    return target;
  }

  for (const value of Object.values(target)) {
    if (isFreezableValue(value)) {
      deepFreeze(value);
    }
  }

  return Object.freeze(target);
}
