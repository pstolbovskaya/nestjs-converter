import { ValidateBy, ValidationOptions } from 'class-validator';

export const MaxBytes = (max: number, options?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'maxBytes',
      constraints: [max],
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
        defaultMessage: () => `$property must be at most ${max} bytes`,
      },
    },
    options,
  );
