// Shrinks a photo in the browser before it is stored or sent for analysis.

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function compressImageFile(file, maxDimension = 960, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not an image. Choose a JPEG or PNG photo.'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error('That photo is larger than 25 MB. Choose a smaller one.'));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This photo format isn’t supported. Try a JPEG or PNG.'));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // JPEG has no transparency — without this, transparent PNGs turn black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = url;
  });
}
