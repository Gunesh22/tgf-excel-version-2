import React from "react";
import {
  User, Phone, Hash, MapPin, CheckCircle2, Tag, Plus, MessageSquare, Loader, Clock
} from "lucide-react";
import { formatContactName } from "../../utils";
import CityAutofillInput from "./CityAutofillInput";

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
      return <User size={12} className="text-slate-400" />;
    }
    if (k.includes("phone") || k.includes("mobile")) {
      return <Phone size={12} className="text-slate-400" />;
    }
    if (k.includes("city") || k.includes("location") || k.includes("state")) {
      return <MapPin size={12} className="text-slate-400" />;
    }
    if (k.includes("email")) {
      return <Hash size={12} className="text-slate-400" />;
    }
    if (k.includes("when") || k.includes("suitable")) {
      return <Clock size={12} className="text-slate-400" />;
    }
    if (k.includes("asmani") || k.includes("aasmani") || k.includes("आसमानी")) {
      return <CheckCircle2 size={12} className="text-slate-400" />;
    }
    return <Tag size={12} className="text-slate-400" />;
  };

  const labelFor = (f) => f.replace(/_/g, " ").replace(/\?/g, "").trim();

  return (
    <div className="space-y-4 p-4 text-xs bg-white rounded-lg">
      {/* Primary Contact Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Name */}
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
            <User size={12} className="text-slate-400" /> Name
          </label>
          <input
            value={edited.Name || ""}
            onChange={e => handleChange("Name", e.target.value)}
            onBlur={e => handleChange("Name", formatContactName(e.target.value))}
            readOnly={!getEditable("Name")}
            className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
              !getEditable("Name")
                ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Phone */}
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1 truncate">
            <Phone size={12} className="text-slate-400 shrink-0" /> Phone <span className="text-rose-500 font-bold ml-0.5">*</span>
            {isCheckingDuplicate && <Loader size={10} className="animate-spin text-indigo-600 ml-1 shrink-0" />}
            {isSearchingCRM && <Loader size={10} className="animate-spin text-emerald-600 ml-1 shrink-0" />}
          </label>
          <input
            value={edited.Phone || ""}
            onChange={e => handleChange("Phone", e.target.value)}
            readOnly={!getEditable("Phone")}
            className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
              !getEditable("Phone")
                ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Mobile */}
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1 truncate">
            <Phone size={12} className="text-slate-400 shrink-0" /> Mobile
            {isCheckingDuplicate && <Loader size={10} className="animate-spin text-indigo-600 ml-1 shrink-0" />}
            {isSearchingCRM && <Loader size={10} className="animate-spin text-emerald-600 ml-1 shrink-0" />}
          </label>
          <input
            value={edited.Mobile || ""}
            onChange={e => handleChange("Mobile", e.target.value)}
            readOnly={!getEditable("Mobile")}
            className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
              !getEditable("Mobile")
                ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Email */}
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
            <Hash size={12} className="text-slate-400" /> Email
          </label>
          <input
            value={edited.Email || ""}
            onChange={e => handleChange("Email", e.target.value)}
            readOnly={!getEditable("Email")}
            className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
              !getEditable("Email")
                ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* City */}
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
            <MapPin size={12} className="text-slate-400" /> City <span className="text-rose-500 font-bold ml-0.5">*</span>
          </label>
          <CityAutofillInput
            cityValue={edited.City || ""}
            stateValue={edited.State || ""}
            onChangeCity={val => handleChange("City", val)}
            onChangeState={val => handleChange("State", val)}
            readOnly={!getEditable("City")}
            className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
              !getEditable("City")
                ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* State */}
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
            <MapPin size={12} className="text-slate-400" /> State
          </label>
          <input
            value={edited.State || ""}
            onChange={e => handleChange("State", e.target.value)}
            readOnly={!getEditable("State")}
            className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
              !getEditable("State")
                ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
            }`}
          />
        </div>

        {/* Khoji */}
        <div className="space-y-1 col-span-1 md:col-span-2">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
            <CheckCircle2 size={12} className="text-slate-400" /> Khoji <span className="text-rose-500 font-bold ml-0.5">*</span>
          </label>
          <div className="flex items-center gap-2 h-[34px]">
            {(() => {
              const kVal = String(edited.Khoji || "").toLowerCase().trim();
              const isDew = kVal === "dew drop khoji";
              const isYes = kVal === "yes" || isDew;
              const isNo = kVal === "no";
              const editable = getEditable("Khoji");
              return (
                <>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => handleChange("Khoji", isYes ? "" : "Yes")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      isYes
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => handleChange("Khoji", isNo ? "" : "No")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      isNo
                        ? "bg-rose-600 border-rose-600 text-white shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    No
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer ml-2 select-none">
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
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer border-slate-300"
                    />
                    <span className="text-xs font-medium text-slate-700">Dew drop khoji</span>
                  </label>
                </>
              );
            })()}
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-1 col-span-1 md:col-span-4">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
            <Tag size={12} className="text-slate-400" /> Tags
          </label>
          <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-50 border border-slate-200 rounded-lg min-h-[34px] items-center">
            {(() => {
              const rawTags = edited.Tags || edited.tags || "";
              let tagsArr = [];
              if (Array.isArray(rawTags)) {
                tagsArr = rawTags.map(t => typeof t === "object" ? (t?.name || t?.label || t?.tag || "") : String(t));
              } else if (typeof rawTags === "string") {
                tagsArr = rawTags.split(",");
              } else if (typeof rawTags === "object" && rawTags !== null) {
                tagsArr = [rawTags.name || rawTags.label || rawTags.tag || ""];
              }
              const cleanTags = Array.from(new Set(
                tagsArr
                  .map(t => String(t || "").trim().replace(/^#+/, ""))
                  .filter(t => t.length > 0 && t !== "[object Object]")
              ));
              if (cleanTags.length === 0) {
                return <span className="text-xs text-slate-400 px-2 font-medium">No tags mapped</span>;
              }
              return cleanTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200/60 text-slate-700 border border-slate-300/50"
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
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Plus size={13} className="text-slate-400" /> Custom Fields
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                  <label className="text-xs font-semibold text-slate-700 leading-none flex items-center gap-1 mb-1 truncate" title={labelFor(field)}>
                    {iconFor(field)} {labelFor(field)}
                  </label>
                  {String(field).toLowerCase().includes("note") || String(field).toLowerCase().includes("remark") || field.length > 30 ? (
                    <textarea
                      value={edited[field] || ""}
                      onChange={e => handleChange(field, e.target.value)}
                      readOnly={!editable}
                      className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
                        !editable
                          ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
                      }`}
                      rows={2}
                    />
                  ) : (
                    <input
                      value={edited[field] || ""}
                      onChange={e => handleChange(field, e.target.value)}
                      readOnly={!editable}
                      className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
                        !editable
                          ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500"
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
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleAddField}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition cursor-pointer"
        >
          <Plus size={12} /> Add Custom Field
        </button>
      </div>

      {/* Lead form question responses */}
      {questionFields.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5"><MessageSquare size={12} /> Lead Form Responses</p>
          {questionFields.map(field => (
            <div key={field} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
              <label className="text-xs font-medium text-slate-700 block">{labelFor(field)}</label>
              <textarea
                value={edited[field] || ""}
                readOnly={true}
                rows={1}
                className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-600 cursor-not-allowed resize-none focus:outline-none leading-normal placeholder:text-slate-400"
                placeholder="No response..."
              />
            </div>
          ))}
        </div>
      )}

      {/* Campaign & Ads metadata */}
      {campaignFields.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><Tag size={11} /> Campaign / Ads Data</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            {campaignFields.map(field => (
              <div key={field} className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">{labelFor(field)}</label>
                <input
                  value={edited[field] || ""}
                  readOnly={true}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono text-slate-600 cursor-not-allowed focus:outline-none transition"
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
