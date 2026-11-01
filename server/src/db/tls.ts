import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface DatabaseTlsConfiguration {
  enabled: boolean;
  inlineCa?: string;
  caPath?: string;
}

export interface VerifiedDatabaseTlsOptions {
  rejectUnauthorized: true;
  ca?: string;
}

function validateCertificateChain(value: string): string {
  const normalized = value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .trim();
  const certificatePattern = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  const certificates = [...normalized.matchAll(certificatePattern)];
  const remainder = normalized.replace(certificatePattern, '').trim();
  if (certificates.length === 0 || remainder.length > 0) {
    throw new Error('Invalid database CA certificate configuration.');
  }

  try {
    for (const match of certificates) {
      if (!new X509Certificate(match[0]).ca) throw new Error('Not a CA certificate.');
    }
  } catch {
    throw new Error('Invalid database CA certificate configuration.');
  }
  return certificates.map(match => match[0]).join('\n');
}

/** Builds verified PostgreSQL TLS options. A configured CA file takes precedence over inline PEM. */
export function databaseSslOptions(configuration: DatabaseTlsConfiguration): VerifiedDatabaseTlsOptions | undefined {
  if (!configuration.enabled) return undefined;

  let ca: string | undefined;
  if (configuration.caPath) {
    try {
      ca = validateCertificateChain(readFileSync(configuration.caPath, 'utf8'));
    } catch {
      throw new Error('Database CA file is unavailable or invalid.');
    }
  } else if (configuration.inlineCa) {
    ca = validateCertificateChain(configuration.inlineCa);
  }

  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}
