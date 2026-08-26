import React from "react";
import { Users, RotateCw } from "lucide-react";
import { getSharedAttenders } from "../../utils";
import { isLeadShared } from "../../../../../lib/db";

export const SharedBanner = ({
  edited,
  row,
  globalDup,
  currentAttenderName,
  onRefreshLead,
  isFetchingShared = false
}) => {
  if (isFetchingShared) {
    return (
      <div className="bg-amber-50/90 border border-amber-300 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs my-2 shadow-xs animate-pulse">
        <div className="flex items-center gap-2 min-w-0">
          <RotateCw size={13} className="text-amber-600 animate-spin shrink-0" />
          <span className="font-extrabold text-amber-950 truncate">
            Fetching latest live updates from team members...
          </span>
        </div>
        <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-200/80 px-2 py-0.5 rounded-full shrink-0">
          Syncing
        </span>
      </div>
    );
  }

  const baseLead = globalDup?.first ? { ...globalDup.first, ...row, ...edited } : (edited || row);
  if (!baseLead) return null;

  const sharedList = getSharedAttenders(baseLead);
  const otherAttenders = currentAttenderName
    ? sharedList.filter(name => name && name.toLowerCase().trim() !== currentAttenderName.toLowerCase().trim())
    : sharedList;

  const isDuplicateMatch = !!globalDup?.first;
  const isShared = (sharedList.length > 1 && otherAttenders.length > 0) || isDuplicateMatch || (isLeadShared(baseLead, currentAttenderName) && otherAttenders.length > 0);

  if (!isShared || otherAttenders.length === 0) return null;

  const sharedText = otherAttenders.join(", ");
  if (!sharedText) return null;

  const hasRefresh = typeof onRefreshLead === "function";

  return (
    <div className="bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 text-xs my-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Users size={13} className="text-amber-600 shrink-0" />
        <span className="font-bold text-amber-900 truncate">
          Shared with: <span className="font-semibold text-amber-800">{sharedText}</span>
        </span>
      </div>
      {hasRefresh && (
        <button
          type="button"
          onClick={() => onRefreshLead(baseLead)}
          className="text-[10px] font-bold text-amber-800 bg-amber-100/80 border border-amber-250 px-2 py-0.5 rounded-md hover:bg-amber-200/80 transition active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
          title="Force fetch fresh lead from database and update cache"
        >
          <RotateCw size={10} /> Force Sync
        </button>
      )}
    </div>
  );
};

export default SharedBanner;
