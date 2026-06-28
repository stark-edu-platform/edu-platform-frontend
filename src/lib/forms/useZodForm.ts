import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z, type ZodType } from 'zod';

/**
 * Standard form hook: react-hook-form wired to a zod schema. Use this for every
 * form so validation lives in one schema and field/`root` errors surface
 * consistently. Shared schemas live in `src/lib/validation`.
 *
 *   const { register, handleSubmit, formState: { errors } } = useZodForm(loginSchema);
 *   <InputBox {...register('loginId')} error={errors.loginId?.message} />
 */
export function useZodForm<TSchema extends ZodType<FieldValues>>(
  schema: TSchema,
  options?: Omit<UseFormProps<z.infer<TSchema>>, 'resolver'>,
): UseFormReturn<z.infer<TSchema>> {
  // zodResolver's overloads discriminate on concrete schema types, so a generic
  // wrapper can't infer through them — retype the call. The schema still fully
  // drives runtime validation; only the static binding is asserted.
  const resolver = (zodResolver as unknown as (s: TSchema) => Resolver<z.infer<TSchema>>)(schema);
  return useForm<z.infer<TSchema>>({
    mode: 'onBlur',
    ...options,
    resolver,
  });
}
