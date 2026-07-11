import React from "react";
import {
  User, Phone, Hash, MapPin, CheckCircle2, Tag, Plus, MessageSquare, Loader, Clock
} from "lucide-react";
import { formatContactName } from "../../utils";

export const ProfileDetailsTab = ({
  edited,
  handleChange,
  getEditable,
  isCheckingDuplicate,
  isSearchingCRM,
  basicFields,
  questionFields,
  campaignFields,
  handleAddField
}) => {
  
  const iconFor = (f) => {
    const k = f.toLowerCase();
    if (k.includes("name") || k.includes("lead") || k.includes("khoji") || k.includes("caller")) {
      return <User size={11} className="text-emerald-500" />;
    }
    if (k.includes("phone") || k.includes("mobile")) {
      return <Phone size={11} className="text-blue-500" />;
    }
    if (k.includes("city") || k.includes("location")) {
      return <MapPin size={11} className="text-red-500" />;
    }
    if (k.includes("email")) {
      return <Hash size={11} className="text-purple-500" />;
    }
    if (k.includes("when") || k.includes("suitable")) {
      return <Clock size={11} className="text-amber-500" />;
    }
    if (k.includes("asmani") || k.includes("aasmani") || k.includes("आसमानी")) {
      return <CheckCircle2 size={11} className="text-pink-500" />;
    }
    return <Tag size={11} className="text-indigo-500" />;
  };

  const labelFor = (f) => f.replace(/_/g, " ").replace(/\?/g, "").trim();

  return (
    <div className="space-y-6 p-6 rounded-3xl border border-gray-100 bg-gray-50/30">
      {/* Primary Contact Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <User size={11} className="text-emerald-500" /> Name
          </label>
          <input
            value={edited.Name || ""}
            onChange={e => handleChange("Name", e.target.value)}
            onBlur={e => handleChange("Name", formatContactName(e.target.value))}
            readOnly={!getEditable("Name")}
            className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
              !getEditable("Name")
                ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Phone */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <Phone size={11} className="text-blue-500" /> Phone
            {isCheckingDuplicate && <Loader size={10} className="animate-spin text-indigo-500 ml-1" />}
            {isSearchingCRM && <Loader size={10} className="animate-spin text-emerald-500 ml-1" />}
          </label>
          <input
            value={edited.Phone || ""}
            onChange={e => handleChange("Phone", e.target.value)}
            readOnly={!getEditable("Phone")}
            className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
              !getEditable("Phone")
                ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Mobile */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <Phone size={11} className="text-cyan-500" /> Mobile
            {isCheckingDuplicate && <Loader size={10} className="animate-spin text-indigo-500 ml-1" />}
            {isSearchingCRM && <Loader size={10} className="animate-spin text-emerald-500 ml-1" />}
          </label>
          <input
            value={edited.Mobile || ""}
            onChange={e => handleChange("Mobile", e.target.value)}
            readOnly={!getEditable("Mobile")}
            className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
              !getEditable("Mobile")
                ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Email */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <Hash size={11} className="text-purple-500" /> Email
          </label>
          <input
            value={edited.Email || ""}
            onChange={e => handleChange("Email", e.target.value)}
            readOnly={!getEditable("Email")}
            className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
              !getEditable("Email")
                ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* City */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <MapPin size={11} className="text-red-500" /> City
          </label>
          <input
            value={edited.City || ""}
            onChange={e => handleChange("City", e.target.value)}
            readOnly={!getEditable("City")}
            className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
              !getEditable("City")
                ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* State */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <MapPin size={11} className="text-orange-500" /> State
          </label>
          <input
            value={edited.State || ""}
            onChange={e => handleChange("State", e.target.value)}
            readOnly={!getEditable("State")}
            className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
              !getEditable("State")
                ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Khoji */}
        <div className="space-y-1 col-span-1 md:col-span-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <CheckCircle2 size={11} className="text-pink-500" /> Khoji
          </label>
          <div className="flex items-center gap-2 h-[38px]">
            {(() => {
              const isDew = edited.Khoji === "Dew drop khoji";
              const isYes = edited.Khoji === "Yes" || isDew;
              const editable = getEditable("Khoji");
              return (
                <>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => handleChange("Khoji", isYes ? "No" : "Yes")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition ${
                      isYes
                        ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => handleChange("Khoji", isYes ? "No" : "Yes")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition ${
                      !isYes
                        ? "bg-red-500 border-red-500 text-white shadow-sm"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    No
                  </button>
                  <label className="flex items-center gap-2 cursor-pointer ml-4 select-none">
                    <input
                      type="checkbox"
                      checked={isDew}
                      disabled={!editable}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleChange("Khoji", "Dew drop khoji");
                        } else {
                          handleChange("Khoji", "Yes");
                        }
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-gray-700">Dew drop khoji</span>
                  </label>
                </>
              );
            })()}
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-1 col-span-1 md:col-span-4">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
            <Tag size={11} className="text-indigo-500" /> Tags
          </label>
          <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 border border-gray-150 rounded-xl min-h-[38px] items-center">
            {(() => {
              const tagsVal = edited.Tags || "";
              const tagsArr = tagsVal.split(",").map(t => t.trim()).filter(Boolean);
              if (tagsArr.length === 0) {
                return <span className="text-xs text-gray-400 px-2 font-medium">No tags mapped</span>;
              }
              return tagsArr.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm"
                >
                  {tag}
                </span>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* Custom Fields section */}
      {basicFields.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Plus size={13} className="text-indigo-500" /> Custom Fields
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {basicFields.map(field => {
              const editable = getEditable(field);
              return (
                <div
                  key={field}
                  className={`space-y-1 ${
                    field === "Tags"
                      ? "col-span-2 md:col-span-4"
                      : [
                          "What do you want to get out of this call",
                          "How Did You Hear About Us?",
                          "What is stopping you from hitting results...",
                          "Tentative Date of the Mini Shivir you attended",
                          "Which Mini Shivir did you attend?",
                          "Your Health issues",
                          "What is your Tejstan/Center name"
                        ].includes(field)
                      ? "col-span-2 md:col-span-4"
                      : [
                          "Profession", "Source of Information", "When You want to attend the event:", 
                          "Shivir/event category", "Guest Designation", "Platform Name:"
                        ].includes(field) || field.length > 15
                      ? "col-span-2 md:col-span-2"
                      : "col-span-1"
                  }`}
                >
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1 truncate" title={labelFor(field)}>
                    {iconFor(field)} {labelFor(field)}
                  </label>
                  {String(field).toLowerCase().includes("note") || String(field).toLowerCase().includes("remark") || field.length > 30 ? (
                    <textarea
                      value={edited[field] || ""}
                      onChange={e => handleChange(field, e.target.value)}
                      readOnly={!editable}
                      className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                        !editable
                          ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0"
                          : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
                      }`}
                      rows={2}
                    />
                  ) : (
                    <input
                      value={edited[field] || ""}
                      onChange={e => handleChange(field, e.target.value)}
                      readOnly={!editable}
                      className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                        !editable
                          ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0"
                          : "bg-white border-gray-200 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Custom Field button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAddField}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 rounded-xl text-xs font-black transition-all border border-indigo-100/80 shadow-sm hover:shadow-md cursor-pointer"
        >
          <Plus size={14} className="stroke-[3]" /> Add Custom Field
        </button>
      </div>

      {/* Lead form question responses */}
      {questionFields.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5"><MessageSquare size={11} /> Lead Form Responses</p>
          {questionFields.map(field => (
            <div key={field} className="bg-purple-50/40 border border-purple-100 rounded-xl p-3 space-y-1.5">
              <label className="text-[10px] font-semibold text-purple-700 leading-snug block">{labelFor(field)}</label>
              <textarea
                value={edited[field] || ""}
                readOnly={true}
                ref={el => {
                  if (el) {
                    setTimeout(() => {
                      el.style.height = 'inherit';
                      el.style.height = `${el.scrollHeight}px`;
                    }, 0);
                  }
                }}
                rows={1}
                className="w-full bg-gray-100/60 border border-purple-100/80 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed resize-none overflow-hidden focus:outline-none transition leading-relaxed placeholder:text-gray-300"
                placeholder="No response..."
              />
            </div>
          ))}
        </div>
      )}

      {/* Campaign & Ads metadata */}
      {campaignFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-1.5"><Tag size={10} /> Campaign / Ads Data</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-gray-50/50 border border-gray-100 rounded-xl">
            {campaignFields.map(field => (
              <div key={field} className="space-y-1">
                <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest block">{labelFor(field)}</label>
                <input
                  value={edited[field] || ""}
                  readOnly={true}
                  className="w-full px-2 py-1.5 bg-gray-100/60 border border-gray-150 rounded-lg text-xs font-mono text-gray-400 cursor-not-allowed focus:outline-none transition"
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileDetailsTab;
