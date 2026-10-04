"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArcType,
  BoundingSphere,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  EllipsoidTerrainProvider,
  HeadingPitchRange,
  ImageryLayer,
  Ion,
  LabelStyle,
  Math as CesiumMath,
  TileMapServiceImageryProvider,
  buildModuleUrl,
  type Entity,
} from "cesium";
import { useCesium, Viewer } from "resium";
import { VerifyLink } from "@/components/VerifyLink";
import { DEMO_ENCOUNTER_NORAD, DEMO_NORAD } from "@/lib/constants";
import { formatCountdown, countdownClockMs } from "@/lib/countdown";
import type { TrackSample } from "@/lib/encounter";
import { subscribeFocusEncounter } from "@/lib/focus";
import { formatApproachTime } from "@/lib/time-format";
import { nearestSampleIndex } from "@/lib/tracks";
import type { RankedEvent } from "@/lib/types";

Ion.defaultAccessToken = "";

interface EncounterPayload {
  id: string;
  tca: string;
  socratesRangeKm: number;
  tracks: { ours: TrackSample[]; other: TrackSample[] };
  note: string | null;
  error?: string;
}

function formatRange(km: number): string {
  const meters = km * 1000;
  if (meters < 10_000) return `${Math.round(meters).toLocaleString()} m`;
  return `${km.toFixed(2)} km`;
}

function approachFor(event: RankedEvent | null, evaluatedAt: string | null) {
  if (!event || !evaluatedAt) return null;
  const now = new Date(evaluatedAt);
  if (Number.isNaN(now.getTime())) return null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return formatApproachTime(event.tca, zone, now);
}

function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toCartesian(sample: TrackSample): Cartesian3 {
  return Cartesian3.fromDegrees(sample.geodetic.lonDeg, sample.geodetic.latDeg, sample.geodetic.altKm * 1000);
}

function IdleCamera() {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.entities.removeAll();
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(8, 20, 20_000_000),
      duration: reducedMotion() ? 0 : 1.2,
    });
  }, [viewer]);

  return null;
}

