// Product identity in one place. The name prints on report cards on the
// basic plan ("Powered by VoxLMS").
export const brand = {
  name: "VoxLMS",
  /** International format, digits only, for wa.me links. Null until there is a support line. */
  supportWhatsApp: "2348124994445" as string | null,
};

/** A wa.me link with a message typed in for them, or null until there is a support line. */
export function whatsAppLink(message: string): string | null {
  return brand.supportWhatsApp ? `https://wa.me/${brand.supportWhatsApp}?text=${encodeURIComponent(message)}` : null;
}
