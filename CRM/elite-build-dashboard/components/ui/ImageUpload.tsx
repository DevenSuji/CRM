"use client";
import { useState, useRef } from 'react';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ImagePlus, X, Loader2 } from 'lucide-react';

interface ImageUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  folder?: string;
  label?: string;
  helperText?: string;
  minWidth?: number;
  minHeight?: number;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image dimensions.'));
    };
    image.src = objectUrl;
  });
}

export function ImageUpload({
  value,
  onChange,
  folder = 'projects',
  label,
  helperText,
  minWidth,
  minHeight,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }
    if (minWidth || minHeight) {
      try {
        const dimensions = await readImageDimensions(file);
        if ((minWidth && dimensions.width < minWidth) || (minHeight && dimensions.height < minHeight)) {
          setError(`Image must be at least ${minWidth || 0} x ${minHeight || 0}px. Selected image is ${dimensions.width} x ${dimensions.height}px.`);
          return;
        }
      } catch {
        setError('Could not validate image size. Please choose a different image.');
        return;
      }
    }

    setUploading(true);
    setError('');
    try {
      const filename = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onChange(url);
    } catch (err: unknown) {
      console.error('Upload error:', err);
      setError('Upload failed. Check Storage permissions.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-mn-border">
          <img src={value} alt="Project" className="w-full h-40 object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-mn-danger-action text-mn-danger-contrast flex items-center justify-center hover:bg-mn-danger-action/90 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full h-32 border-2 border-dashed border-mn-border rounded-xl flex flex-col items-center justify-center gap-2 text-mn-text-muted hover:border-mn-h2 hover:text-mn-h2 transition-all disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-bold">Uploading...</span>
            </>
          ) : (
            <>
              <ImagePlus className="w-6 h-6" />
              <span className="text-xs font-bold">Click to upload image</span>
              <span className="text-[10px] text-mn-text-muted/50">
                {helperText || 'Max 5MB, JPG/PNG'}
              </span>
            </>
          )}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      {helperText && value && <p className="text-[10px] text-mn-text-muted mt-1.5">{helperText}</p>}
      {error && <p className="text-xs text-mn-danger mt-1">{error}</p>}
    </div>
  );
}
