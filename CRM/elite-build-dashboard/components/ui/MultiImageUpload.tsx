"use client";
import { useState, useRef } from 'react';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ImagePlus, X, Loader2, GripVertical } from 'lucide-react';

interface MultiImageUploadProps {
  /** First image is hero; rest are gallery */
  images: string[];
  onChange: (images: string[]) => void;
  folder?: string;
  label?: string;
  maxImages?: number;
}

export function MultiImageUpload({
  images,
  onChange,
  folder = 'projects',
  label,
  maxImages = 10,
}: MultiImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      setError(`Maximum ${maxImages} images allowed.`);
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);

    // Validate all files
    for (const file of toUpload) {
      if (!file.type.startsWith('image/')) {
        setError('Please select only image files.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`"${file.name}" exceeds 5MB limit.`);
        return;
      }
    }

    setUploading(true);
    setError('');
    try {
      const urls: string[] = [];
      for (const file of toUpload) {
        const filename = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        urls.push(url);
      }
      onChange([...images, ...urls]);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError('Upload failed. Check Storage permissions.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const setAsHero = (index: number) => {
    if (index === 0) return;
    const updated = [...images];
    const [img] = updated.splice(index, 1);
    updated.unshift(img);
    onChange(updated);
  };

  return (
    <div>
      {label && (
        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((url, i) => (
            <div
              key={url}
              className={`relative rounded-xl overflow-hidden border ${i === 0 ? 'border-mn-h2 col-span-3 h-40' : 'border-mn-border h-24'} group`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {/* Hero badge */}
              {i === 0 && (
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-mn-brand text-mn-brand-contrast text-[9px] font-black rounded-full uppercase">
                  Hero
                </span>
              )}
              {/* Actions */}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => setAsHero(i)}
                    title="Set as hero image"
                    className="w-6 h-6 rounded-full bg-mn-brand/90 text-mn-brand-contrast flex items-center justify-center hover:bg-mn-brand text-[9px] font-black"
                  >
                    H
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="w-6 h-6 rounded-full bg-mn-danger-action text-mn-danger-contrast flex items-center justify-center hover:bg-mn-danger-action/90"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {images.length < maxImages && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full h-20 border-2 border-dashed border-mn-border rounded-xl flex flex-col items-center justify-center gap-1 text-mn-text-muted hover:border-mn-h2 hover:text-mn-h2 transition-all disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[10px] font-bold">Uploading...</span>
            </>
          ) : (
            <>
              <ImagePlus className="w-5 h-5" />
              <span className="text-[10px] font-bold">
                {images.length === 0 ? 'Upload images' : 'Add more images'}
              </span>
              <span className="text-[9px] text-mn-text-muted/50">
                {images.length}/{maxImages} · Max 5MB each · First image is hero
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
      {error && <p className="text-xs text-mn-danger mt-1">{error}</p>}
    </div>
  );
}
