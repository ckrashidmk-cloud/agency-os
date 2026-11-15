import { db } from "@/lib/dataClient";

import React, { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, ImageIcon } from "lucide-react";




/**
 * LogoUploader
 * Props:
 *   label      – field label shown above the drop zone
 *   value      – current URL (string)
 *   onChange   – callback(newUrl: string)
 *   aspect     – "square" (default) | "wide"  controls preview dimensions
 */
export default function LogoUploader({ label, value, onChange, aspect = "square" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are accepted.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const result = await db.integrations.Core.UploadFile(file);
      onChange(result.file_url || "");
    } catch (e) {
      console.error(e);
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  const previewClasses =
    aspect === "wide"
      ? "h-36 w-full"
      : "h-36 w-full";

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors
          ${value ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/60"}
          ${previewClasses} cursor-pointer group`}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        aria-label={`Upload ${label ?? "image"}`}
      >
        {value ? (
          <>
            <img
              src={value}
              alt={label ?? "uploaded image"}
              className="h-full w-full rounded-lg object-contain p-2"
            />
            {/* overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                size="icon"
                variant="secondary"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                aria-label="Replace image"
                disabled={uploading}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="destructive"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                aria-label="Remove image"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            {uploading ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground/60 group-hover:text-primary transition-colors" />
            )}
            <span className="text-xs text-muted-foreground">
              {uploading ? "Uploading…" : "Click or drag to upload"}
            </span>
          </>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        id={`logo-uploader-${(label ?? "").replace(/\s+/g, "-").toLowerCase()}`}
      />
    </div>
  );
}
