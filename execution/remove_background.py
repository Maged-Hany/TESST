#!/usr/bin/env python3
"""
Background removal tool for Foody image assets.

Removes the background from a subject image and writes a tightly-cropped,
transparent PNG ready for the web.

Pipeline:
  1. rembg (U^2-Net / ISNet) segmentation to get a subject alpha mask.
  2. "Fake transparency" cleanup: many stock PNGs are exported as JPGs with a
     baked-in grey/white checkerboard. Any low-saturation, bright pixel region
     connected to the image border is treated as background and removed.
  3. Edge refinement: 1px alpha erosion (kills light halos on dark sites)
     followed by a soft feather.
  4. Optional despill: semi-transparent edge pixels are darkened toward the
     subject color so no white fringe shows on dark backgrounds.
  5. Crop to the subject bounding box (+ padding).

Usage:
  python execution/remove_background.py --input <src> --output <dst.png>
         [--model isnet-general-use] [--no-checker] [--padding 8]
         [--method rembg|checker]

Install: python -m pip install pillow numpy scipy "rembg[cpu]"
First run downloads the selected model (~40-170 MB) into ~/.u2net.
"""

import argparse
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def checkerboard_background_mask(rgb: np.ndarray, min_brightness: int = 196, max_chroma: int = 14) -> np.ndarray:
    """Return a boolean mask of bright, grey pixels connected to the image border."""
    rgb_i = rgb.astype(np.int16)
    brightness = rgb_i.mean(axis=2)
    chroma = rgb_i.max(axis=2) - rgb_i.min(axis=2)
    candidate = (brightness >= min_brightness) & (chroma <= max_chroma)

    # Close tiny gaps between checker squares (JPEG artifacts on tile edges)
    candidate = ndimage.binary_closing(candidate, structure=np.ones((3, 3)), iterations=1)

    labels, _ = ndimage.label(candidate)
    border_labels = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    border_labels = border_labels[border_labels != 0]
    return np.isin(labels, border_labels)


def rembg_alpha(img: Image.Image, model: str) -> np.ndarray:
    from rembg import new_session, remove

    session = new_session(model)
    cut = remove(img, session=session, post_process_mask=True)
    return np.array(cut.convert("RGBA"))[:, :, 3]


def refine_alpha(alpha: np.ndarray, erode_px: int = 1, feather_sigma: float = 0.8) -> np.ndarray:
    a = alpha.astype(np.float32) / 255.0
    if erode_px > 0:
        a = ndimage.grey_erosion(a, size=(erode_px * 2 + 1, erode_px * 2 + 1))
    if feather_sigma > 0:
        a = ndimage.gaussian_filter(a, sigma=feather_sigma)
    return np.clip(a * 255.0, 0, 255).astype(np.uint8)


def keep_largest_component(alpha: np.ndarray, threshold: int = 24) -> np.ndarray:
    """Drop floating specks that are not connected to the main subject."""
    solid = alpha > threshold
    labels, count = ndimage.label(solid)
    if count <= 1:
        return alpha
    sizes = ndimage.sum(solid, labels, index=range(1, count + 1))
    keep = np.zeros_like(solid)
    largest = sizes.max()
    for idx, size in enumerate(sizes, start=1):
        if size >= largest * 0.02:
            keep |= labels == idx
    keep = ndimage.binary_dilation(keep, iterations=2)
    return np.where(keep, alpha, 0).astype(np.uint8)


def despill(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Pull bright, semi-transparent edge pixels toward the local subject color."""
    out = rgb.astype(np.float32)
    a = alpha.astype(np.float32) / 255.0
    edge = (a > 0.02) & (a < 0.9)
    if not edge.any():
        return rgb
    solid = (a >= 0.9).astype(np.float32)
    weights = ndimage.gaussian_filter(solid, sigma=3) + 1e-6
    for c in range(3):
        local = ndimage.gaussian_filter(out[:, :, c] * solid, sigma=3) / weights
        mix = 1.0 - a  # the more transparent, the more we replace
        out[:, :, c] = np.where(edge, out[:, :, c] * (1 - mix) + local * mix, out[:, :, c])
    return np.clip(out, 0, 255).astype(np.uint8)


def crop_to_subject(rgba: np.ndarray, padding: int) -> np.ndarray:
    ys, xs = np.where(rgba[:, :, 3] > 8)
    if len(xs) == 0:
        return rgba
    y0 = max(0, ys.min() - padding)
    y1 = min(rgba.shape[0], ys.max() + padding + 1)
    x0 = max(0, xs.min() - padding)
    x1 = min(rgba.shape[1], xs.max() + padding + 1)
    return rgba[y0:y1, x0:x1]


def main():
    parser = argparse.ArgumentParser(description="Remove background from an image (Foody asset tool)")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--method", choices=["rembg", "checker"], default="rembg")
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--no-checker", action="store_true", help="Skip baked-in checkerboard cleanup")
    parser.add_argument("--padding", type=int, default=8)
    parser.add_argument("--erode", type=int, default=1)
    args = parser.parse_args()

    src = Path(args.input)
    if not src.exists():
        sys.exit(f"[remove_background] Input not found: {src}")

    img = Image.open(src).convert("RGB")
    rgb = np.array(img)

    if args.method == "rembg":
        alpha = rembg_alpha(img, args.model)
    else:
        alpha = np.full(rgb.shape[:2], 255, dtype=np.uint8)

    if not args.no_checker:
        bg = checkerboard_background_mask(rgb)
        alpha = np.where(bg, 0, alpha).astype(np.uint8)

    alpha = keep_largest_component(alpha)
    alpha = refine_alpha(alpha, erode_px=args.erode)
    rgb_clean = despill(rgb, alpha)

    rgba = np.dstack([rgb_clean, alpha])
    rgba = crop_to_subject(rgba, args.padding)

    dst = Path(args.output)
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(dst, optimize=True)
    print(f"[remove_background] Saved {dst} ({rgba.shape[1]}x{rgba.shape[0]})")


if __name__ == "__main__":
    main()
