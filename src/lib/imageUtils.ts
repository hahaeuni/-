export interface CompressedImageResult {
  blob: Blob;
  previewUrl: string;
}

export interface StudentIdImageBundle {
  blob: Blob;
  thumbnailBlob: Blob;
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

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
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
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function loadImageFromFile(file: File): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  if (file.type && !file.type.startsWith('image/')) {
    return Promise.reject(new Error('이미지 파일만 올릴 수 있어요.'));
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('올바른 이미지 파일이 아니에요.'));
    };
    img.onload = () => {
      resolve({ img, revoke: () => URL.revokeObjectURL(objectUrl) });
    };
    img.src = objectUrl;
  });
}

export async function compressFileToBlob(file: File): Promise<CompressedImageResult> {
  const { img, revoke } = await loadImageFromFile(file);
  try {
    const canvas = renderToCanvas(img, img.naturalWidth, img.naturalHeight, 960);
    const blob = await canvasToBlob(canvas, 0.78);
    return { blob, previewUrl: URL.createObjectURL(blob) };
  } finally {
    revoke();
  }
}

export async function compressStudentIdWithThumbnail(file: File): Promise<StudentIdImageBundle> {
  const { img, revoke } = await loadImageFromFile(file);
  try {
    const [originalCanvas, thumbCanvas] = [
      renderToCanvas(img, img.naturalWidth, img.naturalHeight, 960),
      renderToCanvas(img, img.naturalWidth, img.naturalHeight, 360),
    ];
    const [blob, thumbnailBlob] = await Promise.all([
      canvasToBlob(originalCanvas, 0.78),
      canvasToBlob(thumbCanvas, 0.62),
    ]);
    return {
      blob,
      thumbnailBlob,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    revoke();
  }
}

export async function captureVideoFrameToBlob(
  video: HTMLVideoElement
): Promise<CompressedImageResult> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('카메라 화면이 준비되지 않았어요.');
  }
  const canvas = renderToCanvas(video, video.videoWidth, video.videoHeight, 960);
  const blob = await canvasToBlob(canvas, 0.78);
  return { blob, previewUrl: URL.createObjectURL(blob) };
}
