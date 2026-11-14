export interface CompressedImageResult {
  blob: Blob;
  previewUrl: string;
}

function renderToCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxDimension = 960
): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('이미지를 처리할 수 없어요.');
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToCompressedBlob(canvas: HTMLCanvasElement): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('사진 파일을 변환하지 못했어요.'));
          return;
        }
        if (blob.size > 4.5 * 1024 * 1024) {
          reject(new Error('사진 용량이 너무 커요. 다른 사진으로 다시 시도해 주세요.'));
          return;
        }
        const previewUrl = URL.createObjectURL(blob);
        resolve({ blob, previewUrl });
      },
      'image/jpeg',
      0.78
    );
  });
}

export async function compressFileToBlob(file: File): Promise<CompressedImageResult> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 올릴 수 있어요.');
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('올바른 이미지 파일이 아니에요.'));
    };
    img.onload = () => {
      try {
        const canvas = renderToCanvas(img, img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(objectUrl);
        canvasToCompressedBlob(canvas).then(resolve).catch(reject);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.src = objectUrl;
  });
}

export async function captureVideoFrameToBlob(
  video: HTMLVideoElement
): Promise<CompressedImageResult> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('카메라 화면이 준비되지 않았어요.');
  }
  const canvas = renderToCanvas(video, video.videoWidth, video.videoHeight);
  return canvasToCompressedBlob(canvas);
}
