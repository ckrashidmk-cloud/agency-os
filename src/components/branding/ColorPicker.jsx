import React, { useState, useRef, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

/** Simple inline hex colour picker with a native <input type="color"> palette. */
export default function ColorPicker({ label, value, onChange }) {
  const [localHex, setLocalHex] = useState(value ?? "#000000");
  const nativeRef = useRef(null);

  // keep in sync when parent updates value
  useEffect(() => {
    setLocalHex(value ?? "#000000");
  }, [value]);

  const isValid = (h) => /^#[0-9a-fA-F]{6}$/.test(h);

  const commit = (hex) => {
    if (isValid(hex)) {
      setLocalHex(hex);
      onChange?.(hex);
    }
  };

  const handleTextChange = (e) => {
    let v = e.target.value;
    if (!v.startsWith("#")) v = "#" + v;
    setLocalHex(v);
    if (isValid(v)) onChange?.(v);
  };

  // Preset palette for quick picks
  const presets = [
    "#ef4444","#f97316","#eab308","#22c55e","#06b6d4",
    "#3b82f6","#8b5cf6","#ec4899","#ffffff","#a1a1aa",
    "#52525b","#27272a","#18181b","#000000",
  ];

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}

      <Popover>
        <PopoverTrigger asChild>
          <button
            id={`color-picker-${(label ?? "").replace(/\s+/g, "-").toLowerCase()}`}
            type="button"
            className="flex h-10 w-full items-center gap-3 rounded-lg border border-input bg-background px-3 text-sm
              shadow-sm transition-colors hover:border-ring hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Pick color for ${label ?? "colour"}`}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-md border border-border shadow-inner"
              style={{ backgroundColor: isValid(localHex) ? localHex : "#888" }}
            />
            <span className="font-mono uppercase tracking-widest text-xs text-muted-foreground">
              {localHex}
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-64 p-4 space-y-4" align="start">
          {/* Native colour wheel */}
          <div className="flex items-center gap-3">
            <input
              ref={nativeRef}
              type="color"
              value={isValid(localHex) ? localHex : "#000000"}
              onChange={(e) => commit(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0"
              aria-label="Colour wheel"
            />
            <Input
              value={localHex}
              onChange={handleTextChange}
              maxLength={7}
              className="font-mono uppercase text-xs"
              placeholder="#rrggbb"
              aria-label="Hex colour value"
            />
          </div>

          {/* Preset swatches */}
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Presets</p>
            <div className="grid grid-cols-7 gap-1.5">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  title={p}
                  onClick={() => commit(p)}
                  className={`h-7 w-7 rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${localHex.toLowerCase() === p.toLowerCase() ? "ring-2 ring-primary ring-offset-1" : "border-border/60"}`}
                  style={{ backgroundColor: p }}
                  aria-label={`Select colour ${p}`}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
