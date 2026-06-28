import { z } from 'zod';
import { passwordPolicy } from './password';

export const loginSchema = z.object({
  loginId: z.string().trim().min(1, 'Enter your username or email'),
  // Login only checks presence — the policy is enforced when setting a password.
  password: z.string().min(1, 'Enter your password'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const setPasswordSchema = z
  .object({
    password: passwordPolicy,
    confirmPassword: z.string().min(1, 'Re-enter your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type SetPasswordValues = z.infer<typeof setPasswordSchema>;
