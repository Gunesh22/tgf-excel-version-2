import React from "react";
import { Phone } from "lucide-react";

/**
 * Formats a phone number to standard international dial format (starting with +)
 * and defaults to Indian country code +91 if no code is present.
 */
export const formatPhoneForDialing = (phone) => {
  if (!phone) return "";
  // Remove all characters except digits and plus sign
  let cleaned = String(phone).replace(/[^0-9+]/g, "");
  
  // If it already has an international dial code prefix (starts with +)
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  
  // Strip leading zero if present (e.g. 09876543210 -> 9876543210)
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }
  
  // If the cleaned number has 12 digits and starts with 91, it's already an Indian country-coded number without the +
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }
  
  // Otherwise, default to +91
  return `+91${cleaned}`;
};

export const CallButton = ({ phone, variant = "default" }) => {
  if (!phone) {
    return null;
  }

  // If there are no actual digits in the input, don't show the button
  const digits = String(phone).replace(/[^0-9]/g, "");
  if (digits.length === 0) {
    return null;
  }

  const formattedPhone = formatPhoneForDialing(phone);

  if (variant === "header") {
    return (
      <a
        href={`tel:${formattedPhone}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-black transition-all shadow-sm hover:shadow-md cursor-pointer border border-white/10"
        title={`Call ${formattedPhone}`}
      >
        <Phone size={12} className="stroke-[2.5]" />
        <span>Call</span>
      </a>
    );
  }

  // Default variant for form inputs
  return (
    <a
      href={`tel:${formattedPhone}`}
      className="inline-flex items-center justify-center px-4 py-2 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 rounded-xl text-xs font-black transition-all border border-emerald-200 shadow-sm hover:shadow-md cursor-pointer"
      title={`Call ${formattedPhone}`}
    >
      <Phone size={13} className="stroke-[2.5] mr-1.5" />
      Call
    </a>
  );
};

export default CallButton;
