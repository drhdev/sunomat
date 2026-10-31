import { z } from "zod";

export const credentialsSchema = z.object({
  email: z
    .email("Enter a valid email address")
    .max(254, "Use at most 254 characters")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(12, "Use at least 12 characters")
    .max(128, "Use at most 128 characters"),
});
