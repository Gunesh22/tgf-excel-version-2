import React, { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { searchCities, getStateForCity } from "../../../../../lib/cityStateData";

export const CityAutofillInput = ({
  cityValue = "",
  stateValue = "",
  onChangeCity,
  onChangeState,
  readOnly = false,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Dynamic API search effect with debouncing & cancelation
  useEffect(() => {
    if (!cityValue || readOnly || cityValue.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    // Cancel previous request if typing rapidly
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await searchCities(
          cityValue,
          abortControllerRef.current.signal
        );
        setSuggestions(results);
        if (results.length > 0) setIsOpen(true);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("Autofill API lookup error:", err);
        }
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [cityValue, readOnly]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    onChangeCity(item.city);
    if (item.state && onChangeState) {
      onChangeState(item.state);
    }
    setIsOpen(false);
  };

  const handleBlur = async () => {
    // Auto-populate state if city matches an API result and state is empty or different
    if (cityValue && onChangeState && !stateValue) {
      const knownState = await getStateForCity(cityValue);
      if (knownState) {
        onChangeState(knownState);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      if (focusedIndex >= 0 && suggestions[focusedIndex]) {
        e.preventDefault();
        handleSelect(suggestions[focusedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={cityValue}
          onChange={(e) => {
            onChangeCity(e.target.value);
          }}
          onFocus={() => {
            if (cityValue && suggestions.length > 0) setIsOpen(true);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          placeholder="Enter city..."
          className={className}
        />
        {isLoading && (
          <div className="absolute right-3 pointer-events-none text-indigo-500">
            <Loader2 size={13} className="animate-spin" />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && !readOnly && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100">
            <span className="flex items-center gap-1">
              <MapPin size={10} className="text-red-500" /> City & State Suggestions
            </span>
          </div>

          {suggestions.map((item, index) => (
            <button
              key={`${item.city}-${item.state}-${index}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur before select
                handleSelect(item);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition cursor-pointer ${
                index === focusedIndex
                  ? "bg-indigo-50 text-indigo-900 font-bold"
                  : "hover:bg-slate-50 text-slate-700 font-medium"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <MapPin size={12} className="text-red-400 shrink-0" />
                <span className="font-bold text-slate-800">{item.city}</span>
              </span>
              <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200/60">
                {item.state}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CityAutofillInput;
