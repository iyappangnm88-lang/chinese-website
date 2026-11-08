import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from PIL import Image, ImageFilter, ImageEnhance

SRC_DIR = 'background'
OUT_DIR = 'enhanced-frames'
TARGET_W = 1920
TARGET_H = 1080

def process_frame(index):
    filename = f"ezgif-frame-{str(index).padStart(3, '0') if hasattr(str, 'padStart') else f'{index:03d}'}.jpg"
    src_path = os.path.join(SRC_DIR, filename)
    out_path = os.path.join(OUT_DIR, filename)
    
    if not os.path.exists(src_path):
        return index, False, "Source not found"

    try:
        img = Image.open(src_path).convert('RGB')
        w, h = img.size
        
        # 1. Subtle deblocking blend (0.22) to suppress 8x8 DCT compression blocks
        denoised = img.filter(ImageFilter.SMOOTH_MORE)
        img_clean = Image.blend(img, denoised, 0.22)
        
        # 2. Stage 1: 2x Lanczos upsample
        s1 = img_clean.resize((w * 2, h * 2), resample=Image.Resampling.LANCZOS)
        s1 = s1.filter(ImageFilter.UnsharpMask(radius=1.1, percent=65, threshold=3))
        
        # 3. Stage 2: 4x Lanczos upsample
        s2 = s1.resize((w * 4, h * 4), resample=Image.Resampling.LANCZOS)
        s2 = s2.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=4))
        
        # 4. Stage 3: Scale to target width 1920 with Lanczos
        scale = TARGET_W / w
        h_target = int(round(h * scale))
        s3 = s2.resize((TARGET_W, h_target), resample=Image.Resampling.LANCZOS)
        
        # 5. Symmetrical crop to clean 1920x1080 (16:9 standard)
        top_crop = (h_target - TARGET_H) // 2
        cropped = s3.crop((0, top_crop, TARGET_W, top_crop + TARGET_H))
        
        # 6. Final gentle clarity and color/contrast preservation
        polished = cropped.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=4))
        enh = ImageEnhance.Contrast(polished)
        final_img = enh.enhance(1.03)
        
        # 7. Save optimized progressive JPEG for web
        final_img.save(out_path, 'JPEG', quality=85, optimize=True, progressive=True)
        return index, True, os.path.getsize(out_path)
    except Exception as e:
        return index, False, str(e)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()
    
    print(f"Beginning batch enhancement of 240 frames to {TARGET_W}x{TARGET_H} in '{OUT_DIR}'...")
    
    # Use CPU cores for fast parallel processing
    workers = min(os.cpu_count() or 4, 8)
    print(f"Using {workers} parallel worker processes.")
    
    completed = 0
    total_bytes = 0
    
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_frame, i): i for i in range(1, 241)}
        for future in as_completed(futures):
            idx, success, res = future.result()
            if success:
                completed += 1
                total_bytes += res
                if completed % 30 == 0 or completed == 240:
                    pct = (completed / 240) * 100
                    print(f"Progress: {completed}/240 frames ({pct:.0f}%) | Elapsed: {time.time() - t0:.1f}s")
            else:
                print(f"Error on frame {idx}: {res}")
                
    total_time = time.time() - t0
    total_mb = total_bytes / (1024 * 1024)
    print(f"\nSuccessfully enhanced {completed}/240 frames in {total_time:.2f}s!")
    print(f"Total size of enhanced-frames: {total_mb:.2f} MB (~{total_mb / completed * 1024:.1f} KB/frame).")

if __name__ == '__main__':
    main()
