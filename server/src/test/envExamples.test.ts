import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const examples = ['.env.example', 'server/.env.example', 'apps/web/.env.example', 'apps/mobile/.env.example'];

describe('public environment examples', () => {
  it('contain placeholders rather than usable credentials', () => {
    for (const file of examples) {
      const values = parse(readFileSync(resolve(root, file)));
      const databaseUrl = values.DATABASE_URL;
      if (databaseUrl) {
        const password = new URL(databaseUrl).password;
        expect(password === '' || /PASSWORD|REPLACE|EXAMPLE/i.test(password)).toBe(true);
      }
      for (const [key, value] of Object.entries(values)) {
        if (/PUBLISHABLE_KEY$/.test(key)) expect(value).toMatch(/REPLACE|EXAMPLE|PROJECT/i);
      }
      if (file.startsWith('apps/')) expect(values.DATABASE_URL).toBeUndefined();
    }
  });
});
