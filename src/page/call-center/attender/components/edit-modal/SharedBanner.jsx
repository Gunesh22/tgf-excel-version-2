import React from "react";
import { Users, RotateCw } from "lucide-react";
import { getSharedAttenders } from "../../utils";

export const SharedBanner = ({
  edited,
  row,
  currentAttenderName,
  onRefreshLead
}) => {
  const leadData = edited || row;
  if (!leadData) return null;

  const sharedList = getSharedAttenders(leadData);
  const otherAttenders = currentAttenderName
    ? sharedList.filter(name => name && name.toLowerCase().trim() !== currentAttenderName.toLowerCase().trim())
    : sharedList;

  console.log(
    `[SHARED BANNER DIAGNOSTIC] Lead "${leadData.Name || leadData.name || leadData.id}" | _isNew: ${!!leadData._isNew} | currentAttender: "${currentAttenderName}" | assignedTo:`,
    leadData.assignedTo,
    "| attenderStates keys:",
    Object.keys(leadData.attenderStates || {}),
    "| sharedList:",
    sharedList,
    "| otherAttenders:",
    otherAttenders
  );

  if (!sharedList || sharedList.length <= 1) return null;

  const sharedText = otherAttenders.length > 0
    ? otherAttenders.join(", ")
    : sharedList.join(", ");

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
          onClick={() => onRefreshLead(leadData)}
          className="text-[10px] font-bold text-amber-800 bg-amber-100/80 border border-amber-250 px-2 py-0.5 rounded-md hover:bg-amber-200/80 transition active:scale-95 flex items-center gap-1 shrink-0"
          title="Sync latest live updates from team members"
        >
          <RotateCw size={10} /> Sync
        </button>
      )}
    </div>
  );
};

export default SharedBanner;
