"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  checkIn, checkOut, getGates, getVisits, raiseAlert, verifyCard, verifyPass,
} from "@/lib/services/securityService";
import type { CardVerdict, GateRow, PassVerdict, Visit } from "@/lib/models/security";
import { timeOf } from "./SecurityModule";

/**
 * The gate console — the one screen a guard works from.
 *
 * Scan a pass, check a card, admit, release, report. It is built around the fact
 * that the person using it is standing up, at night, with someone waiting: the
 * verdict is large and colour-coded, the admit button only appears when the
 * server said yes, and the emergency control is always in reach.
 */
export function GateConsole({ propertyId }: { propertyId: string | null }) {
  const { canAt } = useSession();
  const [gates, setGates] = useState<GateRow[]>([]);
  const [gateId, setGateId] = useState<string>("");
  const [code, setCode] = useState("");
  const [verdict, setVerdict] = useState<PassVerdict | null>(null);
  const [cardVerdict, setCardVerdict] = useState<CardVerdict | null>(null);
  const [onSite, setOnSite] = useState<Visit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadVisits = useCallback(async () => {
    const res = await getVisits({ status: "ON_SITE", propertyId });
    if (res.data) setOnSite(res.data.visits);
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    getGates(propertyId).then((res) => {
      if (res.data) {
        setGates(res.data.gates);
        setGateId((current) => current || res.data.gates[0]?.id || "");
      }
    });
    loadVisits();
  }, [propertyId, loadVisits]);

  async function onVerifyPass(raw?: string) {
    const value = (raw ?? code).trim();
    if (!value) return;
    setBusy(true);
    setCardVerdict(null);
    const res = await verifyPass(value, gateId || undefined);
    setBusy(false);
    if (res.error) { setMessage(res.error.message); return; }
    setVerdict(res.data);
  }

  async function onVerifyCard() {
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    setVerdict(null);
    const res = await verifyCard(value, gateId || undefined);
    setBusy(false);
    if (res.error) { setMessage(res.error.message); return; }
    setCardVerdict(res.data);
  }

  async function admit() {
    if (!verdict?.invitation) return;
    setBusy(true);
    const res = await checkIn({ invitationId: verdict.invitation.id, gateId: gateId || undefined });
    setBusy(false);
    if (res.error) { setMessage(res.error.message); return; }
    setMessage(`${verdict.invitation.visitorName} checked in.`);
    setVerdict(null);
    setCode("");
    loadVisits();
  }

  async function release(visit: Visit) {
    setBusy(true);
    const res = await checkOut(visit.id, gateId || undefined);
    setBusy(false);
    if (res.error) { setMessage(res.error.message); return; }
    setMessage(`${visit.visitorName} checked out.`);
    loadVisits();
  }

  return (
    <div className="gate">
      <div className="gate-main">
        <div className="gate-controls">
          {gates.length > 0 && (
            <label className="field inline">
              Gate
              <select value={gateId} onChange={(e) => setGateId(e.target.value)}>
                {gates.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          )}
          <QrScanner onScan={(value) => { setCode(value); onVerifyPass(value); }} />
        </div>

        <form
          className="gate-entry"
          onSubmit={(e) => { e.preventDefault(); onVerifyPass(); }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Pass code or card number"
            autoComplete="off"
            spellCheck={false}
            aria-label="Pass code or card number"
          />
          <button type="submit" disabled={busy || !code.trim()} className="btn primary">Check pass</button>
          {canAt(PERMISSIONS.CARD_VERIFY, propertyId) && (
            <button type="button" disabled={busy || !code.trim()} className="btn" onClick={onVerifyCard}>Check card</button>
          )}
        </form>

        {verdict && (
          <div className={`verdict ${verdict.result === "GRANTED" ? "granted" : "denied"}`}>
            <div className="verdict-head">
              <b>{verdict.result === "GRANTED" ? "ADMIT" : "DO NOT ADMIT"}</b>
              {verdict.reason && <span>{verdict.reason}</span>}
            </div>
            {verdict.invitation && (
              <dl className="verdict-detail">
                <div><dt>Visitor</dt><dd>{verdict.invitation.visitorName}</dd></div>
                <div><dt>Type</dt><dd>{humanType(verdict.invitation.visitorType)}</dd></div>
                <div><dt>Visiting</dt><dd>{verdict.invitation.unitName}</dd></div>
                {verdict.invitation.hostName && <div><dt>Host</dt><dd>{verdict.invitation.hostName}</dd></div>}
                {verdict.invitation.purpose && <div><dt>Purpose</dt><dd>{verdict.invitation.purpose}</dd></div>}
                {verdict.invitation.vehiclePlate && <div><dt>Vehicle</dt><dd>{verdict.invitation.vehiclePlate}</dd></div>}
                <div><dt>Uses left</dt><dd>{verdict.invitation.usesLeft}</dd></div>
              </dl>
            )}
            {verdict.result === "GRANTED" && canAt(PERMISSIONS.VISITOR_CHECKIN, propertyId) && (
              <button className="btn primary big" onClick={admit} disabled={busy}>Check in</button>
            )}
          </div>
        )}

        {cardVerdict && (
          <div className={`verdict ${cardVerdict.result === "GRANTED" ? "granted" : "denied"}`}>
            <div className="verdict-head">
              <b>{cardVerdict.result === "GRANTED" ? "CARD VALID" : "CARD REFUSED"}</b>
              {cardVerdict.reason && <span>{cardVerdict.reason}</span>}
            </div>
            {cardVerdict.card && (
              <dl className="verdict-detail">
                <div><dt>Holder</dt><dd>{cardVerdict.card.holderName}</dd></div>
                <div><dt>Card</dt><dd>{cardVerdict.card.cardNumber}</dd></div>
                <div><dt>Unit</dt><dd>{cardVerdict.card.unitName ?? "—"}</dd></div>
                <div><dt>Zones</dt><dd>{cardVerdict.card.accessZones.join(", ") || "—"}</dd></div>
              </dl>
            )}
          </div>
        )}

        {message && <div className="flash" onAnimationEnd={() => setMessage(null)}>{message}</div>}
      </div>

      <aside className="gate-side">
        <h3 className="panel-title">On site now <span className="count">{onSite.length}</span></h3>
        <div className="onsite-list">
          {onSite.map((v) => (
            <div key={v.id} className="onsite">
              <div>
                <b>{v.visitorName}</b>
                <span>{v.unitName ?? "—"} · in {timeOf(v.checkInAt)}</span>
              </div>
              {canAt(PERMISSIONS.VISITOR_CHECKOUT, propertyId) && (
                <button className="btn small" onClick={() => release(v)} disabled={busy}>Check out</button>
              )}
            </div>
          ))}
          {onSite.length === 0 && <p className="muted">Nobody is signed in at the moment.</p>}
        </div>

        {canAt(PERMISSIONS.SECURITY_EMERGENCY_RAISE, propertyId) && propertyId && (
          <EmergencyControl propertyId={propertyId} onRaised={(m) => setMessage(m)} />
        )}
      </aside>
    </div>
  );
}

/**
 * Camera scanning through the browser's built-in BarcodeDetector where it
 * exists, and an honest "type the code" message where it does not. A scanner
 * that silently fails is worse at a gate than no scanner at all.
 */
function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setOpen(true);
      // The element mounts with `open`, so wait a tick before attaching.
      requestAnimationFrame(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
        scanLoop();
      });
    } catch {
      setError("Camera unavailable — type the code instead.");
    }
  }

  async function scanLoop() {
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!Detector || !videoRef.current) return;
    const detector = new Detector({ formats: ["qr_code"] });

    const tick = async () => {
      if (!streamRef.current || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          onScan(codes[0].rawValue);
          stop();
          return;
        }
      } catch {
        // A frame that cannot be decoded is normal; keep going.
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  if (supported === false) {
    return <span className="scanner-note">Scanning needs a camera-capable browser — type the code below.</span>;
  }

  return (
    <>
      <button type="button" className="btn" onClick={open ? stop : start}>
        {open ? "Stop camera" : "Scan QR pass"}
      </button>
      {error && <span className="scanner-note">{error}</span>}
      {open && (
        <div className="scanner">
          <video ref={videoRef} muted playsInline />
          <span>Point at the visitor&apos;s pass</span>
        </div>
      )}
    </>
  );
}

const ALERT_TYPES = ["PANIC", "FIRE", "MEDICAL", "INTRUSION", "EVACUATION"] as const;

function EmergencyControl({ propertyId, onRaised }: { propertyId: string; onRaised: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("PANIC");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function raise() {
    setBusy(true);
    const res = await raiseAlert({ propertyId, type, location: location.trim() || undefined });
    setBusy(false);
    if (res.error) { onRaised(res.error.message); return; }
    onRaised(`${type} alert raised.`);
    setOpen(false);
    setLocation("");
  }

  return (
    <div className="emergency">
      {!open ? (
        <button className="btn danger big" onClick={() => setOpen(true)}>Raise emergency</button>
      ) : (
        <div className="emergency-form">
          <label className="field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {ALERT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            Location
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Block A, 3rd floor" />
          </label>
          <div className="row">
            <button className="btn danger" onClick={raise} disabled={busy}>Raise now</button>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function humanType(t: string): string {
  return t.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
