import { ConfigService } from '@nestjs/config';

/**
 * `ConfigService.getOrThrow` only rejects a key that is absent, so `FOO=` in
 * an .env arrives as an empty string and sails through. For a secret, a base
 * URL or an API key that is the same as not setting it, and the damage shows
 * up far from the cause: an HMAC keyed with '' accepts forged signatures.
 *
 * These treat blank as missing, and are meant to be called while the app is
 * starting so a bad setting stops the boot.
 */
export function requireSetting(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) {
    throw new Error(`Missing configuration: ${key} is not set`);
  }
  return value;
}

export function optionalSetting(
  config: ConfigService,
  key: string,
): string | undefined {
  return config.get<string>(key)?.trim() || undefined;
}

/** Rejects a non-numeric value instead of letting NaN through. */
export function numberSetting(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = optionalSetting(config, key);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid configuration: ${key} must be a number ("${raw}")`,
    );
  }
  return value;
}
