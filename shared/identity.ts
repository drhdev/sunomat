import { z } from "zod";

const emailSchema = z
  .email("Enter a valid email address")
  .max(254, "Use at most 254 characters")
  .transform((value) => value.toLowerCase());
const newPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters");
const currentPasswordSchema = z
  .string()
  .min(1, "Enter your current password")
  .max(128, "Use at most 128 characters");
export const credentialsSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});
export const passwordChangeSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "Choose a different new password",
  });
export const passwordChangeFormSchema = passwordChangeSchema
  .safeExtend({ confirmPassword: z.string() })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match",
  });
export const deleteAccountSchema = z.object({
  currentPassword: currentPasswordSchema,
  confirmationEmail: z.string().trim().pipe(emailSchema),
});
