import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { ShieldCheck, Tag, HelpCircle, Loader } from "lucide-react";
import { OptionsManagerCard } from "./OptionsManagerCard";
import { getSettingsOptions, updateCallCenterOptions } from "../../../../lib/db";

export default function SettingsTab() {
  const [options, setOptions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    setIsLoading(true);
    try {
      const data = await getSettingsOptions();
      setOptions(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load settings: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (type, val) => {
    const key = type === "status" ? "statusOptions" : type === "source" ? "sourceOptions" : "calledForOptions";
    const current = options[key] || [];
    if (current.includes(val)) return;

    const updated = [...current, val];
    try {
      await updateCallCenterOptions({ [key]: updated });
      setOptions(prev => ({ ...prev, [key]: updated }));
      toast.success(`Added option: ${val}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes: " + err.message);
    }
  };

  const handleDelete = async (type, val) => {
    const key = type === "status" ? "statusOptions" : type === "source" ? "sourceOptions" : "calledForOptions";
    const current = options[key] || [];
    
    // Prevent deleting core required status options to avoid database issues
    if (type === "status" && ["Reg.Done", "NA"].includes(val)) {
      toast.error(`Cannot delete required status: ${val}`);
      return;
    }

    const updated = current.filter(x => x !== val);
    try {
      await updateCallCenterOptions({ [key]: updated });
      setOptions(prev => ({ ...prev, [key]: updated }));
      toast.success(`Deleted option: ${val}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes: " + err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size={32} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-black text-gray-900">Call Center Options</h2>
        <p className="text-xs text-gray-400 font-medium mt-0.5">Configure dropdown values for Attenders globally.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <OptionsManagerCard
          title="Status Options"
          icon={ShieldCheck}
          options={options?.statusOptions || []}
          onAdd={(val) => handleAdd("status", val)}
          onDelete={(val) => handleDelete("status", val)}
        />
        <OptionsManagerCard
          title="Source Options"
          icon={Tag}
          options={options?.sourceOptions || []}
          onAdd={(val) => handleAdd("source", val)}
          onDelete={(val) => handleDelete("source", val)}
        />
        <OptionsManagerCard
          title="Called For Options"
          icon={HelpCircle}
          options={options?.calledForOptions || []}
          onAdd={(val) => handleAdd("calledFor", val)}
          onDelete={(val) => handleDelete("calledFor", val)}
        />
      </div>
    </div>
  );
}
