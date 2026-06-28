import { z } from 'zod';

/**
 * Single source of truth for the password policy. The UI copy (SetPassword),
 * the strength meter, the zod schema, and the backend (SB11 — must mirror this)
 * all derive from these rules.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

const UPPERCASE = /[A-Z]/;
const LOWERCASE = /[a-z]/;
const NUMBER = /[0-9]/;
const SYMBOL = /[^A-Za-z0-9]/;

export const passwordPolicy = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
  .regex(UPPERCASE, 'Add an uppercase letter')
  .regex(LOWERCASE, 'Add a lowercase letter')
  .regex(NUMBER, 'Add a number')
  .regex(SYMBOL, 'Add a symbol');

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/** The advertised rules, in display order — drives the inline checklist. */
export const passwordRules: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN} characters`,
    test: (v) => v.length >= PASSWORD_MIN,
  },
  { id: 'uppercase', label: 'An uppercase letter', test: (v) => UPPERCASE.test(v) },
  { id: 'lowercase', label: 'A lowercase letter', test: (v) => LOWERCASE.test(v) },
  { id: 'number', label: 'A number', test: (v) => NUMBER.test(v) },
  { id: 'symbol', label: 'A symbol', test: (v) => SYMBOL.test(v) },
];

/** 0–100, the share of policy rules a value satisfies (drives the strength bar). */
export const getPasswordStrength = (value: string): number => {
  if (!value) return 0;
  const passed = passwordRules.filter((rule) => rule.test(value)).length;
  return Math.round((passed / passwordRules.length) * 100);
};
