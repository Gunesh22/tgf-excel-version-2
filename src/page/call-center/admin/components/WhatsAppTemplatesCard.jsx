import React, { useState } from "react";
import { MessageSquare, Plus, Edit2, Trash2, Save, X, Sparkles, User, HelpCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { DEFAULT_WHATSAPP_TEMPLATES } from "../../../../lib/db";
import { processTemplateText } from "../../attender/components/WhatsAppButton";

const QUICK_EMOJIS = ["✨", "🌸", "📝", "🙏", "💬", "💚", "☀️", "⭐"];

const renderTextWithVariableBadges = (text = "") => {
  if (!text) return null;
  const parts = text.split(/(\{Name\}|\[Contact Name\]|\[Name\]|\{cleanName\})/gi);
  return parts.map((part, idx) => {
    if (/^(\{Name\}|\[Contact Name\]|\[Name\]|\{cleanName\})$/i.test(part)) {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold font-mono text-[11px] border border-emerald-300/80 mx-0.5 shadow-2xs"
        >
          {part}
        </span>
      );
    }
    return part;
  });
};

export function WhatsAppTemplatesCard({ templates = DEFAULT_WHATSAPP_TEMPLATES, onSaveTemplates }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // null when adding new
  const [formData, setFormData] = useState({ title: "", text: "", emoji: "💬" });

  const openAddModal = () => {
    setEditingTemplate(null);
    setFormData({ title: "", text: "Happy Thoughts {Name} ji! ", emoji: "✨" });
    setIsModalOpen(true);
  };

  const openEditModal = (tpl) => {
    setEditingTemplate(tpl);
    setFormData({
      title: tpl.title || "",
      text: tpl.text || "",
      emoji: tpl.emoji || "💬"
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error("Template title is required!");
      return;
    }
    if (!formData.text.trim()) {
      toast.error("Template message text is required!");
      return;
    }

    let updatedList;
    if (editingTemplate) {
      // Update existing
      updatedList = templates.map((t) =>
        t.id === editingTemplate.id
          ? { ...t, title: formData.title.trim(), text: formData.text.trim(), emoji: formData.emoji }
          : t
      );
    } else {
      // Add new
      const newId = `tpl_${Date.now()}`;
      updatedList = [
        ...templates,
        { id: newId, title: formData.title.trim(), text: formData.text.trim(), emoji: formData.emoji }
      ];
    }

    try {
      await onSaveTemplates(updatedList);
      toast.success(editingTemplate ? "Template updated!" : "New template added!");
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save template: " + err.message);
    }
  };

  const handleDelete = async (idToDelete) => {
    if (templates.length <= 1) {
      toast.error("You must keep at least 1 template.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this template?")) return;

    const updatedList = templates.filter((t) => t.id !== idToDelete);
    try {
      await onSaveTemplates(updatedList);
      toast.success("Template deleted!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete template: " + err.message);
    }
  };

  const insertNameTag = () => {
    setFormData((prev) => ({
      ...prev,
      text: prev.text + " {Name}"
    }));
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <MessageSquare size={20} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">WhatsApp Message Templates</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Customize quick message templates used by attenders when sending WhatsApp messages.
            </p>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-2xl transition shadow-xs cursor-pointer shrink-0"
        >
          <Plus size={15} />
          <span>Add Template</span>
        </button>
      </div>

      {/* Templates Grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-gray-50/60 rounded-2xl border border-gray-150 p-4 space-y-3 flex flex-col justify-between hover:border-emerald-200 hover:bg-emerald-50/20 transition group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">{tpl.emoji || "💬"}</span>
                  <h4 className="font-bold text-gray-800 text-xs">{tpl.title}</h4>
                </div>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                  <button
                    onClick={() => openEditModal(tpl)}
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-100/60 rounded-lg transition"
                    title="Edit Template"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(tpl.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100/60 rounded-lg transition"
                    title="Delete Template"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-700 leading-relaxed bg-white p-3 rounded-xl border border-gray-100 line-clamp-4">
                {renderTextWithVariableBadges(tpl.text)}
              </div>
            </div>

            <div className="text-[10px] text-gray-400 font-semibold flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="flex items-center gap-1">
                <User size={11} className="text-emerald-500" />
                <span>Variable Tag: <strong className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-mono border border-emerald-100">{`{Name}`}</strong></span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div
            className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-scale-up border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-emerald-600" />
                <h3 className="font-bold text-gray-900 text-base">
                  {editingTemplate ? "Edit WhatsApp Template" : "Add WhatsApp Template"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Title & Emoji */}
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3 space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Template Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Shivir Follow-up"
                    className="w-full px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={formData.emoji}
                    onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
                    className="w-full px-3 py-2 text-center text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Quick Emojis Selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-gray-400 mr-1">Quick Emojis:</span>
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setFormData({ ...formData, emoji: em })}
                    className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition border ${
                      formData.emoji === em
                        ? "bg-emerald-100 border-emerald-400 text-emerald-900 scale-105 shadow-xs"
                        : "bg-gray-50 hover:bg-gray-100 border-gray-200"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>

              {/* Message Text Area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Message Text <span className="text-red-500">*</span>
                  </label>
                  
                  {/* Insert Name Button */}
                  <button
                    type="button"
                    onClick={insertNameTag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg border border-emerald-200/60 transition active:scale-95 cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>Insert Contact Name</span>
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  placeholder="Happy Thoughts {Name} ji! ..."
                  className="w-full px-3 py-2.5 text-xs font-medium leading-relaxed bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />

                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <HelpCircle size={12} className="text-emerald-500" />
                    Use <strong className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-mono">{`{Name}`}</strong> tag to automatically insert contact's name.
                  </span>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="bg-emerald-50/50 border border-emerald-150 rounded-2xl p-3.5 space-y-1.5">
                <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                  <span>📱 Live Message Preview (for "Namdev Kale")</span>
                </div>
                <div className="text-xs text-gray-800 font-medium leading-relaxed bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs">
                  {processTemplateText(formData.text, "Namdev Kale") || <span className="italic text-gray-300">Type message above...</span>}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
              >
                <Save size={14} />
                <span>Save Template</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
