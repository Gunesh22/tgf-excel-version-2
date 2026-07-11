import React from "react";
import { AlertCircle } from "lucide-react";

export const DuplicateBanner = ({
  globalDup,
  dupWarningMessage,
  onAutofill
}) => {
  if (!globalDup) return null;

  return (
    <div className="bg-amber-50 border border-amber-250 rounded-2xl p-4 flex items-start gap-3 shadow-md animate-slide-up">
      <div className="p-2 bg-amber-100 text-amber-600 rounded-xl mt-0.5 animate-pulse">
        <AlertCircle size={18} className="stroke-[2.5]" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
            Duplicate Warning
          </span>
          <div className="flex items-center gap-2">
            {onAutofill && (
              <button
                type="button"
                onClick={onAutofill}
                className="text-[9px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg hover:bg-indigo-100 transition active:scale-95"
              >
                Autofill Details
              </button>
            )}
            <span className="text-[9px] font-bold text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-lg border border-amber-200">
              {globalDup.matches[0]?.source || "Firestore"}
            </span>
          </div>
        </div>
        <p className="text-xs font-semibold text-amber-900 leading-normal">
          {dupWarningMessage}
        </p>
      </div>
    </div>
  );
};

export default DuplicateBanner;