function EncounterScene({
  ours,
  other,
  index,
  tcaIndex,
  labelRef,
  flyToken,
  onFlown,
}: {
  ours: TrackSample[];
  other: TrackSample[];
  index: number;
  tcaIndex: number;
  labelRef: { current: string };
  flyToken: number;
  onFlown?: () => void;
}) {
  const { viewer } = useCesium();
  const dots = useRef<{ ours: Entity | null; other: Entity | null }>({ ours: null, other: null });
  const onFlownRef = useRef(onFlown);
  onFlownRef.current = onFlown;

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return undefined;
    void flyToken;
    const scene = viewer;
    scene.entities.removeAll();
    scene.terrainProvider = new EllipsoidTerrainProvider();
    scene.scene.globe.enableLighting = false;

    const oursPositions = ours.map(toCartesian);
    const otherPositions = other.map(toCartesian);
    scene.entities.add({
      polyline: {
        positions: oursPositions,
        width: 2.5,
        material: Color.fromCssColorString("#79d6cb"),
        arcType: ArcType.NONE,
      },
    });
    scene.entities.add({
      polyline: {
        positions: otherPositions,
        width: 2.5,
        material: Color.fromCssColorString("#ff5d6c"),
        arcType: ArcType.NONE,
      },
    });
    const tcaSample = ours[tcaIndex] ?? ours[0];
    if (tcaSample) {
      scene.entities.add({
        position: toCartesian(tcaSample),
        point: {
          pixelSize: reducedMotion()
            ? 12
            : new CallbackProperty(() => 8 + 7 * Math.abs(Math.sin(Date.now() / 280)), false),
          color: Color.WHITE,
          outlineColor: Color.fromCssColorString("#79d6cb"),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: new CallbackProperty(() => labelRef.current, false),
          font: "bold 16px sans-serif",
          pixelOffset: new Cartesian2(0, -36),
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("#07131a").withAlpha(0.92),
          backgroundPadding: new Cartesian2(10, 6),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }

    const anchor = ours[tcaIndex] ?? ours[0];
    const otherAnchor = other[Math.min(tcaIndex, other.length - 1)] ?? other[0];
    dots.current.ours = anchor
      ? scene.entities.add({
          position: toCartesian(anchor),
          point: {
            pixelSize: 11,
            color: Color.fromCssColorString("#79d6cb"),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      : null;
    dots.current.other = otherAnchor
      ? scene.entities.add({
          position: toCartesian(otherAnchor),
          point: {
            pixelSize: 11,
            color: Color.fromCssColorString("#ff5d6c"),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      : null;

    const sphere = BoundingSphere.fromPoints([...oursPositions, ...otherPositions]);
    scene.camera.flyToBoundingSphere(sphere, {
      duration: reducedMotion() ? 0 : 1.8,
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-40), Math.max(sphere.radius * 1.7, 1_600_000)),
      complete: () => onFlownRef.current?.(),
    });
    const flownBackup = window.setTimeout(() => onFlownRef.current?.(), 2200);

    return () => {
      window.clearTimeout(flownBackup);
      dots.current = { ours: null, other: null };
      if (!scene.isDestroyed()) scene.entities.removeAll();
    };
  }, [viewer, ours, other, tcaIndex, flyToken, labelRef]);

  useEffect(() => {
    const oursSample = ours[Math.min(index, ours.length - 1)];
    const otherSample = other[Math.min(index, other.length - 1)];
    if (dots.current.ours && oursSample) {
      dots.current.ours.position = new ConstantPositionProperty(toCartesian(oursSample));
    }
    if (dots.current.other && otherSample) {
      dots.current.other.position = new ConstantPositionProperty(toCartesian(otherSample));
    }
  }, [index, ours, other]);

  return null;
}

export default function CesiumGlobe({
  event,
  evaluatedAt,
  startedAt,
  onDemoFlown,
}: {
  event: RankedEvent | null;
  evaluatedAt: string | null;
  startedAt: number | null;
  onDemoFlown?: () => void;
}) {
  const [baseLayer, setBaseLayer] = useState<ImageryLayer | null>(null);
  const [encounter, setEncounter] = useState<EncounterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [flyToken, setFlyToken] = useState(0);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderPending, setRenderPending] = useState(false);
  const [tick, setTick] = useState<number | null>(null);
  const labelRef = useRef("");
  const onFlownRef = useRef(onDemoFlown);
  onFlownRef.current = onDemoFlown;
  const terrainProvider = useMemo(() => new EllipsoidTerrainProvider(), []);

  useEffect(() => {
    return subscribeFocusEncounter((id) => {
      if (event?.id === id) setFlyToken((value) => value + 1);
    });
  }, [event?.id]);

  useEffect(() => {
    if (!event) {
      setRenderUrl(null);
      setRenderPending(false);
      return undefined;
    }
    const controller = new AbortController();
    setRenderUrl(null);
    setRenderPending(true);
    fetch(`/api/imagine/${encodeURIComponent(event.id)}`, { signal: controller.signal })
      .then(async (response) => (await response.json()) as { url?: string })
      .then((body) => {
        setRenderUrl(typeof body.url === "string" ? body.url : null);
        setRenderPending(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setRenderUrl("/renders/swisscube-sl8deb.jpg");
        setRenderPending(false);
      });
    return () => controller.abort();
  }, [event]);

  useEffect(() => {
    const moduleUrl = buildModuleUrl as typeof buildModuleUrl & { setBaseUrl?: (value: string) => void };
    moduleUrl.setBaseUrl?.("/cesium/");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/cesium/Widgets/widgets.css";
    document.head.appendChild(link);
    setBaseLayer(
      ImageryLayer.fromProviderAsync(
        TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII")),
      ),
    );
    return () => link.remove();
  }, []);

  useEffect(() => {
    if (!event) {
      setEncounter(null);
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/encounter/${encodeURIComponent(event.id)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as EncounterPayload;
        if (!response.ok) throw new Error(body.error ?? `Encounter failed (${response.status})`);
        return body;
      })
      .then((body) => {
        setEncounter(body);
        setIndex(nearestSampleIndex(body.tracks.ours, body.tca));
        setPlaying(true);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setEncounter(null);
        setError(cause instanceof Error ? cause.message : "Could not load this encounter");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [event]);

  useEffect(() => {
    if (!playing || !encounter) return undefined;
    const count = encounter.tracks.ours.length;
    if (count === 0) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 120);
    return () => window.clearInterval(timer);
  }, [playing, encounter]);

  const sampleCount = encounter?.tracks.ours.length ?? 0;
  const currentTime = encounter?.tracks.ours[index]?.t;
  const tcaIndex = encounter ? nearestSampleIndex(encounter.tracks.ours, encounter.tca) : 0;
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    setTick(Date.now());
    return () => window.clearInterval(id);
  }, []);

  const approach = approachFor(event, evaluatedAt);
  const remaining =
    event && evaluatedAt && tick !== null && startedAt !== null
      ? formatCountdown(
          Date.parse(event.tca),
          countdownClockMs(Date.parse(event.tca), tick, Date.parse(evaluatedAt), tick - startedAt),
        )
      : "";
  const label = event
    ? `${event.other.name}\n${formatRange(event.rangeKm)} · ${event.relSpeedKms.toFixed(3)} km/s${
        approach ? `\n${approach.label}` : ""
      }${remaining ? `\n${remaining}` : ""}`
    : "";
  labelRef.current = label;
  const demoPair = event?.ours.noradId === DEMO_NORAD && event?.other.noradId === DEMO_ENCOUNTER_NORAD;
  const notifyFlown = () => {
    if (demoPair) onFlownRef.current?.();
  };

  return (
    <section className="relative flex h-full min-h-[320px] flex-col border-edge bg-panel md:border-x">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">Encounter globe</h2>
        <span className="font-mono text-[11px] text-muted">
          {event ? `${event.ours.name} · ${event.other.name}` : "Natural Earth"}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        {baseLayer ? (
          <Viewer
            full
            baseLayer={baseLayer}
            terrainProvider={terrainProvider}
            baseLayerPicker={false}
            animation={false}
            timeline={false}
            geocoder={false}
            homeButton={false}
            sceneModePicker={false}
            navigationHelpButton={false}
            infoBox={false}
            selectionIndicator={false}
            fullscreenButton={false}
            className="orbit-cesium"
          >
            {error && <IdleCamera />}
            {encounter && event && (
              <EncounterScene
                ours={encounter.tracks.ours}
                other={encounter.tracks.other}
                index={index}
                tcaIndex={tcaIndex}
                labelRef={labelRef}
                flyToken={flyToken}
                onFlown={notifyFlown}
              />
            )}
          </Viewer>
        ) : (
          <p className="px-4 py-6 text-sm text-muted">Loading globe…</p>
        )}
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1 text-[11px]">
          <span className="text-accent">cyan · ours</span>
          <span className="text-act">red · other object</span>
          {event && encounter && (
            <span className="mt-1 rounded bg-background/90 px-2 py-1 font-mono text-xs leading-snug text-foreground">
              <span className="block">{event.tier}</span>
              {approach ? (
                <>
                  <span className="block">{approach.label}</span>
                  <span className="block text-[10px] text-muted">{approach.utc}</span>
                </>
              ) : (
                <span className="block">TCA</span>
              )}
              <span className="block">
                {formatRange(event.rangeKm)} · {event.relSpeedKms.toFixed(3)} km/s
              </span>
              {remaining && <span className="block text-muted">{remaining}</span>}
              <span className="pointer-events-auto mt-1 block">
                <VerifyLink norad={event.ours.noradId} />
              </span>
            </span>
          )}
        </div>
        {renderPending && (
          <p className="absolute top-3 right-3 z-10 w-44 rounded border border-edge bg-background/90 px-2 py-3 text-[11px] text-muted sm:w-56">
            Generating render…
          </p>
        )}
        {renderUrl && !renderPending && (
          <figure className="pointer-events-none absolute top-3 right-3 z-10 w-44 sm:w-56">
            <Image
              src={renderUrl}
              alt="Artist's rendering of the selected encounter"
              width={448}
              height={252}
              unoptimized
              className="aspect-video w-full rounded border border-edge object-cover shadow-lg"
            />
            <figcaption className="mt-1 rounded bg-background/90 px-2 py-1 text-[10px] leading-snug text-muted">
              Artist&apos;s rendering from real orbital data. Not a photograph.
            </figcaption>
          </figure>
        )}
        {(loading || error || !event) && (
          <p className="absolute right-3 bottom-16 left-3 rounded bg-background/80 px-3 py-2 text-xs text-muted">
            {error ?? (loading ? "Propagating the encounter…" : "Select a warning to fly there.")}
          </p>
        )}
        {encounter && (
          <div className="absolute right-3 bottom-8 left-3 z-10 flex items-center gap-2 rounded border border-edge bg-background/85 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              className="rounded border border-edge px-2 py-0.5 text-[11px] text-foreground"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              aria-label="Encounter time"
              type="range"
              min={0}
              max={Math.max(sampleCount - 1, 0)}
              value={Math.min(index, Math.max(sampleCount - 1, 0))}
              onChange={(change) => {
                setPlaying(false);
                setIndex(Number(change.target.value));
              }}
              className="min-w-0 flex-1"
            />
            <span className="shrink-0 font-mono text-[10px] text-muted">
              {currentTime ? formatLocal(currentTime) : ""}
            </span>
          </div>
        )}
        {encounter?.note && (
          <p className="absolute right-3 bottom-1 left-3 truncate text-[10px] text-muted">{encounter.note}</p>
        )}
      </div>
    </section>
  );
}
