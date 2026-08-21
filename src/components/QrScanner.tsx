"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/i18n/t";

/**
 * Camera QR scanner for the player view (audit spec 23 §2).
 *
 * - Camera permission is requested only after the user presses the button.
 * - Prefers the rear (environment) camera.
 * - Shows a live preview and decodes locally with the native BarcodeDetector
 *   API — no frame is ever uploaded, only the decoded token reaches `onScan`.
 * - Media tracks are stopped on success, cancel, and unmount.
 */

/** Scenario token contract (spec 23 §2.3): base64url/word token, 8–128 chars. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** Optional versioned app URI form (spec 23 §2.3): `tsf://scan/<token>`. */
const APP_URI_PATTERN = /^tsf:\/\/scan\/([A-Za-z0-9_-]{8,128})$/i;

/** Window event used by E2E tests to inject a decoded token (spec 23 §2.5). */
export const QR_SIMULATE_EVENT = "tsf:qr-simulate";

/**
 * Test hook: dispatches the window event this scanner listens for, so E2E
 * suites can trigger a deterministic scan without camera hardware.
 */
export function __simulateScanForTests(token: string): void {
  window.dispatchEvent(new CustomEvent(QR_SIMULATE_EVENT, { detail: token }));
}

/** Extract a token from a raw QR payload. URLs and foreign payloads are rejected. */
export function parseQrPayload(raw: string): string | null {
  const value = raw.trim();
  if (TOKEN_PATTERN.test(value)) return value;
  const uri = APP_URI_PATTERN.exec(value);
  return uri ? uri[1] : null;
}

// Native `BarcodeDetector` is not yet in lib.dom.d.ts — minimal typings.
interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource | Blob): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

type ScannerStatus = "idle" | "requesting" | "scanning" | "success" | "error";
type ScannerError = "unsupported" | "camera";

interface QrScannerProps {
  onScan: (token: string) => Promise<void> | void;
}

export default function QrScanner({ onScan }: QrScannerProps) {
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [error, setError] = useState<ScannerError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const firedRef = useRef(false);
  const detectingRef = useRef(false);
  const lastNoticeAtRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /** Stop everything and hand the token to the parent exactly once. */
  const handleToken = useCallback(
    (token: string) => {
      if (firedRef.current) return;
      firedRef.current = true;
      stop();
      setNotice(null);
      setStatus("success");
      try {
        const result = onScanRef.current(token);
        if (result instanceof Promise) {
          void result.catch(() => {
            // The parent surfaces the failure — hand the button back.
            firedRef.current = false;
            setStatus("idle");
          });
        }
      } catch {
        firedRef.current = false;
        setStatus("idle");
      }
    },
    [stop],
  );

  /** Surface a transient "unrecognized code" notice without stopping. */
  const flagUnrecognized = useCallback(() => {
    const now = Date.now();
    if (now - lastNoticeAtRef.current < 2500) return;
    lastNoticeAtRef.current = now;
    setNotice(t("scanner.unrecognized"));
  }, []);

  const detectFrame = useCallback(async () => {
    if (detectingRef.current || !activeRef.current) return;
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || video.readyState < 2) return;
    detectingRef.current = true;
    try {
      const results = await detector.detect(video);
      for (const result of results) {
        if (result.format !== "qr_code") continue;
        const token = parseQrPayload(result.rawValue);
        if (token) {
          handleToken(token);
          return;
        }
        flagUnrecognized();
      }
    } catch {
      // BarcodeDetector can throw transiently — retry on the next frame.
    } finally {
      detectingRef.current = false;
    }
  }, [flagUnrecognized, handleToken]);

  // Attach the stream to the preview and run the decode loop while scanning.
  useEffect(() => {
    if (status !== "scanning") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      stop();
      setError("camera");
      setStatus("error");
    });
    const loop = () => {
      void detectFrame();
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status, stop, detectFrame]);

  // Success is brief — return to idle so another code can be scanned.
  useEffect(() => {
    if (status !== "success") return;
    const timer = window.setTimeout(() => {
      firedRef.current = false;
      setStatus("idle");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [status]);

  // Test hook: accept tokens injected via the `tsf:qr-simulate` window event.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail !== "string") return;
      const token = parseQrPayload(detail);
      if (token) handleToken(token);
    };
    window.addEventListener(QR_SIMULATE_EVENT, handler);
    return () => window.removeEventListener(QR_SIMULATE_EVENT, handler);
  }, [handleToken]);

  // Stop all media tracks on unmount.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const start = useCallback(async () => {
    if (status === "requesting" || status === "scanning") return;
    setError(null);
    setNotice(null);
    const Ctor = window.BarcodeDetector;
    if (!Ctor) {
      setStatus("error");
      setError("unsupported");
      return;
    }
    let detector: BarcodeDetectorInstance;
    try {
      detector = new Ctor({ formats: ["qr_code"] });
    } catch {
      setStatus("error");
      setError("unsupported");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("camera");
      return;
    }
    setStatus("requesting");
    activeRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!activeRef.current) {
        // Cancelled while the permission prompt was open.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      detectorRef.current = detector;
      streamRef.current = stream;
      setStatus("scanning");
    } catch {
      if (!activeRef.current) return; // Cancelled while awaiting permission.
      setStatus("error");
      setError("camera");
    }
  }, [status]);

  const cancel = useCallback(() => {
    stop();
    setNotice(null);
    setStatus("idle");
  }, [stop]);

  return (
    <div>
      {status === "idle" && (
        <button
          type="button"
          onClick={() => void start()}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20"
        >
          {t("scanner.scanButton")}
        </button>
      )}

      {status === "requesting" && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-meta text-ink-muted">
            {t("scanner.scanning")}
          </p>
          <button
            type="button"
            onClick={cancel}
            className="min-h-11 rounded-xl border border-line bg-card-soft px-4 text-ink-secondary transition-colors hover:border-danger/40 hover:text-ink-primary"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      {status === "scanning" && (
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-xl border border-line bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label={t("scanner.preview")}
              className="aspect-video w-full object-cover"
            />
          </div>
          <p role="status" className="text-meta text-ink-muted">
            {t("scanner.scanning")}
          </p>
          {notice && (
            <p
              role="status"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {notice}
            </p>
          )}
          <button
            type="button"
            onClick={cancel}
            className="min-h-11 rounded-xl border border-line bg-card-soft px-4 text-ink-secondary transition-colors hover:border-danger/40 hover:text-ink-primary"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      {status === "success" && (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
        >
          {t("scanner.success")}
        </p>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-2">
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {error === "unsupported"
              ? t("scanner.unsupported")
              : t("scanner.cameraUnavailable")}
          </p>
          <button
            type="button"
            onClick={() => void start()}
            className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
