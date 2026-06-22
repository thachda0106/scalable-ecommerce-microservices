import { validateEnv, requireEnv, getEnv } from '../env-validator';

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should pass when all required vars are present', () => {
    process.env['DB_HOST'] = 'localhost';
    process.env['DB_PORT'] = '5432';
    const result = validateEnv([
      { name: 'DB_HOST', required: true },
      { name: 'DB_PORT', required: true },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should report missing required vars', () => {
    process.env['DB_HOST'] = 'localhost';
    const result = validateEnv([
      { name: 'DB_HOST', required: true },
      { name: 'DB_PORT', required: true },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DB_PORT');
  });

  it('should warn on missing optional vars', () => {
    const result = validateEnv([
      { name: 'LOG_LEVEL', required: false },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it('should treat empty strings as missing', () => {
    process.env['DB_HOST'] = '';
    const result = validateEnv([{ name: 'DB_HOST', required: true }]);
    expect(result.valid).toBe(false);
  });

  it('should treat whitespace-only strings as missing', () => {
    process.env['DB_HOST'] = '   ';
    const result = validateEnv([{ name: 'DB_HOST', required: true }]);
    expect(result.valid).toBe(false);
  });
});

describe('requireEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return the value when set', () => {
    process.env['MY_VAR'] = 'hello';
    expect(requireEnv('MY_VAR')).toBe('hello');
  });

  it('should throw when not set', () => {
    delete process.env['MY_VAR'];
    expect(() => requireEnv('MY_VAR')).toThrow('MY_VAR');
  });
});

describe('getEnv', () => {
  it('should return env value when set', () => {
    process.env['MY_VAR'] = 'prod';
    expect(getEnv('MY_VAR', 'dev')).toBe('prod');
  });

  it('should return fallback when not set', () => {
    delete process.env['MY_VAR'];
    expect(getEnv('MY_VAR', 'dev')).toBe('dev');
  });
});
