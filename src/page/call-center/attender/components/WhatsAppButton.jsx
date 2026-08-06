import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Send } from "lucide-react";
import { subscribeToCallCenterOptions, DEFAULT_WHATSAPP_TEMPLATES } from "../../../../lib/db";

/**
 * Formats a phone number for WhatsApp wa.me links
 * (e.g. 9876543210 -> 919876543210)
 */
export const formatPhoneForWhatsApp = (phone) => {
  if (!phone) return "";
  let cleaned = String(phone).replace(/[^0-9]/g, "");
  
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }
  
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  
  return cleaned;
};

/**
 * Replaces name tags like {Name}, [Contact Name], or {cleanName} with actual attender name
 */
export const processTemplateText = (rawText, name) => {
  if (!rawText) return "";
  const cleanName = String(name || "").trim();
  
  if (cleanName) {
    return rawText
      .replace(/\{Name\}/gi, () => cleanName)
      .replace(/\[Contact Name\]/gi, () => cleanName)
      .replace(/\[Name\]/gi, () => cleanName)
      .replace(/\{cleanName\}/gi, () => cleanName)
      .replace(/\$\{cleanName\}/gi, () => cleanName);
  }
  
  // If no name is present, clean up "{Name} ji", "{Name}", etc.
  return rawText
    .replace(/\{Name\}\s*ji!?/gi, "")
    .replace(/\[Contact Name\]\s*ji!?/gi, "")
    .replace(/\[Name\]\s*ji!?/gi, "")
    .replace(/\{Name\}/gi, "")
    .replace(/\[Contact Name\]/gi, "")
    .replace(/\[Name\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
};

const WhatsAppIcon = ({ className = "w-3.5 h-3.5 fill-current" }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
  </svg>
);

export const WhatsAppButton = ({ phone, name = "", variant = "default" }) => {
  const [open, setOpen] = useState(false);
  const [dbTemplates, setDbTemplates] = useState(DEFAULT_WHATSAPP_TEMPLATES);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToCallCenterOptions((options) => {
      if (options?.whatsappTemplates && options.whatsappTemplates.length > 0) {
        setDbTemplates(options.whatsappTemplates);
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!phone) return null;

  const digits = String(phone).replace(/[^0-9]/g, "");
  if (digits.length < 10) return null;

  const waPhone = formatPhoneForWhatsApp(phone);

  const handleOpenWA = (text = "") => {
    setOpen(false);
    const processedText = processTemplateText(text, name);
    const url = processedText 
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(processedText)}`
      : `https://wa.me/${waPhone}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (variant === "header") {
    return (
      <div className="relative inline-flex items-center" ref={dropdownRef}>
        <div className="inline-flex items-center bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md border border-white/15 overflow-hidden">
          <button
            type="button"
            onClick={() => handleOpenWA()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-emerald-500/30 active:scale-95 transition-all text-white cursor-pointer"
            title={`WhatsApp ${waPhone}`}
          >
            <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-300" />
            <span>WhatsApp</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="px-2 py-1.5 hover:bg-white/20 text-white/80 hover:text-white transition-all border-l border-white/15 cursor-pointer"
            title="Message Templates"
          >
            <ChevronDown size={12} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>

        {open && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2.5 z-50 animate-fade-in text-gray-800">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2.5 py-1 mb-1 border-b border-gray-100 flex items-center justify-between">
              <span>Send WhatsApp Message</span>
              <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-extrabold">{waPhone}</span>
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleOpenWA()}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50/60 hover:bg-emerald-100/70 text-emerald-800 transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600" />
                  <span>Direct Chat (No Message)</span>
                </div>
                <Send size={12} className="text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
              </button>
              {dbTemplates.map((tpl, i) => {
                const previewText = processTemplateText(tpl.text, name);
                return (
                  <button
                    key={tpl.id || i}
                    type="button"
                    onClick={() => handleOpenWA(tpl.text)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 transition border border-transparent hover:border-gray-100"
                  >
                    <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      {tpl.emoji ? (
                        <span className="text-sm leading-none">{tpl.emoji}</span>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      )}
                      <span>{tpl.title}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{previewText}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default variant for form inputs
  return (
    <div className="relative inline-flex items-center shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => handleOpenWA()}
        className="inline-flex items-center justify-center px-2.5 py-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-l-xl text-xs font-black transition-all border border-emerald-500 shadow-sm hover:shadow-md cursor-pointer"
        title={`WhatsApp ${waPhone}`}
      >
        <WhatsAppIcon className="w-3.5 h-3.5 fill-white mr-1" />
        WA
      </button>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-r-xl border-l border-emerald-400 text-xs font-bold transition cursor-pointer"
        title="Choose message template"
      >
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-50 animate-fade-in text-gray-800">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2.5 py-1">
            Send WhatsApp Message
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => handleOpenWA()}
              className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-50 text-emerald-700 transition flex items-center justify-between"
            >
              <span>Direct Chat (No Message)</span>
              <Send size={11} />
            </button>
            {dbTemplates.map((tpl, i) => {
              const previewText = processTemplateText(tpl.text, name);
              return (
                <button
                  key={tpl.id || i}
                  type="button"
                  onClick={() => handleOpenWA(tpl.text)}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-gray-50 transition"
                >
                  <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    {tpl.emoji ? (
                      <span>{tpl.emoji}</span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    )}
                    <span>{tpl.title}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{previewText}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppButton;
